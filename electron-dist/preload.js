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
    // System
    getSystemTheme: () => ipcRenderer.invoke('system:get-theme'),
    onThemeChange: (callback) => {
        const handler = (_event, theme) => callback(theme);
        ipcRenderer.on('system:theme-changed', handler);
        return () => ipcRenderer.removeListener('system:theme-changed', handler);
    },
};
// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('hotswap', api);
//# sourceMappingURL=preload.js.map