import { Hash, Table2, Loader2, Layers, Database, ChevronDown, ChevronRight, Filter } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useTableStore } from '@/stores/table-store';
import { useProfileStore } from '@/stores/profile-store';
import { useQueryStore } from '@/stores/query-store';
import { QueryBuilder } from './QueryBuilder';
import { ResultsTable } from './ResultsTable';

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatNumber(num: number | undefined): string {
  if (num === undefined) return '-';
  return num.toLocaleString();
}

export function TableInfo() {
  const { selectedTable, isLoadingTableInfo } = useTableStore();
  const { selectedProfile } = useProfileStore();
  const { executeScan, results, clearResults, resetQueryParams } = useQueryStore();
  const [schemaExpanded, setSchemaExpanded] = useState(false);
  const [queryExpanded, setQueryExpanded] = useState(true);
  const lastScannedTable = useRef<string | null>(null);

  // Auto-scan when a new table is selected
  useEffect(() => {
    if (selectedTable && selectedProfile && selectedTable.tableName !== lastScannedTable.current) {
      lastScannedTable.current = selectedTable.tableName;
      clearResults();
      resetQueryParams();
      executeScan(selectedProfile.name, selectedTable.tableName);
    }
  }, [selectedTable?.tableName, selectedProfile?.name]);

  if (!selectedProfile) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Database className="h-16 w-16 mb-4 opacity-30" />
        <p className="text-lg">Select a profile to get started</p>
      </div>
    );
  }

  if (isLoadingTableInfo) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!selectedTable) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Table2 className="h-16 w-16 mb-4 opacity-30" />
        <p className="text-lg">Select a table to view details</p>
        <p className="text-sm mt-2">Choose a table from the list on the left</p>
      </div>
    );
  }

  const hashKey = selectedTable.keySchema.find((k) => k.keyType === 'HASH');
  const rangeKey = selectedTable.keySchema.find((k) => k.keyType === 'RANGE');

  const getAttributeType = (name: string): string => {
    const attr = selectedTable.attributeDefinitions.find((a) => a.attributeName === name);
    if (!attr) return '';
    switch (attr.attributeType) {
      case 'S': return 'String';
      case 'N': return 'Number';
      case 'B': return 'Binary';
      default: return attr.attributeType;
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-background border-b p-4 z-10">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold truncate">{selectedTable.tableName}</h2>
            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
              <span>{formatNumber(selectedTable.itemCount)} items</span>
              <span>·</span>
              <span>{formatBytes(selectedTable.tableSizeBytes)}</span>
              <span>·</span>
              <span className={
                selectedTable.tableStatus === 'ACTIVE'
                  ? 'text-green-500'
                  : 'text-yellow-500'
              }>
                {selectedTable.tableStatus}
              </span>
            </div>
          </div>
          <button
            onClick={() => setSchemaExpanded(!schemaExpanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {schemaExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            Schema
          </button>
        </div>

        {/* Collapsible Schema Info */}
        {schemaExpanded && (
          <div className="mt-4 pt-4 border-t space-y-4">
            {/* Primary Key */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm">
                <Hash className="h-4 w-4 text-blue-500" />
                <span className="font-medium">{hashKey?.attributeName}</span>
                <span className="text-xs text-muted-foreground">
                  ({getAttributeType(hashKey?.attributeName || '')})
                </span>
              </div>
              {rangeKey && (
                <>
                  <span className="text-muted-foreground">+</span>
                  <div className="flex items-center gap-2 text-sm">
                    <Layers className="h-4 w-4 text-purple-500" />
                    <span className="font-medium">{rangeKey.attributeName}</span>
                    <span className="text-xs text-muted-foreground">
                      ({getAttributeType(rangeKey.attributeName)})
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* GSIs */}
            {selectedTable.globalSecondaryIndexes && selectedTable.globalSecondaryIndexes.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  GSIs ({selectedTable.globalSecondaryIndexes.length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedTable.globalSecondaryIndexes.map((gsi) => {
                    const gsiHash = gsi.keySchema.find((k) => k.keyType === 'HASH');
                    const gsiRange = gsi.keySchema.find((k) => k.keyType === 'RANGE');
                    return (
                      <div key={gsi.indexName} className="px-2 py-1 rounded bg-muted text-xs">
                        <span className="font-medium">{gsi.indexName}</span>
                        <span className="text-muted-foreground ml-1">
                          ({gsiHash?.attributeName}{gsiRange && ` + ${gsiRange.attributeName}`})
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* LSIs */}
            {selectedTable.localSecondaryIndexes && selectedTable.localSecondaryIndexes.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  LSIs ({selectedTable.localSecondaryIndexes.length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedTable.localSecondaryIndexes.map((lsi) => {
                    const lsiRange = lsi.keySchema.find((k) => k.keyType === 'RANGE');
                    return (
                      <div key={lsi.indexName} className="px-2 py-1 rounded bg-muted text-xs">
                        <span className="font-medium">{lsi.indexName}</span>
                        <span className="text-muted-foreground ml-1">
                          ({hashKey?.attributeName}{lsiRange && ` + ${lsiRange.attributeName}`})
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Content: Query Builder + Results */}
      <div className="p-4 space-y-4">
        {/* Collapsible Query Builder */}
        <div className="border rounded-lg bg-card">
          <button
            onClick={() => setQueryExpanded(!queryExpanded)}
            className="w-full flex items-center justify-between p-3 text-sm font-medium hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              Query Builder
            </div>
            {queryExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          {queryExpanded && (
            <div className="border-t">
              <QueryBuilder tableInfo={selectedTable} />
            </div>
          )}
        </div>
        <ResultsTable />
      </div>
    </div>
  );
}
