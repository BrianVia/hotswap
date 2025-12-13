import { contextBridge, ipcRenderer } from 'electron';
const api = {
    // Profile operations
    getProfiles: () => ipcRenderer.invoke('aws:get-profiles'),
    // SSO Authentication
    checkAuthStatus: (profileName) => ipcRenderer.invoke('aws:check-auth-status', profileName),
    loginWithSSO: (profileName) => ipcRenderer.invoke('aws:sso-login', profileName),
    // DynamoDB operations
    listTables: (profileName) => ipcRenderer.invoke('dynamo:list-tables', profileName),
    describeTable: (profileName, tableName) => ipcRenderer.invoke('dynamo:describe-table', profileName, tableName),
    queryTable: (profileName, params) => ipcRenderer.invoke('dynamo:query', profileName, params),
    scanTable: (profileName, params) => ipcRenderer.invoke('dynamo:scan', profileName, params),
    // Batch operations (with progress)
    queryTableBatch: (profileName, params, maxResults) => ipcRenderer.invoke('dynamo:query-batch', profileName, params, maxResults),
    scanTableBatch: (profileName, params, maxResults) => ipcRenderer.invoke('dynamo:scan-batch', profileName, params, maxResults),
    onQueryProgress: (callback) => {
        const handler = (_event, progress) => callback(progress);
        ipcRenderer.on('query-progress', handler);
        return () => ipcRenderer.removeListener('query-progress', handler);
    },
    onQueryStarted: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('query-started', handler);
        return () => ipcRenderer.removeListener('query-started', handler);
    },
    cancelQuery: (queryId) => ipcRenderer.invoke('dynamo:cancel-query', queryId),
    // Write operations
    putItem: (profileName, tableName, item) => ipcRenderer.invoke('dynamo:put-item', profileName, tableName, item),
    updateItem: (profileName, tableName, key, updates) => ipcRenderer.invoke('dynamo:update-item', profileName, tableName, key, updates),
    deleteItem: (profileName, tableName, key) => ipcRenderer.invoke('dynamo:delete-item', profileName, tableName, key),
    batchWrite: (profileName, operations) => ipcRenderer.invoke('dynamo:batch-write', profileName, operations),
    onWriteProgress: (callback) => {
        const handler = (_event, progress) => callback(progress);
        ipcRenderer.on('write-progress', handler);
        return () => ipcRenderer.removeListener('write-progress', handler);
    },
    // System
    getSystemTheme: () => ipcRenderer.invoke('system:get-theme'),
    onThemeChange: (callback) => {
        const handler = (_event, theme) => callback(theme);
        ipcRenderer.on('system:theme-changed', handler);
        return () => ipcRenderer.removeListener('system:theme-changed', handler);
    },
    // Auto-Update
    getAppVersion: () => ipcRenderer.invoke('app:get-version'),
    getUpdateStatus: () => ipcRenderer.invoke('updater:get-status'),
    checkForUpdates: () => ipcRenderer.invoke('updater:check'),
    quitAndInstall: () => ipcRenderer.invoke('updater:quit-and-install'),
    onUpdateStatusChange: (callback) => {
        const handler = (_event, status) => callback(status);
        ipcRenderer.on('update-status-changed', handler);
        return () => ipcRenderer.removeListener('update-status-changed', handler);
    },
};
// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('dynomite', api);
//# sourceMappingURL=preload.js.map