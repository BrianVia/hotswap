import { ipcMain, nativeTheme, BrowserWindow, app } from 'electron';
import { ListTablesCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { QueryCommand, ScanCommand, PutCommand, UpdateCommand, DeleteCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { parseAwsConfig } from '../services/config-parser.js';
import { checkAuthStatus, loginWithSSO } from '../services/credential-manager.js';
import { getDynamoDBClient, getDynamoDBDocClient, clearClientsForProfile } from '../services/dynamo-client-factory.js';
import { buildQueryCommand, buildScanCommand, type ScanParams } from '../services/query-executor.js';
import { getUpdateStatus, checkForUpdates, quitAndInstall } from '../updater.js';
import type { TableInfo, KeySchemaElement, AttributeDefinition, GlobalSecondaryIndex, LocalSecondaryIndex, QueryParams, QueryResult, BatchQueryResult, QueryProgress } from '../types.js';

export function registerIpcHandlers(): void {
  // ============ Profile Operations ============
  
  ipcMain.handle('aws:get-profiles', async () => {
    try {
      const { profiles } = await parseAwsConfig();
      return profiles;
    } catch (error) {
      console.error('Failed to get profiles:', error);
      throw error;
    }
  });

  // ============ SSO Authentication ============
  
  ipcMain.handle('aws:check-auth-status', async (_event, profileName: string) => {
    try {
      return await checkAuthStatus(profileName);
    } catch (error) {
      console.error('Failed to check auth status:', error);
      return { authenticated: false, profileName };
    }
  });

  ipcMain.handle('aws:sso-login', async (_event, profileName: string) => {
    try {
      // Clear cached clients before re-auth
      clearClientsForProfile(profileName);
      return await loginWithSSO(profileName);
    } catch (error) {
      console.error('SSO login failed:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // ============ DynamoDB Operations ============
  
  ipcMain.handle('dynamo:list-tables', async (_event, profileName: string) => {
    try {
      const client = await getDynamoDBClient(profileName);
      const tables: string[] = [];
      let lastEvaluatedTableName: string | undefined;

      // Paginate through all tables
      do {
        const command = new ListTablesCommand({
          ExclusiveStartTableName: lastEvaluatedTableName,
          Limit: 100,
        });
        const response = await client.send(command);
        
        if (response.TableNames) {
          tables.push(...response.TableNames);
        }
        lastEvaluatedTableName = response.LastEvaluatedTableName;
      } while (lastEvaluatedTableName);

      // Sort alphabetically
      tables.sort((a, b) => a.localeCompare(b));
      
      return tables;
    } catch (error) {
      console.error('Failed to list tables:', error);
      throw error;
    }
  });

  ipcMain.handle('dynamo:describe-table', async (_event, profileName: string, tableName: string) => {
    try {
      const client = await getDynamoDBClient(profileName);
      const command = new DescribeTableCommand({ TableName: tableName });
      const response = await client.send(command);
      
      if (!response.Table) {
        throw new Error(`Table not found: ${tableName}`);
      }

      const table = response.Table;
      
      const tableInfo: TableInfo = {
        tableName: table.TableName || tableName,
        keySchema: (table.KeySchema || []).map(k => ({
          attributeName: k.AttributeName || '',
          keyType: k.KeyType as 'HASH' | 'RANGE',
        })),
        attributeDefinitions: (table.AttributeDefinitions || []).map(a => ({
          attributeName: a.AttributeName || '',
          attributeType: a.AttributeType as 'S' | 'N' | 'B',
        })),
        itemCount: table.ItemCount,
        tableSizeBytes: table.TableSizeBytes,
        tableStatus: table.TableStatus,
        globalSecondaryIndexes: table.GlobalSecondaryIndexes?.map(gsi => ({
          indexName: gsi.IndexName || '',
          keySchema: (gsi.KeySchema || []).map(k => ({
            attributeName: k.AttributeName || '',
            keyType: k.KeyType as 'HASH' | 'RANGE',
          })),
          projection: {
            projectionType: (gsi.Projection?.ProjectionType || 'ALL') as 'ALL' | 'KEYS_ONLY' | 'INCLUDE',
            nonKeyAttributes: gsi.Projection?.NonKeyAttributes,
          },
        })),
        localSecondaryIndexes: table.LocalSecondaryIndexes?.map(lsi => ({
          indexName: lsi.IndexName || '',
          keySchema: (lsi.KeySchema || []).map(k => ({
            attributeName: k.AttributeName || '',
            keyType: k.KeyType as 'HASH' | 'RANGE',
          })),
          projection: {
            projectionType: (lsi.Projection?.ProjectionType || 'ALL') as 'ALL' | 'KEYS_ONLY' | 'INCLUDE',
            nonKeyAttributes: lsi.Projection?.NonKeyAttributes,
          },
        })),
      };

      return tableInfo;
    } catch (error) {
      console.error('Failed to describe table:', error);
      throw error;
    }
  });

  // ============ DynamoDB Query/Scan Operations ============

  ipcMain.handle('dynamo:query', async (_event, profileName: string, params: QueryParams): Promise<QueryResult> => {
    try {
      const docClient = await getDynamoDBDocClient(profileName);
      const commandInput = buildQueryCommand(params);
      const command = new QueryCommand(commandInput);
      const response = await docClient.send(command);

      return {
        items: response.Items || [],
        lastEvaluatedKey: response.LastEvaluatedKey,
        count: response.Count || 0,
        scannedCount: response.ScannedCount || 0,
      };
    } catch (error) {
      console.error('Query failed:', error);
      throw error;
    }
  });

  ipcMain.handle('dynamo:scan', async (_event, profileName: string, params: ScanParams): Promise<QueryResult> => {
    try {
      const docClient = await getDynamoDBDocClient(profileName);
      const commandInput = buildScanCommand(params);
      const command = new ScanCommand(commandInput);
      const response = await docClient.send(command);

      return {
        items: response.Items || [],
        lastEvaluatedKey: response.LastEvaluatedKey,
        count: response.Count || 0,
        scannedCount: response.ScannedCount || 0,
      };
    } catch (error) {
      console.error('Scan failed:', error);
      throw error;
    }
  });

  // ============ Batch Query/Scan (with progress) ============

  const PROGRESS_THROTTLE_MS = 150;
  const cancelledQueries = new Set<string>();
  let queryIdCounter = 0;

  // Cancel a running query
  ipcMain.handle('dynamo:cancel-query', (_event, queryId: string) => {
    cancelledQueries.add(queryId);
    return { success: true };
  });

  ipcMain.handle('dynamo:query-batch', async (event, profileName: string, params: QueryParams, maxResults: number): Promise<BatchQueryResult> => {
    const queryId = `query-${++queryIdCounter}`;

    try {
      const docClient = await getDynamoDBDocClient(profileName);
      const allItems: Record<string, unknown>[] = [];
      let totalCount = 0;
      let totalScanned = 0;
      let lastKey: Record<string, unknown> | undefined = params.exclusiveStartKey;
      const startTime = Date.now();
      let lastProgressTime = 0;
      let pendingItems: Record<string, unknown>[] = []; // Items waiting to be sent

      // Send query ID to renderer so it can cancel
      event.sender.send('query-started', { queryId });

      while (allItems.length < maxResults) {
        // Check if cancelled
        if (cancelledQueries.has(queryId)) {
          cancelledQueries.delete(queryId);
          const elapsedMs = Date.now() - startTime;
          event.sender.send('query-progress', {
            count: allItems.length,
            scannedCount: totalScanned,
            elapsedMs,
            items: pendingItems,
            isComplete: true,
            cancelled: true,
          });
          return {
            items: allItems,
            lastEvaluatedKey: lastKey,
            count: totalCount,
            scannedCount: totalScanned,
            elapsedMs,
            cancelled: true,
          };
        }

        const commandInput = buildQueryCommand({ ...params, exclusiveStartKey: lastKey });
        const command = new QueryCommand(commandInput);
        const response = await docClient.send(command);

        const batchItems = response.Items || [];
        allItems.push(...batchItems);
        pendingItems.push(...batchItems);
        totalCount += response.Count || 0;
        totalScanned += response.ScannedCount || 0;
        lastKey = response.LastEvaluatedKey;

        // Push throttled progress with items to renderer
        const now = Date.now();
        if (now - lastProgressTime >= PROGRESS_THROTTLE_MS) {
          lastProgressTime = now;
          const progress: QueryProgress = {
            queryId,
            count: allItems.length,
            scannedCount: totalScanned,
            elapsedMs: now - startTime,
            items: pendingItems,
          };
          event.sender.send('query-progress', progress);
          pendingItems = []; // Reset pending items after sending
        }

        if (!lastKey) break;
      }

      // Send final progress with any remaining items and completion signal
      const elapsedMs = Date.now() - startTime;
      const finalProgress: QueryProgress = {
        queryId,
        count: allItems.length,
        scannedCount: totalScanned,
        elapsedMs,
        items: pendingItems,
        isComplete: true,
      };
      event.sender.send('query-progress', finalProgress);

      return {
        items: allItems,
        lastEvaluatedKey: lastKey,
        count: totalCount,
        scannedCount: totalScanned,
        elapsedMs,
      };
    } catch (error) {
      cancelledQueries.delete(queryId);
      console.error('Batch query failed:', error);
      throw error;
    }
  });

  ipcMain.handle('dynamo:scan-batch', async (event, profileName: string, params: ScanParams, maxResults: number): Promise<BatchQueryResult> => {
    const queryId = `scan-${++queryIdCounter}`;

    try {
      const docClient = await getDynamoDBDocClient(profileName);
      const allItems: Record<string, unknown>[] = [];
      let totalCount = 0;
      let totalScanned = 0;
      let lastKey: Record<string, unknown> | undefined = params.exclusiveStartKey;
      const startTime = Date.now();
      let lastProgressTime = 0;
      let pendingItems: Record<string, unknown>[] = []; // Items waiting to be sent

      // Send query ID to renderer so it can cancel
      event.sender.send('query-started', { queryId });

      while (allItems.length < maxResults) {
        // Check if cancelled
        if (cancelledQueries.has(queryId)) {
          cancelledQueries.delete(queryId);
          const elapsedMs = Date.now() - startTime;
          event.sender.send('query-progress', {
            count: allItems.length,
            scannedCount: totalScanned,
            elapsedMs,
            items: pendingItems,
            isComplete: true,
            cancelled: true,
          });
          return {
            items: allItems,
            lastEvaluatedKey: lastKey,
            count: totalCount,
            scannedCount: totalScanned,
            elapsedMs,
            cancelled: true,
          };
        }

        const commandInput = buildScanCommand({ ...params, exclusiveStartKey: lastKey });
        const command = new ScanCommand(commandInput);
        const response = await docClient.send(command);

        const batchItems = response.Items || [];
        allItems.push(...batchItems);
        pendingItems.push(...batchItems);
        totalCount += response.Count || 0;
        totalScanned += response.ScannedCount || 0;
        lastKey = response.LastEvaluatedKey;

        // Push throttled progress with items to renderer
        const now = Date.now();
        if (now - lastProgressTime >= PROGRESS_THROTTLE_MS) {
          lastProgressTime = now;
          const progress: QueryProgress = {
            queryId,
            count: allItems.length,
            scannedCount: totalScanned,
            elapsedMs: now - startTime,
            items: pendingItems,
          };
          event.sender.send('query-progress', progress);
          pendingItems = []; // Reset pending items after sending
        }

        if (!lastKey) break;
      }

      // Send final progress with any remaining items and completion signal
      const elapsedMs = Date.now() - startTime;
      const finalProgress: QueryProgress = {
        queryId,
        count: allItems.length,
        scannedCount: totalScanned,
        elapsedMs,
        items: pendingItems,
        isComplete: true,
      };
      event.sender.send('query-progress', finalProgress);

      return {
        items: allItems,
        lastEvaluatedKey: lastKey,
        count: totalCount,
        scannedCount: totalScanned,
        elapsedMs,
      };
    } catch (error) {
      cancelledQueries.delete(queryId);
      console.error('Batch scan failed:', error);
      throw error;
    }
  });

  // ============ DynamoDB Write Operations ============

  ipcMain.handle('dynamo:put-item', async (_event, profileName: string, tableName: string, item: Record<string, unknown>) => {
    try {
      const docClient = await getDynamoDBDocClient(profileName);
      await docClient.send(new PutCommand({ TableName: tableName, Item: item }));
      return { success: true };
    } catch (error) {
      console.error('Put item failed:', error);
      throw error;
    }
  });

  ipcMain.handle('dynamo:update-item', async (
    _event,
    profileName: string,
    tableName: string,
    key: Record<string, unknown>,
    updates: Record<string, unknown>
  ) => {
    try {
      const docClient = await getDynamoDBDocClient(profileName);

      // Build UpdateExpression from updates object
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, unknown> = {};
      const updateParts: string[] = [];

      Object.entries(updates).forEach(([field, value], index) => {
        const nameKey = `#field${index}`;
        const valueKey = `:val${index}`;
        expressionAttributeNames[nameKey] = field;
        expressionAttributeValues[valueKey] = value;
        updateParts.push(`${nameKey} = ${valueKey}`);
      });

      const updateExpression = `SET ${updateParts.join(', ')}`;

      await docClient.send(new UpdateCommand({
        TableName: tableName,
        Key: key,
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      }));

      return { success: true };
    } catch (error) {
      console.error('Update item failed:', error);
      throw error;
    }
  });

  ipcMain.handle('dynamo:delete-item', async (
    _event,
    profileName: string,
    tableName: string,
    key: Record<string, unknown>
  ) => {
    try {
      const docClient = await getDynamoDBDocClient(profileName);
      await docClient.send(new DeleteCommand({ TableName: tableName, Key: key }));
      return { success: true };
    } catch (error) {
      console.error('Delete item failed:', error);
      throw error;
    }
  });

  // Batch write operations (handles up to 100 operations, DynamoDB limit is 25 per request)
  interface BatchOperation {
    type: 'put' | 'delete' | 'pk-change';
    tableName: string;
    key?: Record<string, unknown>;
    item?: Record<string, unknown>;
    // For pk-change: oldKey + newItem
    oldKey?: Record<string, unknown>;
    newItem?: Record<string, unknown>;
  }

  ipcMain.handle('dynamo:batch-write', async (
    event,
    profileName: string,
    operations: BatchOperation[]
  ): Promise<{ success: boolean; processed: number; errors: string[] }> => {
    try {
      const docClient = await getDynamoDBDocClient(profileName);
      const errors: string[] = [];
      let processed = 0;

      // Process PK changes as transactions (delete old + put new atomically)
      const pkChanges = operations.filter(op => op.type === 'pk-change');
      for (const op of pkChanges) {
        if (!op.oldKey || !op.newItem) continue;
        try {
          await docClient.send(new TransactWriteCommand({
            TransactItems: [
              {
                Delete: {
                  TableName: op.tableName,
                  Key: op.oldKey,
                },
              },
              {
                Put: {
                  TableName: op.tableName,
                  Item: op.newItem,
                },
              },
            ],
          }));
          processed++;
        } catch (err) {
          errors.push(`PK change failed: ${(err as Error).message}`);
        }
      }

      // Process regular puts and deletes in batches of 25
      const regularOps = operations.filter(op => op.type !== 'pk-change');
      const BATCH_SIZE = 25;

      for (let i = 0; i < regularOps.length; i += BATCH_SIZE) {
        const batch = regularOps.slice(i, i + BATCH_SIZE);

        // Group by table
        const requestsByTable: Record<string, Array<{ PutRequest?: { Item: Record<string, unknown> }; DeleteRequest?: { Key: Record<string, unknown> } }>> = {};

        for (const op of batch) {
          if (!requestsByTable[op.tableName]) {
            requestsByTable[op.tableName] = [];
          }

          if (op.type === 'put' && op.item) {
            requestsByTable[op.tableName].push({
              PutRequest: { Item: op.item },
            });
          } else if (op.type === 'delete' && op.key) {
            requestsByTable[op.tableName].push({
              DeleteRequest: { Key: op.key },
            });
          }
        }

        // Execute batch write for each table
        for (const [tableName, requests] of Object.entries(requestsByTable)) {
          if (requests.length === 0) continue;

          try {
            // Use BatchWriteItem via individual operations since lib-dynamodb doesn't have BatchWriteCommand
            // We'll do individual operations for simplicity
            for (const req of requests) {
              if (req.PutRequest) {
                await docClient.send(new PutCommand({
                  TableName: tableName,
                  Item: req.PutRequest.Item,
                }));
              } else if (req.DeleteRequest) {
                await docClient.send(new DeleteCommand({
                  TableName: tableName,
                  Key: req.DeleteRequest.Key,
                }));
              }
              processed++;
            }
          } catch (err) {
            errors.push(`Batch operation failed for ${tableName}: ${(err as Error).message}`);
          }
        }

        // Send progress
        event.sender.send('write-progress', {
          processed,
          total: operations.length,
        });
      }

      return { success: errors.length === 0, processed, errors };
    } catch (error) {
      console.error('Batch write failed:', error);
      throw error;
    }
  });

  // ============ System ============

  ipcMain.handle('system:get-theme', () => {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  });

  // Listen for theme changes and notify renderer
  nativeTheme.on('updated', () => {
    const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    BrowserWindow.getAllWindows().forEach(window => {
      window.webContents.send('system:theme-changed', theme);
    });
  });

  // ============ Auto-Update ============

  ipcMain.handle('updater:get-status', () => {
    return getUpdateStatus();
  });

  ipcMain.handle('updater:check', () => {
    checkForUpdates();
  });

  ipcMain.handle('updater:quit-and-install', () => {
    quitAndInstall();
  });

  ipcMain.handle('app:get-version', () => {
    return app.getVersion();
  });
}
