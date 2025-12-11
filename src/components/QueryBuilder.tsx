import { useMemo } from 'react';
import { Play, ScanLine, ChevronDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from './ui/button';
import { useQueryStore } from '@/stores/query-store';
import { useProfileStore } from '@/stores/profile-store';
import { cn } from '@/lib/utils';
import type { TableInfo, SkOperator } from '@/types';

interface QueryBuilderProps {
  tableInfo: TableInfo;
}

const SK_OPERATORS: { value: SkOperator; label: string }[] = [
  { value: 'eq', label: '=' },
  { value: 'begins_with', label: 'begins with' },
  { value: 'between', label: 'between' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
];

export function QueryBuilder({ tableInfo }: QueryBuilderProps) {
  const { selectedProfile } = useProfileStore();
  const {
    selectedIndex,
    pkValue,
    skOperator,
    skValue,
    skValue2,
    limit,
    scanForward,
    isLoading,
    setSelectedIndex,
    setPkValue,
    setSkOperator,
    setSkValue,
    setSkValue2,
    setLimit,
    setScanForward,
    executeQuery,
    executeScan,
  } = useQueryStore();

  // Get available indexes (primary + GSIs + LSIs)
  const indexes = useMemo(() => {
    const result: { name: string | null; label: string }[] = [
      { name: null, label: 'Primary Table' },
    ];

    tableInfo.globalSecondaryIndexes?.forEach((gsi) => {
      result.push({ name: gsi.indexName, label: `GSI: ${gsi.indexName}` });
    });

    tableInfo.localSecondaryIndexes?.forEach((lsi) => {
      result.push({ name: lsi.indexName, label: `LSI: ${lsi.indexName}` });
    });

    return result;
  }, [tableInfo]);

  // Get key schema for selected index
  const keySchema = useMemo(() => {
    if (!selectedIndex) {
      return tableInfo.keySchema;
    }

    const gsi = tableInfo.globalSecondaryIndexes?.find(
      (g) => g.indexName === selectedIndex
    );
    if (gsi) return gsi.keySchema;

    const lsi = tableInfo.localSecondaryIndexes?.find(
      (l) => l.indexName === selectedIndex
    );
    if (lsi) return lsi.keySchema;

    return tableInfo.keySchema;
  }, [selectedIndex, tableInfo]);

  const pkAttr = keySchema.find((k) => k.keyType === 'HASH');
  const skAttr = keySchema.find((k) => k.keyType === 'RANGE');

  const handleRunQuery = () => {
    if (!selectedProfile || !pkValue) return;
    executeQuery(selectedProfile.name, tableInfo);
  };

  const handleScan = () => {
    if (!selectedProfile) return;
    executeScan(selectedProfile.name, tableInfo.tableName);
  };

  const canQuery = pkValue.trim().length > 0;

  return (
    <div className="bg-card">
      <div className="p-3 space-y-3">
        {/* Index Selector */}
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-muted-foreground w-20 shrink-0">
            Index
          </label>
          <div className="relative flex-1">
            <select
              value={selectedIndex || ''}
              onChange={(e) => setSelectedIndex(e.target.value || null)}
              className="w-full h-9 px-3 pr-8 rounded-md border border-input bg-background text-sm appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {indexes.map((idx) => (
                <option key={idx.name || 'primary'} value={idx.name || ''}>
                  {idx.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* Partition Key */}
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-muted-foreground w-20 shrink-0">
            {pkAttr?.attributeName || 'PK'}
          </label>
          <input
            type="text"
            value={pkValue}
            onChange={(e) => setPkValue(e.target.value)}
            placeholder={`Enter ${pkAttr?.attributeName || 'partition key'} value`}
            className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Sort Key (only if table has one) */}
        {skAttr && (
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-muted-foreground w-20 shrink-0">
              {skAttr.attributeName}
            </label>
            <div className="relative shrink-0">
              <select
                value={skOperator}
                onChange={(e) => setSkOperator(e.target.value as SkOperator)}
                className="h-9 pl-3 pr-8 rounded-md border border-input bg-background text-sm appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {SK_OPERATORS.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
            <input
              type="text"
              value={skValue}
              onChange={(e) => setSkValue(e.target.value)}
              placeholder={`${skAttr.attributeName} value`}
              className={cn(
                'h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring',
                skOperator === 'between' ? 'w-32' : 'flex-1'
              )}
            />
            {skOperator === 'between' && (
              <>
                <span className="text-sm text-muted-foreground">and</span>
                <input
                  type="text"
                  value={skValue2}
                  onChange={(e) => setSkValue2(e.target.value)}
                  placeholder="end value"
                  className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </>
            )}
          </div>
        )}

        {/* Options Row */}
        <div className="flex items-center gap-6 pt-2">
          {/* Limit */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Limit</label>
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
              max={1000}
              className="w-20 h-8 px-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Direction */}
          {skAttr && (
            <button
              onClick={() => setScanForward(!scanForward)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {scanForward ? (
                <ArrowUp className="h-4 w-4" />
              ) : (
                <ArrowDown className="h-4 w-4" />
              )}
              {scanForward ? 'Ascending' : 'Descending'}
            </button>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleScan}
              disabled={isLoading}
            >
              <ScanLine className="h-4 w-4 mr-1.5" />
              Scan
            </Button>
            <Button
              size="sm"
              onClick={handleRunQuery}
              disabled={isLoading || !canQuery}
            >
              <Play className="h-4 w-4 mr-1.5" />
              Query
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
