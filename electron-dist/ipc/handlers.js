import { ipcMain, nativeTheme, BrowserWindow } from 'electron';
import { ListTablesCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { parseAwsConfig } from '../services/config-parser.js';
import { checkAuthStatus, loginWithSSO } from '../services/credential-manager.js';
import { getDynamoDBClient, clearClientsForProfile } from '../services/dynamo-client-factory.js';
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