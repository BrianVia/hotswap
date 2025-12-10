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

// Declare the hotswap API on window
declare global {
  interface Window {
    hotswap: {
      getProfiles: () => Promise<AwsProfile[]>;
      checkAuthStatus: (profileName: string) => Promise<AuthStatus>;
      loginWithSSO: (profileName: string) => Promise<{ success: boolean; error?: string }>;
      listTables: (profileName: string) => Promise<string[]>;
      describeTable: (profileName: string, tableName: string) => Promise<TableInfo>;
      getSystemTheme: () => Promise<'light' | 'dark'>;
      onThemeChange: (callback: (theme: 'light' | 'dark') => void) => () => void;
    };
  }
}

export {};
