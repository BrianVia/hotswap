# Dynomite Phase 2 Roadmap

Implementation approaches for remaining features.

---

## 1. Query Builder

### Goal
Visual interface for building DynamoDB queries without writing KeyConditionExpressions.

### UI Components

```
┌─────────────────────────────────────────────────────────┐
│ Query Builder                                           │
├─────────────────────────────────────────────────────────┤
│ Index:  [Primary Table ▼]  (dropdown: table + all GSIs) │
├─────────────────────────────────────────────────────────┤
│ Partition Key (pk)                                      │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ BRAND                                               │ │
│ └─────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│ Sort Key (sk)                          [Optional]       │
│ ┌──────────┐ ┌────────────────────────────────────────┐ │
│ │ begins_with ▼ │ ADID                                │ │
│ └──────────┘ └────────────────────────────────────────┘ │
│                                                         │
│ Operators: = | begins_with | between | < | <= | > | >= │
├─────────────────────────────────────────────────────────┤
│ [+ Add Filter]  (for FilterExpression on other attrs)  │
├─────────────────────────────────────────────────────────┤
│ Limit: [100]   Direction: [Descending ▼]               │
├─────────────────────────────────────────────────────────┤
│                              [Run Query]  [Scan Table] │
└─────────────────────────────────────────────────────────┘
```

### Implementation

**File: `src/components/QueryBuilder/index.tsx`**

```typescript
interface QueryBuilderProps {
  tableInfo: TableInfo;
  onExecute: (params: QueryParams) => void;
}

// State
const [selectedIndex, setSelectedIndex] = useState<string | null>(null); // null = primary
const [pkValue, setPkValue] = useState('');
const [skOperator, setSkOperator] = useState<SkOperator>('eq');
const [skValue, setSkValue] = useState('');
const [skValue2, setSkValue2] = useState(''); // for "between"
const [filters, setFilters] = useState<FilterCondition[]>([]);
const [limit, setLimit] = useState(100);
const [scanForward, setScanForward] = useState(false);
```

**Key Schema Detection**
- Read `tableInfo.keySchema` for primary table keys
- Read `tableInfo.globalSecondaryIndexes[].keySchema` for GSI keys
- Dynamically update PK/SK field labels based on selected index

**Expression Building (in main process)**

```typescript
// electron/services/query-builder.ts
export function buildQueryParams(input: QueryBuilderInput): QueryCommandInput {
  const { tableName, indexName, pk, sk, filters, limit, scanForward } = input;
  
  let keyConditionExpression = '#pk = :pk';
  const expressionAttributeNames: Record<string, string> = { '#pk': pk.name };
  const expressionAttributeValues: Record<string, any> = { ':pk': pk.value };

  if (sk) {
    switch (sk.operator) {
      case 'eq':
        keyConditionExpression += ' AND #sk = :sk';
        break;
      case 'begins_with':
        keyConditionExpression += ' AND begins_with(#sk, :sk)';
        break;
      case 'between':
        keyConditionExpression += ' AND #sk BETWEEN :sk1 AND :sk2';
        expressionAttributeValues[':sk2'] = sk.value2;
        break;
      case 'lt':
        keyConditionExpression += ' AND #sk < :sk';
        break;
      // ... etc
    }
    expressionAttributeNames['#sk'] = sk.name;
    expressionAttributeValues[':sk'] = sk.value;
  }

  return {
    TableName: tableName,
    IndexName: indexName || undefined,
    KeyConditionExpression: keyConditionExpression,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    Limit: limit,
    ScanIndexForward: scanForward,
  };
}
```

### IPC Handlers

```typescript
// electron/ipc/handlers.ts
ipcMain.handle('dynamo:query', async (_event, profileName: string, params: QueryParams) => {
  const docClient = await getDynamoDBDocClient(profileName);
  const command = new QueryCommand(buildQueryParams(params));
  const response = await docClient.send(command);
  return {
    items: response.Items || [],
    lastEvaluatedKey: response.LastEvaluatedKey,
    count: response.Count,
    scannedCount: response.ScannedCount,
  };
});

ipcMain.handle('dynamo:scan', async (_event, profileName: string, tableName: string, limit?: number) => {
  const docClient = await getDynamoDBDocClient(profileName);
  const command = new ScanCommand({ TableName: tableName, Limit: limit });
  const response = await docClient.send(command);
  return {
    items: response.Items || [],
    lastEvaluatedKey: response.LastEvaluatedKey,
    count: response.Count,
    scannedCount: response.ScannedCount,
  };
});
```

---

## 2. Results Table

### Goal
Spreadsheet-style view of query results with sorting, column resizing, and pagination.

### UI Design

```
┌────────────────────────────────────────────────────────────────────┐
│ Results (156 items)                      [Export ▼] [Clear]        │
├────────────────────────────────────────────────────────────────────┤
│ pk          │ sk              │ name       │ status    │ created   │
├─────────────┼─────────────────┼────────────┼───────────┼───────────┤
│ BRAND       │ ADIDAS          │ Adidas     │ active    │ 2024-01-… │
│ BRAND       │ AMAZON          │ Amazon     │ active    │ 2024-01-… │
│ BRAND       │ APPLE           │ Apple Inc  │ active    │ 2024-01-… │
│ ...         │ ...             │ ...        │ ...       │ ...       │
├────────────────────────────────────────────────────────────────────┤
│ Showing 1-100 of 156          [◀ Prev] [Next ▶] [Load All]        │
└────────────────────────────────────────────────────────────────────┘
```

### Implementation

**Dependencies**
```bash
npm install @tanstack/react-table
```

**File: `src/components/ResultsTable.tsx`**

```typescript
import { useReactTable, getCoreRowModel, getSortedRowModel } from '@tanstack/react-table';

interface ResultsTableProps {
  items: Record<string, unknown>[];
  lastEvaluatedKey?: Record<string, unknown>;
  onLoadMore: () => void;
  isLoading: boolean;
}

export function ResultsTable({ items, lastEvaluatedKey, onLoadMore, isLoading }: ResultsTableProps) {
  // Dynamically generate columns from first item's keys
  const columns = useMemo(() => {
    if (items.length === 0) return [];
    const keys = Object.keys(items[0]);
    return keys.map(key => ({
      accessorKey: key,
      header: key,
      cell: ({ getValue }) => <CellRenderer value={getValue()} />,
    }));
  }, [items]);

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // ... render table
}
```

**Cell Rendering**
- Strings: truncate at 100 chars, show full on hover
- Objects/Arrays: JSON syntax highlighting, collapsible
- Numbers: right-aligned, locale formatting
- Booleans: colored badge (green/red)

**Pagination**
- Store `lastEvaluatedKey` in state
- "Load More" button sends another query with `ExclusiveStartKey`
- Append results to existing items array
- "Load All" loops until no more `lastEvaluatedKey`

### State Management

```typescript
// src/stores/query-store.ts
interface QueryState {
  currentQuery: QueryParams | null;
  results: Record<string, unknown>[];
  lastEvaluatedKey?: Record<string, unknown>;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  executeQuery: (profile: string, params: QueryParams) => Promise<void>;
  loadMore: () => Promise<void>;
  clearResults: () => void;
}
```

---

## 3. Post-Query IN Filter

### Goal
Client-side filtering for `attribute IN [value1, value2, ...]` since DynamoDB doesn't support efficient IN queries on sort keys.

### Approach

1. Run the base query (e.g., `pk = BRAND`)
2. Fetch all results (paginate through `lastEvaluatedKey`)
3. Apply JavaScript filter on the full result set

### UI Component

```
┌─────────────────────────────────────────────────────────┐
│ Post-Query Filter                          [Apply]      │
├─────────────────────────────────────────────────────────┤
│ Attribute: [sk ▼]                                       │
│                                                         │
│ Values (one per line or comma-separated):               │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ ADIDAS                                              │ │
│ │ AMAZON                                              │ │
│ │ APPLE                                               │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ Or paste JSON array: ["ADIDAS", "AMAZON", "APPLE"]     │
└─────────────────────────────────────────────────────────┘
```

### Implementation

**File: `src/lib/post-filters.ts`**

```typescript
export type PostFilter = 
  | { type: 'in'; attribute: string; values: (string | number)[] }
  | { type: 'contains'; attribute: string; value: string }
  | { type: 'exists'; attribute: string; exists: boolean }
  | { type: 'range'; attribute: string; min?: number; max?: number };

export function applyPostFilters(
  items: Record<string, unknown>[],
  filters: PostFilter[]
): Record<string, unknown>[] {
  return items.filter(item => {
    return filters.every(filter => {
      const value = getNestedValue(item, filter.attribute);
      
      switch (filter.type) {
        case 'in':
          return filter.values.includes(value as string | number);
        
        case 'contains':
          return String(value).toLowerCase().includes(filter.value.toLowerCase());
        
        case 'exists':
          return filter.exists ? value !== undefined : value === undefined;
        
        case 'range':
          const num = Number(value);
          if (isNaN(num)) return false;
          if (filter.min !== undefined && num < filter.min) return false;
          if (filter.max !== undefined && num > filter.max) return false;
          return true;
        
        default:
          return true;
      }
    });
  });
}

// Support nested attributes like "metadata.category"
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}
```

### Workflow

1. User runs query → full results loaded
2. User adds post-filter (e.g., `sk IN [ADIDAS, AMAZON]`)
3. UI shows filtered count: "Showing 3 of 156 (filtered)"
4. Export respects active post-filters

---

## 4. Export

### Goal
Export query results to JSON or CSV with field selection.

### UI Dialog

```
┌─────────────────────────────────────────────────────────┐
│ Export Results                                    [X]   │
├─────────────────────────────────────────────────────────┤
│ Format: ○ JSON  ● CSV                                   │
├─────────────────────────────────────────────────────────┤
│ Fields to include:                                      │
│ ☑ pk                                                    │
│ ☑ sk                                                    │
│ ☑ name                                                  │
│ ☐ metadata (object - will be stringified)              │
│ ☑ status                                                │
│ ☑ createdAt                                             │
│                                                         │
│ [Select All] [Select None]                              │
├─────────────────────────────────────────────────────────┤
│ Include post-filters: ☑ Yes                             │
├─────────────────────────────────────────────────────────┤
│ Exporting 156 items                      [Export]       │
└─────────────────────────────────────────────────────────┘
```

### Implementation

**File: `electron/services/export-service.ts`**

```typescript
import { dialog } from 'electron';
import { writeFile } from 'fs/promises';

export async function exportToCSV(
  items: Record<string, unknown>[],
  fields: string[]
): Promise<string> {
  // Header row
  const header = fields.join(',');
  
  // Data rows
  const rows = items.map(item => {
    return fields.map(field => {
      const value = item[field];
      if (value === undefined || value === null) return '';
      if (typeof value === 'object') return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return String(value);
    }).join(',');
  });
  
  return [header, ...rows].join('\n');
}

export async function exportToJSON(
  items: Record<string, unknown>[],
  fields: string[]
): Promise<string> {
  const filtered = items.map(item => {
    const result: Record<string, unknown> = {};
    for (const field of fields) {
      if (field in item) result[field] = item[field];
    }
    return result;
  });
  return JSON.stringify(filtered, null, 2);
}
```

**IPC Handler**

```typescript
ipcMain.handle('export:save', async (_event, content: string, defaultName: string, format: 'csv' | 'json') => {
  const { filePath } = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [
      format === 'csv' 
        ? { name: 'CSV', extensions: ['csv'] }
        : { name: 'JSON', extensions: ['json'] }
    ],
  });
  
  if (filePath) {
    await writeFile(filePath, content, 'utf-8');
    return { success: true, path: filePath };
  }
  return { success: false };
});
```

---

## 5. Cross-Environment Query Switching

### Goal
"Open in pegasus-3" button that finds the equivalent table and runs the same query.

### Table Matching Logic

Your tables follow the pattern:
```
{StackName}-{tableLogicalId}{hash}-{cfnSuffix}
         ↑ stable across envs ↑    ↑ varies ↑
```

Example:
- P1: `MetadataStack-savvymetadata09BC1DD1-1QOLI4L3PHUH5`
- P3: `MetadataStack-savvymetadata09BC1DD1-PZVELD20WFCM`
- P9: `MetadataStack-savvymetadata09BC1DD1-H2GOP4S4MNYU`

**Stable prefix**: `MetadataStack-savvymetadata09BC1DD1`

### Implementation

**File: `src/lib/table-matcher.ts`**

```typescript
/**
 * Extract the stable prefix from a CloudFormation-generated table name.
 * Pattern: {StackName}-{tableLogicalId}{hash}-{cfnSuffix}
 * We keep everything before the last hyphen-separated segment.
 */
export function extractTablePrefix(tableName: string): string {
  // Match pattern: last segment is random CFN suffix (uppercase alphanumeric, 8-16 chars)
  const match = tableName.match(/^(.+)-[A-Z0-9]{8,}$/);
  return match ? match[1] : tableName;
}

/**
 * Find matching table in another environment
 */
export function findSiblingTable(
  currentTable: string,
  targetTables: string[]
): string | null {
  const prefix = extractTablePrefix(currentTable);
  return targetTables.find(t => extractTablePrefix(t) === prefix) || null;
}

/**
 * Group tables by their stable prefix for UI display
 */
export function groupTablesByPrefix(tables: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const table of tables) {
    const prefix = extractTablePrefix(table);
    const existing = groups.get(prefix) || [];
    existing.push(table);
    groups.set(prefix, existing);
  }
  return groups;
}
```

### UI Component

**File: `src/components/EnvironmentSwitcher.tsx`**

```tsx
interface EnvironmentSwitcherProps {
  currentProfile: string;
  currentTable: string;
  currentQuery: QueryParams;
}

export function EnvironmentSwitcher({ currentProfile, currentTable, currentQuery }: EnvironmentSwitcherProps) {
  const { profiles } = useProfileStore();
  const { tablesByProfile, loadTables } = useTableStore();
  
  // Filter to sibling environments (e.g., pegasus-* profiles)
  const siblingProfiles = useMemo(() => {
    // Extract environment type from current profile
    const currentEnvType = extractEnvType(currentProfile); // "pegasus", "demo", etc.
    return profiles.filter(p => 
      p.name !== currentProfile && 
      extractEnvType(p.name) === currentEnvType
    );
  }, [profiles, currentProfile]);

  const handleOpenIn = async (targetProfile: string) => {
    // Ensure tables are loaded for target profile
    if (!tablesByProfile.has(targetProfile)) {
      await loadTables(targetProfile);
    }
    
    const targetTables = tablesByProfile.get(targetProfile) || [];
    const siblingTable = findSiblingTable(currentTable, targetTables);
    
    if (!siblingTable) {
      toast.error(`No matching table found in ${targetProfile}`);
      return;
    }
    
    // Clone query with new table name
    const newQuery: QueryParams = {
      ...currentQuery,
      tableName: siblingTable,
    };
    
    // Switch profile and execute
    selectProfile(profiles.find(p => p.name === targetProfile)!);
    executeQuery(targetProfile, newQuery);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <ArrowRightLeft className="h-4 w-4 mr-2" />
          Open in...
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {siblingProfiles.map(profile => (
          <DropdownMenuItem 
            key={profile.name}
            onClick={() => handleOpenIn(profile.name)}
          >
            {profile.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function extractEnvType(profileName: string): string {
  // "pegasus-1-power-user" → "pegasus"
  // "demo-3-power-user" → "demo"
  const match = profileName.match(/^([a-z]+)-\d+/);
  return match ? match[1] : profileName;
}
```

---

## 6. README-Based Query Suggestions (Future)

### Goal
Parse a README/docs file and suggest likely queries based on the documented data model.

### Approach

1. User pastes or uploads README content
2. Extract data model hints via pattern matching or LLM
3. Generate SavedQuery objects

### Simple Pattern Matching (No LLM)

**File: `src/lib/query-suggester.ts`**

```typescript
interface SuggestedQuery {
  name: string;
  description: string;
  params: Partial<QueryParams>;
}

/**
 * Extract query suggestions from documentation text.
 * Looks for patterns like:
 * - "pk: BRAND" or "PK = BRAND"
 * - "partition key is BRAND"
 * - Tables with single-table design hints
 */
export function suggestQueriesFromDocs(
  docContent: string,
  tableInfo: TableInfo
): SuggestedQuery[] {
  const suggestions: SuggestedQuery[] = [];
  const pkName = tableInfo.keySchema.find(k => k.keyType === 'HASH')?.attributeName || 'pk';
  
  // Look for "pk: VALUE" or "PK = VALUE" patterns
  const pkPatterns = [
    /(?:pk|partition\s*key)\s*[:=]\s*["']?([A-Z_]+)["']?/gi,
    /(?:pk|partition\s*key)\s+(?:is|equals)\s+["']?([A-Z_]+)["']?/gi,
  ];
  
  const seenPKs = new Set<string>();
  
  for (const pattern of pkPatterns) {
    let match;
    while ((match = pattern.exec(docContent)) !== null) {
      const pkValue = match[1].toUpperCase();
      if (!seenPKs.has(pkValue)) {
        seenPKs.add(pkValue);
        suggestions.push({
          name: `All ${pkValue.toLowerCase()}s`,
          description: `Query all items with ${pkName} = ${pkValue}`,
          params: {
            keyCondition: {
              pk: { name: pkName, value: pkValue },
            },
          },
        });
      }
    }
  }
  
  // Look for access patterns documented as bullet points
  // e.g., "- Get all brands: pk=BRAND"
  const accessPatternRegex = /[-*]\s*(.+?):\s*(?:pk|PK)\s*=\s*(\w+)/g;
  let apMatch;
  while ((apMatch = accessPatternRegex.exec(docContent)) !== null) {
    const [, description, pkValue] = apMatch;
    suggestions.push({
      name: description.trim(),
      description: `${pkName} = ${pkValue}`,
      params: {
        keyCondition: {
          pk: { name: pkName, value: pkValue.toUpperCase() },
        },
      },
    });
  }
  
  return suggestions;
}
```

### LLM-Powered Extraction (Optional Enhancement)

If simple patterns aren't enough, use OpenAI/Claude API:

```typescript
async function suggestQueriesWithLLM(
  docContent: string,
  tableInfo: TableInfo
): Promise<SuggestedQuery[]> {
  const prompt = `
Given this DynamoDB table schema:
- Partition Key: ${tableInfo.keySchema.find(k => k.keyType === 'HASH')?.attributeName}
- Sort Key: ${tableInfo.keySchema.find(k => k.keyType === 'RANGE')?.attributeName || 'none'}

And this documentation:
${docContent.slice(0, 4000)}

Extract likely query patterns. Return JSON array:
[{ "name": "Human readable name", "pk": "VALUE", "sk_prefix": "optional" }]
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  });
  
  // Parse and convert to SuggestedQuery format
  // ...
}
```

### UI Integration

```tsx
// In QueryBuilder component
const [savedQueries, setSavedQueries] = useState<SuggestedQuery[]>([]);

// "Import from README" button
<Button onClick={() => setShowReadmeDialog(true)}>
  <FileText className="h-4 w-4 mr-2" />
  Import from README
</Button>

// Saved queries dropdown
<Select onValueChange={loadSavedQuery}>
  <SelectTrigger>
    <SelectValue placeholder="Load saved query..." />
  </SelectTrigger>
  <SelectContent>
    {savedQueries.map(q => (
      <SelectItem key={q.name} value={q.name}>
        {q.name}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

---

## 7. Implementation Order

Recommended sequence:

1. **Query Builder** (core functionality)
2. **Results Table** (need to see query output)
3. **Post-Query IN Filter** (extends results)
4. **Export** (quick win, useful immediately)
5. **Environment Switcher** (high value for your workflow)
6. **Query Suggestions** (nice-to-have, can defer)

Each feature is relatively isolated — can be built and tested independently.

---

## 8. File Structure After Phase 2

```
src/
├── components/
│   ├── ui/                      # shadcn components
│   ├── ProfileSelector.tsx
│   ├── TableList.tsx
│   ├── TableInfo.tsx
│   ├── QueryBuilder/
│   │   ├── index.tsx            # Main query builder
│   │   ├── KeyConditionBuilder.tsx
│   │   ├── FilterBuilder.tsx
│   │   ├── IndexSelector.tsx
│   │   └── SavedQueries.tsx
│   ├── ResultsTable/
│   │   ├── index.tsx            # Main table with TanStack
│   │   ├── CellRenderer.tsx     # Type-aware cell display
│   │   ├── ColumnHeader.tsx     # Sortable headers
│   │   └── Pagination.tsx
│   ├── PostFilter/
│   │   ├── index.tsx
│   │   ├── InFilterInput.tsx    # Multi-value input
│   │   └── FilterChips.tsx      # Active filter display
│   ├── ExportDialog.tsx
│   ├── EnvironmentSwitcher.tsx
│   └── ReadmeImportDialog.tsx
├── stores/
│   ├── profile-store.ts
│   ├── table-store.ts
│   └── query-store.ts           # Query state, results, filters
├── lib/
│   ├── utils.ts
│   ├── post-filters.ts          # Client-side filtering
│   ├── table-matcher.ts         # Cross-env matching
│   └── query-suggester.ts       # README parsing
└── types/
    └── index.ts

electron/
├── ipc/
│   └── handlers.ts              # Add query, scan, export handlers
└── services/
    ├── config-parser.ts
    ├── credential-manager.ts
    ├── dynamo-client-factory.ts
    ├── query-builder.ts         # Expression building
    └── export-service.ts        # CSV/JSON generation
```
