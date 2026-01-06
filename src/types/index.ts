// Re-export types from electron for use in renderer
export interface SsoSession {
  name: string;
  sso_start_url: string;
  sso_region: string;
  sso_registration_scopes?: string;
}

export interface AwsProfile {
  name: string;
  sso_session?: string;
  sso_account_id?: string;
  sso_role_name?: string;
  region: string;
  output?: string;
  ssoSession?: SsoSession;
}

export interface AuthStatus {
  authenticated: boolean;
  expiresAt?: string;
  profileName: string;
}

export interface TableInfo {
  tableName: string;
  keySchema: KeySchemaElement[];
  attributeDefinitions: AttributeDefinition[];
  itemCount?: number;
  tableSizeBytes?: number;
  tableStatus?: string;
  globalSecondaryIndexes?: GlobalSecondaryIndex[];
  localSecondaryIndexes?: LocalSecondaryIndex[];
}

export interface KeySchemaElement {
  attributeName: string;
  keyType: 'HASH' | 'RANGE';
}

export interface AttributeDefinition {
  attributeName: string;
  attributeType: 'S' | 'N' | 'B';
}

export interface GlobalSecondaryIndex {
  indexName: string;
  keySchema: KeySchemaElement[];
  projection: {
    projectionType: 'ALL' | 'KEYS_ONLY' | 'INCLUDE';
    nonKeyAttributes?: string[];
  };
}

export interface LocalSecondaryIndex {
  indexName: string;
  keySchema: KeySchemaElement[];
  projection: {
    projectionType: 'ALL' | 'KEYS_ONLY' | 'INCLUDE';
    nonKeyAttributes?: string[];
  };
}

// Query types
export type SkOperator = 'eq' | 'begins_with' | 'between' | 'lt' | 'lte' | 'gt' | 'gte';
export type FilterOperator = 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte' | 'begins_with' | 'contains' | 'exists' | 'not_exists' | 'between';

// DynamoDB attribute type for key values
export type DynamoKeyValueType = 'S' | 'N' | 'B';

export interface FilterCondition {
  id: string;
  attribute: string;
  operator: FilterOperator;
  value: string;
  value2?: string; // for 'between'
}

export interface QueryParams {
  tableName: string;
  indexName?: string;
  keyCondition: {
    pk: { name: string; value: string; valueType?: DynamoKeyValueType };
    sk?: { name: string; operator: SkOperator; value: string; value2?: string; valueType?: DynamoKeyValueType };
  };
  filters?: FilterCondition[];
  limit?: number;
  scanIndexForward?: boolean;
  exclusiveStartKey?: Record<string, unknown>;
}

export interface QueryResult {
  items: Record<string, unknown>[];
  lastEvaluatedKey?: Record<string, unknown>;
  count: number;
  scannedCount: number;
}

export interface BatchQueryResult extends QueryResult {
  elapsedMs: number;
  cancelled?: boolean;
}

export interface QueryProgress {
  queryId?: string;
  count: number;
  scannedCount: number;
  elapsedMs: number;
  items?: Record<string, unknown>[]; // Batch of items just fetched
  isComplete?: boolean;              // Signals pagination complete
  cancelled?: boolean;               // Query was cancelled by user
}

// Write operation types
export interface BatchWriteOperation {
  type: 'put' | 'delete' | 'pk-change';
  tableName: string;
  key?: Record<string, unknown>;
  item?: Record<string, unknown>;
  // For pk-change: oldKey + newItem
  oldKey?: Record<string, unknown>;
  newItem?: Record<string, unknown>;
}

export interface WriteProgress {
  processed: number;
  total: number;
}

// Auto-Update types
export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };

export interface ScanParams {
  tableName: string;
  indexName?: string;
  limit?: number;
  exclusiveStartKey?: Record<string, unknown>;
  filters?: FilterCondition[];
}

// Saved bookmark for query configurations
export interface SavedBookmark {
  id: string;
  name: string;
  tablePrefix: string; // Stable prefix for cross-environment matching
  createdAt: number;
  updatedAt: number;
  // Query state to restore
  selectedIndex: string | null;
  pkValue: string;
  skOperator: SkOperator;
  skValue: string;
  skValue2: string;
  filters: FilterCondition[];
  maxResults: number;
  scanForward: boolean;
}

// Declare the dynomite API on window
declare global {
  interface Window {
    dynomite: {
      getProfiles: () => Promise<AwsProfile[]>;
      checkAuthStatus: (profileName: string) => Promise<AuthStatus>;
      loginWithSSO: (profileName: string) => Promise<{ success: boolean; error?: string }>;
      listTables: (profileName: string) => Promise<string[]>;
      describeTable: (profileName: string, tableName: string) => Promise<TableInfo>;
      queryTable: (profileName: string, params: QueryParams) => Promise<QueryResult>;
      scanTable: (profileName: string, params: ScanParams) => Promise<QueryResult>;
      queryTableBatch: (profileName: string, params: QueryParams, maxResults: number) => Promise<BatchQueryResult>;
      scanTableBatch: (profileName: string, params: ScanParams, maxResults: number) => Promise<BatchQueryResult>;
      onQueryProgress: (callback: (progress: QueryProgress) => void) => () => void;
      onQueryStarted: (callback: (data: { queryId: string }) => void) => () => void;
      cancelQuery: (queryId: string) => Promise<{ success: boolean }>;
      // Write operations
      putItem: (profileName: string, tableName: string, item: Record<string, unknown>) => Promise<{ success: boolean }>;
      updateItem: (profileName: string, tableName: string, key: Record<string, unknown>, updates: Record<string, unknown>) => Promise<{ success: boolean }>;
      deleteItem: (profileName: string, tableName: string, key: Record<string, unknown>) => Promise<{ success: boolean }>;
      batchWrite: (profileName: string, operations: BatchWriteOperation[]) => Promise<{ success: boolean; processed: number; errors: string[] }>;
      onWriteProgress: (callback: (progress: WriteProgress) => void) => () => void;
      // System
      getSystemTheme: () => Promise<'light' | 'dark'>;
      onThemeChange: (callback: (theme: 'light' | 'dark') => void) => () => void;
      // Auto-Update
      getAppVersion: () => Promise<string>;
      getUpdateStatus: () => Promise<UpdateStatus>;
      checkForUpdates: () => Promise<void>;
      quitAndInstall: () => Promise<void>;
      onUpdateStatusChange: (callback: (status: UpdateStatus) => void) => () => void;
    };
  }
}

export {};
