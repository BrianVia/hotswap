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
  // Resolved SSO session info
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

export type FilterOperator = 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte' | 'begins_with' | 'contains' | 'exists' | 'not_exists' | 'between';

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
    pk: { name: string; value: string };
    sk?: { name: string; operator: 'eq' | 'begins_with' | 'between' | 'lt' | 'lte' | 'gt' | 'gte'; value: string; value2?: string };
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
}

export interface QueryProgress {
  count: number;
  scannedCount: number;
  elapsedMs: number;
  items?: Record<string, unknown>[]; // Batch of items just fetched
  isComplete?: boolean;              // Signals pagination complete
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
