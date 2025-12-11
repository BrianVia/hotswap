import { ipcMain, nativeTheme, BrowserWindow } from 'electron';
import { ListTablesCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { parseAwsConfig } from '../services/config-parser.js';
import { checkAuthStatus, loginWithSSO } from '../services/credential-manager.js';
import { getDynamoDBClient, getDynamoDBDocClient, clearClientsForProfile } from '../services/dynamo-client-factory.js';
import { buildQueryCommand, buildScanCommand } from '../services/query-executor.js';
export function registerIpcHandlers() {
    // ============ Profile Operations ============
    ipcMain.handle('aws:get-profiles', async () => {
        try {
            const { profiles } = await parseAwsConfig();
            return profiles;
        }
        catch (error) {
            console.error('Failed to get profiles:', error);
            throw error;
        }
    });
    // ============ SSO Authentication ============
    ipcMain.handle('aws:check-auth-status', async (_event, profileName) => {
        try {
            return await checkAuthStatus(profileName);
        }
        catch (error) {
            console.error('Failed to check auth status:', error);
            return { authenticated: false, profileName };
        }
    });
    ipcMain.handle('aws:sso-login', async (_event, profileName) => {
        try {
            // Clear cached clients before re-auth
            clearClientsForProfile(profileName);
            return await loginWithSSO(profileName);
        }
        catch (error) {
            console.error('SSO login failed:', error);
            return { success: false, error: error.message };
        }
    });
    // ============ DynamoDB Operations ============
    ipcMain.handle('dynamo:list-tables', async (_event, profileName) => {
        try {
            const client = await getDynamoDBClient(profileName);
            const tables = [];
            let lastEvaluatedTableName;
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
        }
        catch (error) {
            console.error('Failed to list tables:', error);
            throw error;
        }
    });
    ipcMain.handle('dynamo:describe-table', async (_event, profileName, tableName) => {
        try {
            const client = await getDynamoDBClient(profileName);
            const command = new DescribeTableCommand({ TableName: tableName });
            const response = await client.send(command);
            if (!response.Table) {
                throw new Error(`Table not found: ${tableName}`);
            }
            const table = response.Table;
            const tableInfo = {
                tableName: table.TableName || tableName,
                keySchema: (table.KeySchema || []).map(k => ({
                    attributeName: k.AttributeName || '',
                    keyType: k.KeyType,
                })),
                attributeDefinitions: (table.AttributeDefinitions || []).map(a => ({
                    attributeName: a.AttributeName || '',
                    attributeType: a.AttributeType,
                })),
                itemCount: table.ItemCount,
                tableSizeBytes: table.TableSizeBytes,
                tableStatus: table.TableStatus,
                globalSecondaryIndexes: table.GlobalSecondaryIndexes?.map(gsi => ({
                    indexName: gsi.IndexName || '',
                    keySchema: (gsi.KeySchema || []).map(k => ({
                        attributeName: k.AttributeName || '',
                        keyType: k.KeyType,
                    })),
                    projection: {
                        projectionType: (gsi.Projection?.ProjectionType || 'ALL'),
                        nonKeyAttributes: gsi.Projection?.NonKeyAttributes,
                    },
                })),
                localSecondaryIndexes: table.LocalSecondaryIndexes?.map(lsi => ({
                    indexName: lsi.IndexName || '',
                    keySchema: (lsi.KeySchema || []).map(k => ({
                        attributeName: k.AttributeName || '',
                        keyType: k.KeyType,
                    })),
                    projection: {
                        projectionType: (lsi.Projection?.ProjectionType || 'ALL'),
                        nonKeyAttributes: lsi.Projection?.NonKeyAttributes,
                    },
                })),
            };
            return tableInfo;
        }
        catch (error) {
            console.error('Failed to describe table:', error);
            throw error;
        }
    });
    // ============ DynamoDB Query/Scan Operations ============
    ipcMain.handle('dynamo:query', async (_event, profileName, params) => {
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
        }
        catch (error) {
            console.error('Query failed:', error);
            throw error;
        }
    });
    ipcMain.handle('dynamo:scan', async (_event, profileName, params) => {
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
        }
        catch (error) {
            console.error('Scan failed:', error);
            throw error;
        }
    });
    // ============ Batch Query/Scan (with progress) ============
    const PROGRESS_THROTTLE_MS = 150;
    ipcMain.handle('dynamo:query-batch', async (event, profileName, params, maxResults) => {
        try {
            const docClient = await getDynamoDBDocClient(profileName);
            const allItems = [];
            let totalCount = 0;
            let totalScanned = 0;
            let lastKey = params.exclusiveStartKey;
            const startTime = Date.now();
            let lastProgressTime = 0;
            let pendingItems = []; // Items waiting to be sent
            while (allItems.length < maxResults) {
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
                    const progress = {
                        count: allItems.length,
                        scannedCount: totalScanned,
                        elapsedMs: now - startTime,
                        items: pendingItems,
                    };
                    event.sender.send('query-progress', progress);
                    pendingItems = []; // Reset pending items after sending
                }
                if (!lastKey)
                    break;
            }
            // Send final progress with any remaining items and completion signal
            const finalProgress = {
                count: allItems.length,
                scannedCount: totalScanned,
                elapsedMs: Date.now() - startTime,
                items: pendingItems,
                isComplete: true,
            };
            event.sender.send('query-progress', finalProgress);
            return {
                items: allItems,
                lastEvaluatedKey: lastKey,
                count: totalCount,
                scannedCount: totalScanned,
                elapsedMs: Date.now() - startTime,
            };
        }
        catch (error) {
            console.error('Batch query failed:', error);
            throw error;
        }
    });
    ipcMain.handle('dynamo:scan-batch', async (event, profileName, params, maxResults) => {
        try {
            const docClient = await getDynamoDBDocClient(profileName);
            const allItems = [];
            let totalCount = 0;
            let totalScanned = 0;
            let lastKey = params.exclusiveStartKey;
            const startTime = Date.now();
            let lastProgressTime = 0;
            let pendingItems = []; // Items waiting to be sent
            while (allItems.length < maxResults) {
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
                    const progress = {
                        count: allItems.length,
                        scannedCount: totalScanned,
                        elapsedMs: now - startTime,
                        items: pendingItems,
                    };
                    event.sender.send('query-progress', progress);
                    pendingItems = []; // Reset pending items after sending
                }
                if (!lastKey)
                    break;
            }
            // Send final progress with any remaining items and completion signal
            const finalProgress = {
                count: allItems.length,
                scannedCount: totalScanned,
                elapsedMs: Date.now() - startTime,
                items: pendingItems,
                isComplete: true,
            };
            event.sender.send('query-progress', finalProgress);
            return {
                items: allItems,
                lastEvaluatedKey: lastKey,
                count: totalCount,
                scannedCount: totalScanned,
                elapsedMs: Date.now() - startTime,
            };
        }
        catch (error) {
            console.error('Batch scan failed:', error);
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
}
//# sourceMappingURL=handlers.js.map