import { contextBridge, ipcRenderer } from 'electron';
import type { AwsProfile, TableInfo, AuthStatus, QueryParams, QueryResult, BatchQueryResult, QueryProgress } from './types.js';
import type { ScanParams } from './services/query-executor.js';

// Type declaration for the renderer
declare global {
  interface Window {
    hotswap: typeof api;
  }
}

const api = {
  // Profile operations
  getProfiles: (): Promise<AwsProfile[]> => 
    ipcRenderer.invoke('aws:get-profiles'),
  
  // SSO Authentication
  checkAuthStatus: (profileName: string): Promise<AuthStatus> =>
    ipcRenderer.invoke('aws:check-auth-status', profileName),
  
  loginWithSSO: (profileName: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('aws:sso-login', profileName),

  // DynamoDB operations
  listTables: (profileName: string): Promise<string[]> =>
    ipcRenderer.invoke('dynamo:list-tables', profileName),
  
  describeTable: (profileName: string, tableName: string): Promise<TableInfo> =>
    ipcRenderer.invoke('dynamo:describe-table', profileName, tableName),

  queryTable: (profileName: string, params: QueryParams): Promise<QueryResult> =>
    ipcRenderer.invoke('dynamo:query', profileName, params),

  scanTable: (profileName: string, params: ScanParams): Promise<QueryResult> =>
    ipcRenderer.invoke('dynamo:scan', profileName, params),

  // Batch operations (with progress)
  queryTableBatch: (profileName: string, params: QueryParams, maxResults: number): Promise<BatchQueryResult> =>
    ipcRenderer.invoke('dynamo:query-batch', profileName, params, maxResults),

  scanTableBatch: (profileName: string, params: ScanParams, maxResults: number): Promise<BatchQueryResult> =>
    ipcRenderer.invoke('dynamo:scan-batch', profileName, params, maxResults),

  onQueryProgress: (callback: (progress: QueryProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: QueryProgress) => callback(progress);
    ipcRenderer.on('query-progress', handler);
    return () => ipcRenderer.removeListener('query-progress', handler);
  },

  // System
  getSystemTheme: (): Promise<'light' | 'dark'> =>
    ipcRenderer.invoke('system:get-theme'),
  
  onThemeChange: (callback: (theme: 'light' | 'dark') => void) => {
    const handler = (_event: Electron.IpcRendererEvent, theme: 'light' | 'dark') => callback(theme);
    ipcRenderer.on('system:theme-changed', handler);
    return () => ipcRenderer.removeListener('system:theme-changed', handler);
  },
};

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('hotswap', api);

export type HotswapAPI = typeof api;
