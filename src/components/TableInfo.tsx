import { Key, Hash, Table2, Loader2, Layers, Database } from 'lucide-react';
import { useTableStore } from '@/stores/table-store';
import { useProfileStore } from '@/stores/profile-store';

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
      <div className="sticky top-0 bg-background border-b p-4">
        <h2 className="text-lg font-semibold truncate">{selectedTable.tableName}</h2>
        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
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

      <div className="p-4 space-y-6">
        {/* Primary Key */}
        <section>
          <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <Key className="h-4 w-4" />
            Primary Key
          </h3>
          <div className="space-y-2">
            {hashKey && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Hash className="h-4 w-4 text-blue-500" />
                <div>
                  <div className="font-medium">{hashKey.attributeName}</div>
                  <div className="text-xs text-muted-foreground">
                    Partition Key · {getAttributeType(hashKey.attributeName)}
                  </div>
                </div>
              </div>
            )}
            {rangeKey && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Layers className="h-4 w-4 text-purple-500" />
                <div>
                  <div className="font-medium">{rangeKey.attributeName}</div>
                  <div className="text-xs text-muted-foreground">
                    Sort Key · {getAttributeType(rangeKey.attributeName)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Global Secondary Indexes */}
        {selectedTable.globalSecondaryIndexes && selectedTable.globalSecondaryIndexes.length > 0 && (
          <section>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              Global Secondary Indexes ({selectedTable.globalSecondaryIndexes.length})
            </h3>
            <div className="space-y-2">
              {selectedTable.globalSecondaryIndexes.map((gsi) => {
                const gsiHash = gsi.keySchema.find((k) => k.keyType === 'HASH');
                const gsiRange = gsi.keySchema.find((k) => k.keyType === 'RANGE');
                return (
                  <div key={gsi.indexName} className="p-3 rounded-lg border">
                    <div className="font-medium text-sm">{gsi.indexName}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {gsiHash?.attributeName}
                      {gsiRange && ` + ${gsiRange.attributeName}`}
                      {' · '}
                      {gsi.projection.projectionType}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Local Secondary Indexes */}
        {selectedTable.localSecondaryIndexes && selectedTable.localSecondaryIndexes.length > 0 && (
          <section>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              Local Secondary Indexes ({selectedTable.localSecondaryIndexes.length})
            </h3>
            <div className="space-y-2">
              {selectedTable.localSecondaryIndexes.map((lsi) => {
                const lsiRange = lsi.keySchema.find((k) => k.keyType === 'RANGE');
                return (
                  <div key={lsi.indexName} className="p-3 rounded-lg border">
                    <div className="font-medium text-sm">{lsi.indexName}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {hashKey?.attributeName}
                      {lsiRange && ` + ${lsiRange.attributeName}`}
                      {' · '}
                      {lsi.projection.projectionType}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
