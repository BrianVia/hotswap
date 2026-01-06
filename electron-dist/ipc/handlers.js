import { ipcMain, nativeTheme, BrowserWindow, app } from 'electron';
import { ListTablesCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { QueryCommand, ScanCommand, PutCommand, UpdateCommand, DeleteCommand, TransactWriteCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { parseAwsConfig } from '../services/config-parser.js';
import { checkAuthStatus, loginWithSSO } from '../services/credential-manager.js';
import { getDynamoDBClient, getDynamoDBDocClient, clearClientsForProfile } from '../services/dynamo-client-factory.js';
import { buildQueryCommand, buildScanCommand } from '../services/query-executor.js';
import { getUpdateStatus, checkForUpdates, quitAndInstall } from '../updater.js';
// ============ Input Validation Helpers ============
/**
 * Validate a profile name - must be a non-empty string with valid characters
 */
function validateProfileName(profileName) {
    return typeof profileName === 'string' &&
        profileName.length > 0 &&
        profileName.length <= 256 &&
        /^[a-zA-Z0-9_-]+$/.test(profileName);
}
/**
 * Validate a table name - AWS DynamoDB table name rules
 */
function validateTableName(tableName) {
    return typeof tableName === 'string' &&
        tableName.length >= 3 &&
        tableName.length <= 255 &&
        /^[a-zA-Z0-9._-]+$/.test(tableName);
}
/**
 * Validate query params - basic structure validation
 */
function validateQueryParams(params) {
    if (!params || typeof params !== 'object')
        return false;
    const p = params;
    if (!validateTableName(p.tableName))
        return false;
    if (!p.keyCondition || typeof p.keyCondition !== 'object')
        return false;
    const kc = p.keyCondition;
    if (!kc.pk || typeof kc.pk !== 'object')
        return false;
    return true;
}
/**
 * Validate scan params - basic structure validation
 */
function validateScanParams(params) {
    if (!params || typeof params !== 'object')
        return false;
    const p = params;
    return validateTableName(p.tableName);
}
/**
 * Validate a DynamoDB item - must be a non-null object
 */
function validateItem(item) {
    return item !== null && typeof item === 'object' && !Array.isArray(item);
}
/**
 * Validate max results - must be a positive integer
 */
function validateMaxResults(maxResults) {
    return typeof maxResults === 'number' &&
        Number.isInteger(maxResults) &&
        maxResults > 0 &&
        maxResults <= 100000;
}
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
        if (!validateProfileName(profileName)) {
            console.error('Invalid profile name:', profileName);
            return { authenticated: false, profileName: String(profileName) };
        }
        try {
            return await checkAuthStatus(profileName);
        }
        catch (error) {
            console.error('Failed to check auth status:', error);
            return { authenticated: false, profileName };
        }
    });
    ipcMain.handle('aws:sso-login', async (_event, profileName) => {
        if (!validateProfileName(profileName)) {
            return { success: false, error: 'Invalid profile name' };
        }
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
        if (!validateProfileName(profileName)) {
            throw new Error('Invalid profile name');
        }
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
        if (!validateProfileName(profileName)) {
            throw new Error('Invalid profile name');
        }
        if (!validateTableName(tableName)) {
            throw new Error('Invalid table name');
        }
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
        if (!validateProfileName(profileName)) {
            throw new Error('Invalid profile name');
        }
        if (!validateQueryParams(params)) {
            throw new Error('Invalid query parameters');
        }
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
        if (!validateProfileName(profileName)) {
            throw new Error('Invalid profile name');
        }
        if (!validateScanParams(params)) {
            throw new Error('Invalid scan parameters');
        }
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
    const cancelledQueries = new Set();
    let queryIdCounter = 0;
    // Cancel a running query
    ipcMain.handle('dynamo:cancel-query', (_event, queryId) => {
        cancelledQueries.add(queryId);
        return { success: true };
    });
    ipcMain.handle('dynamo:query-batch', async (event, profileName, params, maxResults) => {
        if (!validateProfileName(profileName)) {
            throw new Error('Invalid profile name');
        }
        if (!validateQueryParams(params)) {
            throw new Error('Invalid query parameters');
        }
        if (!validateMaxResults(maxResults)) {
            throw new Error('Invalid max results (must be 1-100000)');
        }
        const queryId = `query-${++queryIdCounter}`;
        try {
            const docClient = await getDynamoDBDocClient(profileName);
            const allItems = [];
            let totalCount = 0;
            let totalScanned = 0;
            let lastKey = params.exclusiveStartKey;
            const startTime = Date.now();
            let lastProgressTime = 0;
            let pendingItems = []; // Items waiting to be sent
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
                    const progress = {
                        queryId,
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
            const elapsedMs = Date.now() - startTime;
            const finalProgress = {
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
        }
        catch (error) {
            cancelledQueries.delete(queryId);
            console.error('Batch query failed:', error);
            throw error;
        }
    });
    ipcMain.handle('dynamo:scan-batch', async (event, profileName, params, maxResults) => {
        if (!validateProfileName(profileName)) {
            throw new Error('Invalid profile name');
        }
        if (!validateScanParams(params)) {
            throw new Error('Invalid scan parameters');
        }
        if (!validateMaxResults(maxResults)) {
            throw new Error('Invalid max results (must be 1-100000)');
        }
        const queryId = `scan-${++queryIdCounter}`;
        try {
            const docClient = await getDynamoDBDocClient(profileName);
            const allItems = [];
            let totalCount = 0;
            let totalScanned = 0;
            let lastKey = params.exclusiveStartKey;
            const startTime = Date.now();
            let lastProgressTime = 0;
            let pendingItems = []; // Items waiting to be sent
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
                    const progress = {
                        queryId,
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
            const elapsedMs = Date.now() - startTime;
            const finalProgress = {
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
        }
        catch (error) {
            cancelledQueries.delete(queryId);
            console.error('Batch scan failed:', error);
            throw error;
        }
    });
    // ============ DynamoDB Write Operations ============
    ipcMain.handle('dynamo:put-item', async (_event, profileName, tableName, item) => {
        if (!validateProfileName(profileName)) {
            throw new Error('Invalid profile name');
        }
        if (!validateTableName(tableName)) {
            throw new Error('Invalid table name');
        }
        if (!validateItem(item)) {
            throw new Error('Invalid item');
        }
        try {
            const docClient = await getDynamoDBDocClient(profileName);
            await docClient.send(new PutCommand({ TableName: tableName, Item: item }));
            return { success: true };
        }
        catch (error) {
            console.error('Put item failed:', error);
            throw error;
        }
    });
    ipcMain.handle('dynamo:update-item', async (_event, profileName, tableName, key, updates) => {
        if (!validateProfileName(profileName)) {
            throw new Error('Invalid profile name');
        }
        if (!validateTableName(tableName)) {
            throw new Error('Invalid table name');
        }
        if (!validateItem(key)) {
            throw new Error('Invalid key');
        }
        if (!validateItem(updates) || Object.keys(updates).length === 0) {
            throw new Error('Invalid or empty updates');
        }
        try {
            const docClient = await getDynamoDBDocClient(profileName);
            // Build UpdateExpression from updates object
            const expressionAttributeNames = {};
            const expressionAttributeValues = {};
            const updateParts = [];
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
        }
        catch (error) {
            console.error('Update item failed:', error);
            throw error;
        }
    });
    ipcMain.handle('dynamo:delete-item', async (_event, profileName, tableName, key) => {
        if (!validateProfileName(profileName)) {
            throw new Error('Invalid profile name');
        }
        if (!validateTableName(tableName)) {
            throw new Error('Invalid table name');
        }
        if (!validateItem(key)) {
            throw new Error('Invalid key');
        }
        try {
            const docClient = await getDynamoDBDocClient(profileName);
            await docClient.send(new DeleteCommand({ TableName: tableName, Key: key }));
            return { success: true };
        }
        catch (error) {
            console.error('Delete item failed:', error);
            throw error;
        }
    });
    ipcMain.handle('dynamo:batch-write', async (event, profileName, operations) => {
        if (!validateProfileName(profileName)) {
            throw new Error('Invalid profile name');
        }
        if (!Array.isArray(operations) || operations.length === 0) {
            return { success: true, processed: 0, errors: [] };
        }
        // Validate each operation
        for (const op of operations) {
            if (!op.tableName || !validateTableName(op.tableName)) {
                throw new Error('Invalid table name in operation');
            }
        }
        try {
            const docClient = await getDynamoDBDocClient(profileName);
            const errors = [];
            let processed = 0;
            // Process PK changes as transactions (delete old + put new atomically)
            const pkChanges = operations.filter(op => op.type === 'pk-change');
            for (const op of pkChanges) {
                if (!op.oldKey || !op.newItem)
                    continue;
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
                }
                catch (err) {
                    errors.push(`PK change failed: ${err.message}`);
                }
            }
            // Process regular puts and deletes in batches of 25 using BatchWriteCommand
            const regularOps = operations.filter(op => op.type !== 'pk-change');
            const BATCH_SIZE = 25;
            const MAX_RETRIES = 5;
            const BASE_DELAY_MS = 100;
            for (let i = 0; i < regularOps.length; i += BATCH_SIZE) {
                const batch = regularOps.slice(i, i + BATCH_SIZE);
                // Group by table for BatchWriteCommand
                const requestsByTable = {};
                for (const op of batch) {
                    if (!requestsByTable[op.tableName]) {
                        requestsByTable[op.tableName] = [];
                    }
                    if (op.type === 'put' && op.item) {
                        requestsByTable[op.tableName].push({
                            PutRequest: { Item: op.item },
                        });
                    }
                    else if (op.type === 'delete' && op.key) {
                        requestsByTable[op.tableName].push({
                            DeleteRequest: { Key: op.key },
                        });
                    }
                }
                // Execute BatchWriteCommand with exponential backoff for unprocessed items
                let unprocessedItems = requestsByTable;
                let retryCount = 0;
                while (Object.keys(unprocessedItems).length > 0 && retryCount < MAX_RETRIES) {
                    try {
                        const batchWriteResult = await docClient.send(new BatchWriteCommand({
                            RequestItems: unprocessedItems,
                        }));
                        // Count how many were processed in this call
                        const itemsInThisBatch = Object.values(unprocessedItems).reduce((sum, arr) => sum + arr.length, 0);
                        const unprocessedCount = batchWriteResult.UnprocessedItems
                            ? Object.values(batchWriteResult.UnprocessedItems).reduce((sum, arr) => sum + arr.length, 0)
                            : 0;
                        processed += itemsInThisBatch - unprocessedCount;
                        // Handle unprocessed items with exponential backoff
                        if (batchWriteResult.UnprocessedItems && Object.keys(batchWriteResult.UnprocessedItems).length > 0) {
                            unprocessedItems = batchWriteResult.UnprocessedItems;
                            retryCount++;
                            if (retryCount < MAX_RETRIES) {
                                // Exponential backoff: 100ms, 200ms, 400ms, 800ms, 1600ms
                                const delay = BASE_DELAY_MS * Math.pow(2, retryCount - 1);
                                await new Promise(resolve => setTimeout(resolve, delay));
                            }
                        }
                        else {
                            // All items processed successfully
                            unprocessedItems = {};
                        }
                    }
                    catch (err) {
                        // If batch fails entirely, try individual operations as fallback
                        console.warn('BatchWriteCommand failed, falling back to individual operations:', err);
                        for (const [tableName, requests] of Object.entries(unprocessedItems)) {
                            for (const req of requests) {
                                try {
                                    if (req.PutRequest) {
                                        await docClient.send(new PutCommand({
                                            TableName: tableName,
                                            Item: req.PutRequest.Item,
                                        }));
                                    }
                                    else if (req.DeleteRequest) {
                                        await docClient.send(new DeleteCommand({
                                            TableName: tableName,
                                            Key: req.DeleteRequest.Key,
                                        }));
                                    }
                                    processed++;
                                }
                                catch (individualErr) {
                                    errors.push(`Write failed for ${tableName}: ${individualErr.message}`);
                                }
                            }
                        }
                        unprocessedItems = {};
                    }
                }
                // If we still have unprocessed items after max retries, record as errors
                if (Object.keys(unprocessedItems).length > 0) {
                    const unprocessedCount = Object.values(unprocessedItems).reduce((sum, arr) => sum + arr.length, 0);
                    errors.push(`${unprocessedCount} items failed to write after ${MAX_RETRIES} retries (throttled)`);
                }
                // Send progress
                event.sender.send('write-progress', {
                    processed,
                    total: operations.length,
                });
            }
            return { success: errors.length === 0, processed, errors };
        }
        catch (error) {
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
//# sourceMappingURL=handlers.js.map