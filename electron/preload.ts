import { contextBridge, ipcRenderer } from 'electron';
import type { AwsProfile, TableInfo, AuthStatus, QueryParams, QueryResult, BatchQueryResult, QueryProgress, BatchWriteOperation, WriteProgress } from './types.js';
import type { ScanParams } from './services/query-executor.js';

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };

// Type declaration for the renderer
declare global {
  interface Window {
    dynomite: typeof api;
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

  onQueryStarted: (callback: (data: { queryId: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { queryId: string }) => callback(data);
    ipcRenderer.on('query-started', handler);
    return () => ipcRenderer.removeListener('query-started', handler);
  },

  cancelQuery: (queryId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('dynamo:cancel-query', queryId),

  // Write operations
  putItem: (profileName: string, tableName: string, item: Record<string, unknown>): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('dynamo:put-item', profileName, tableName, item),

  updateItem: (
    profileName: string,
    tableName: string,
    key: Record<string, unknown>,
    updates: Record<string, unknown>
  ): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('dynamo:update-item', profileName, tableName, key, updates),

  deleteItem: (profileName: string, tableName: string, key: Record<string, unknown>): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('dynamo:delete-item', profileName, tableName, key),

  batchWrite: (
    profileName: string,
    operations: BatchWriteOperation[]
  ): Promise<{ success: boolean; processed: number; errors: string[] }> =>
    ipcRenderer.invoke('dynamo:batch-write', profileName, operations),

  onWriteProgress: (callback: (progress: WriteProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: WriteProgress) => callback(progress);
    ipcRenderer.on('write-progress', handler);
    return () => ipcRenderer.removeListener('write-progress', handler);
  },

  // System
  getSystemTheme: (): Promise<'light' | 'dark'> =>
    ipcRenderer.invoke('system:get-theme'),

  onThemeChange: (callback: (theme: 'light' | 'dark') => void) => {
    const handler = (_event: Electron.IpcRendererEvent, theme: 'light' | 'dark') => callback(theme);
    ipcRenderer.on('system:theme-changed', handler);
    return () => ipcRenderer.removeListener('system:theme-changed', handler);
  },

  // Auto-Update
  getAppVersion: (): Promise<string> =>
    ipcRenderer.invoke('app:get-version'),

  getUpdateStatus: (): Promise<UpdateStatus> =>
    ipcRenderer.invoke('updater:get-status'),

  checkForUpdates: (): Promise<void> =>
    ipcRenderer.invoke('updater:check'),

  quitAndInstall: (): Promise<void> =>
    ipcRenderer.invoke('updater:quit-and-install'),

  onUpdateStatusChange: (callback: (status: UpdateStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => callback(status);
    ipcRenderer.on('update-status-changed', handler);
    return () => ipcRenderer.removeListener('update-status-changed', handler);
  },
};

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('dynomite', api);

export type DynomiteAPI = typeof api;
