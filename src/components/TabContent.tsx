import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnOrderState,
} from '@tanstack/react-table';
import {
  Hash,
  Table2,
  Loader2,
  Layers,
  Database,
  ChevronDown,
  ChevronRight,
  Play,
  ScanLine,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  X,
  GripVertical,
  Plus,
  Filter,
  FastForward,
} from 'lucide-react';
import { Button } from './ui/button';
import { useTabsStore, type Tab } from '@/stores/tabs-store';
import { useProfileStore } from '@/stores/profile-store';
import { cn } from '@/lib/utils';
import type { TableInfo, SkOperator, QueryParams, FilterOperator, FilterCondition } from '@/types';

const SK_OPERATORS: { value: SkOperator; label: string }[] = [
  { value: 'eq', label: '=' },
  { value: 'begins_with', label: 'begins with' },
  { value: 'between', label: 'between' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
];

const FILTER_OPERATORS: { value: FilterOperator; label: string; needsValue: boolean }[] = [
  { value: 'eq', label: '=', needsValue: true },
  { value: 'ne', label: '≠', needsValue: true },
  { value: 'lt', label: '<', needsValue: true },
  { value: 'lte', label: '≤', needsValue: true },
  { value: 'gt', label: '>', needsValue: true },
  { value: 'gte', label: '≥', needsValue: true },
  { value: 'begins_with', label: 'begins with', needsValue: true },
  { value: 'contains', label: 'contains', needsValue: true },
  { value: 'exists', label: 'exists', needsValue: false },
  { value: 'not_exists', label: 'not exists', needsValue: false },
  { value: 'between', label: 'between', needsValue: true },
];

let filterIdCounter = 0;
const generateFilterId = () => `filter-${++filterIdCounter}`;

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

function formatCellValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return value.toLocaleString();
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function CellRenderer({ value }: { value: unknown }) {
  const [expanded, setExpanded] = useState(false);

  if (value === null) {
    return <span className="text-muted-foreground italic">null</span>;
  }

  if (value === undefined) {
    return <span className="text-muted-foreground">-</span>;
  }

  if (typeof value === 'boolean') {
    return (
      <span
        className={cn(
          'px-1 py-0.5 rounded text-xs font-medium',
          value
            ? 'bg-green-500/10 text-green-600 dark:text-green-400'
            : 'bg-red-500/10 text-red-600 dark:text-red-400'
        )}
      >
        {value ? 'true' : 'false'}
      </span>
    );
  }

  if (typeof value === 'number') {
    return <span className="font-mono">{value.toLocaleString()}</span>;
  }

  if (typeof value === 'object') {
    const json = JSON.stringify(value, null, 2);
    const preview = JSON.stringify(value);
    const isLong = preview.length > 40;

    return (
      <div className="font-mono text-xs">
        {isLong ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <span className="text-blue-500">{Array.isArray(value) ? 'Array' : 'Object'}</span>
            <span className="text-muted-foreground">
              ({Array.isArray(value) ? value.length : Object.keys(value).length})
            </span>
          </button>
        ) : (
          <span className="text-muted-foreground">{preview}</span>
        )}
        {expanded && (
          <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto max-w-md">
            {json}
          </pre>
        )}
      </div>
    );
  }

  const strValue = String(value);
  if (strValue.length > 80) {
    return (
      <span title={strValue} className="cursor-help">
        {strValue.slice(0, 80)}...
      </span>
    );
  }

  return <span>{strValue}</span>;
}

interface TabQueryBuilderProps {
  tab: Tab;
  tableInfo: TableInfo;
}

function TabQueryBuilder({ tab, tableInfo }: TabQueryBuilderProps) {
  const { updateTabQueryState } = useTabsStore();
  const queryState = tab.queryState;
  const profileName = tab.profileName;
  const [showSkCondition, setShowSkCondition] = useState(false);

  // Build list of all available partition key attributes with their index
  const pkOptions = useMemo(() => {
    const options: { attr: string; indexName: string | null; label: string }[] = [];

    // Primary table PK
    const primaryPk = tableInfo.keySchema.find((k) => k.keyType === 'HASH');
    if (primaryPk) {
      options.push({
        attr: primaryPk.attributeName,
        indexName: null,
        label: primaryPk.attributeName
      });
    }

    // GSI PKs
    tableInfo.globalSecondaryIndexes?.forEach((gsi) => {
      const gsiPk = gsi.keySchema.find((k) => k.keyType === 'HASH');
      if (gsiPk && !options.some(o => o.attr === gsiPk.attributeName && o.indexName === gsi.indexName)) {
        options.push({
          attr: gsiPk.attributeName,
          indexName: gsi.indexName,
          label: `${gsiPk.attributeName} (${gsi.indexName})`
        });
      }
    });

    // LSI PKs (same as primary but with different index)
    tableInfo.localSecondaryIndexes?.forEach((lsi) => {
      const lsiPk = lsi.keySchema.find((k) => k.keyType === 'HASH');
      if (lsiPk && !options.some(o => o.attr === lsiPk.attributeName && o.indexName === lsi.indexName)) {
        options.push({
          attr: lsiPk.attributeName,
          indexName: lsi.indexName,
          label: `${lsiPk.attributeName} (${lsi.indexName})`
        });
      }
    });

    return options;
  }, [tableInfo]);

  // Get current key schema based on selected index
  const keySchema = useMemo(() => {
    if (!queryState.selectedIndex) {
      return tableInfo.keySchema;
    }

    const gsi = tableInfo.globalSecondaryIndexes?.find(
      (g) => g.indexName === queryState.selectedIndex
    );
    if (gsi) return gsi.keySchema;

    const lsi = tableInfo.localSecondaryIndexes?.find(
      (l) => l.indexName === queryState.selectedIndex
    );
    if (lsi) return lsi.keySchema;

    return tableInfo.keySchema;
  }, [queryState.selectedIndex, tableInfo]);

  const pkAttr = keySchema.find((k) => k.keyType === 'HASH');
  const skAttr = keySchema.find((k) => k.keyType === 'RANGE');

  // Extract available attribute names from fetched results for filter suggestions
  const availableAttributes = useMemo(() => {
    if (queryState.results.length === 0) return [];

    const allKeys = new Set<string>();
    queryState.results.forEach((item) => {
      Object.keys(item).forEach((key) => allKeys.add(key));
    });

    return Array.from(allKeys).sort((a, b) => {
      const pkSk = ['pk', 'PK', 'sk', 'SK', 'id', 'ID'];
      const aIdx = pkSk.indexOf(a);
      const bIdx = pkSk.indexOf(b);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [queryState.results]);

  // Auto-show SK condition when there's a sort key
  useEffect(() => {
    if (skAttr && queryState.skValue) {
      setShowSkCondition(true);
    }
  }, [skAttr, queryState.skValue]);

  // Get the display name for current index
  const getIndexDisplayName = () => {
    if (!queryState.selectedIndex) return 'Primary';
    const gsi = tableInfo.globalSecondaryIndexes?.find(g => g.indexName === queryState.selectedIndex);
    if (gsi) return gsi.indexName;
    const lsi = tableInfo.localSecondaryIndexes?.find(l => l.indexName === queryState.selectedIndex);
    if (lsi) return lsi.indexName;
    return 'Primary';
  };

  // Handle attribute selection - auto-detect GSI
  const handlePkAttributeChange = (attrName: string) => {
    // Find if this attribute is a PK for any GSI
    const matchingOption = pkOptions.find(o => o.attr === attrName);
    if (matchingOption) {
      updateTabQueryState(tab.id, {
        selectedIndex: matchingOption.indexName,
      });
    }
  };

  // Filter out invalid filters (must have attribute name)
  const validFilters = queryState.filters.filter(f => f.attribute.trim());

  // Use batch API - single IPC call with backend pagination and progress events
  const handleRunQuery = async () => {
    if (!profileName || !queryState.pkValue) return;

    const startTime = Date.now();
    updateTabQueryState(tab.id, {
      isLoading: true,
      error: null,
      results: [],
      count: 0,
      scannedCount: 0,
      lastEvaluatedKey: undefined,
      queryStartTime: startTime,
      queryElapsedMs: 0,
    });

    // Accumulate items from progress events for streaming display
    let accumulatedItems: Record<string, unknown>[] = [];

    // Listen for progress updates from backend - stream items as they arrive
    const unsubscribe = window.hotswap.onQueryProgress((progress) => {
      if (progress.items && progress.items.length > 0) {
        accumulatedItems = [...accumulatedItems, ...progress.items];
      }
      updateTabQueryState(tab.id, {
        results: accumulatedItems,
        count: progress.count,
        scannedCount: progress.scannedCount,
        queryElapsedMs: progress.elapsedMs,
        isFetchingMore: !progress.isComplete,
        isLoading: !progress.isComplete,
      });
    });

    try {
      const params: QueryParams = {
        tableName: tableInfo.tableName,
        indexName: queryState.selectedIndex || undefined,
        keyCondition: {
          pk: { name: pkAttr?.attributeName || '', value: queryState.pkValue },
        },
        filters: validFilters.length > 0 ? validFilters : undefined,
        scanIndexForward: queryState.scanForward,
      };

      if (skAttr && queryState.skValue) {
        params.keyCondition.sk = {
          name: skAttr.attributeName,
          operator: queryState.skOperator,
          value: queryState.skValue,
          value2: queryState.skOperator === 'between' ? queryState.skValue2 : undefined,
        };
      }

      const result = await window.hotswap.queryTableBatch(profileName, params, queryState.maxResults);

      // Final update with complete results (in case any items weren't sent via progress)
      updateTabQueryState(tab.id, {
        results: result.items,
        count: result.count,
        scannedCount: result.scannedCount,
        lastEvaluatedKey: result.lastEvaluatedKey,
        isLoading: false,
        isFetchingMore: false,
        queryElapsedMs: result.elapsedMs,
      });
    } catch (error) {
      updateTabQueryState(tab.id, {
        error: (error as Error).message,
        isLoading: false,
        isFetchingMore: false,
        queryElapsedMs: Date.now() - startTime,
      });
    } finally {
      unsubscribe();
    }
  };

  const handleScan = async () => {
    if (!profileName) return;

    const startTime = Date.now();
    updateTabQueryState(tab.id, {
      isLoading: true,
      error: null,
      results: [],
      count: 0,
      scannedCount: 0,
      lastEvaluatedKey: undefined,
      queryStartTime: startTime,
      queryElapsedMs: 0,
    });

    // Accumulate items from progress events for streaming display
    let accumulatedItems: Record<string, unknown>[] = [];

    // Listen for progress updates from backend - stream items as they arrive
    const unsubscribe = window.hotswap.onQueryProgress((progress) => {
      if (progress.items && progress.items.length > 0) {
        accumulatedItems = [...accumulatedItems, ...progress.items];
      }
      updateTabQueryState(tab.id, {
        results: accumulatedItems,
        count: progress.count,
        scannedCount: progress.scannedCount,
        queryElapsedMs: progress.elapsedMs,
        isFetchingMore: !progress.isComplete,
        isLoading: !progress.isComplete,
      });
    });

    try {
      const result = await window.hotswap.scanTableBatch(profileName, {
        tableName: tableInfo.tableName,
        indexName: queryState.selectedIndex || undefined,
        filters: validFilters.length > 0 ? validFilters : undefined,
      }, queryState.maxResults);

      // Final update with complete results (in case any items weren't sent via progress)
      updateTabQueryState(tab.id, {
        results: result.items,
        count: result.count,
        scannedCount: result.scannedCount,
        lastEvaluatedKey: result.lastEvaluatedKey,
        isLoading: false,
        isFetchingMore: false,
        queryElapsedMs: result.elapsedMs,
      });
    } catch (error) {
      updateTabQueryState(tab.id, {
        error: (error as Error).message,
        isLoading: false,
        isFetchingMore: false,
        queryElapsedMs: Date.now() - startTime,
      });
    } finally {
      unsubscribe();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && queryState.pkValue.trim()) {
      e.preventDefault();
      handleRunQuery();
    }
  };

  const canQuery = queryState.pkValue.trim().length > 0;

  return (
    <div className="bg-card">
      {/* Compact Primary Query Row */}
      <div className="p-2 flex items-center gap-2">
        {/* Attribute (PK) selector */}
        <div className="relative shrink-0">
          <select
            value={pkAttr?.attributeName || ''}
            onChange={(e) => handlePkAttributeChange(e.target.value)}
            className="h-8 pl-2 pr-7 rounded border border-input bg-background text-xs font-medium appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {pkOptions.map((opt) => (
              <option key={`${opt.attr}-${opt.indexName || 'primary'}`} value={opt.attr}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
        </div>

        <span className="text-xs text-muted-foreground">=</span>

        {/* PK Value input */}
        <input
          type="text"
          value={queryState.pkValue}
          onChange={(e) => updateTabQueryState(tab.id, { pkValue: e.target.value })}
          onKeyDown={handleKeyDown}
          placeholder={`Enter ${pkAttr?.attributeName || 'pk'} value`}
          className="flex-1 min-w-0 h-8 px-2 rounded border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />

        {/* Index indicator */}
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
          {getIndexDisplayName()}
        </span>

        {/* Direction toggle (only if SK exists) */}
        {skAttr && (
          <button
            onClick={() => {
              // Clear results when direction changes - lastEvaluatedKey is invalid for opposite direction
              updateTabQueryState(tab.id, {
                scanForward: !queryState.scanForward,
                results: [],
                lastEvaluatedKey: undefined,
                count: 0,
                scannedCount: 0,
              });
            }}
            className="flex items-center gap-1 h-8 px-2 rounded border border-input text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
            title={queryState.scanForward ? 'Ascending' : 'Descending'}
          >
            {queryState.scanForward ? (
              <ArrowUp className="h-3 w-3" />
            ) : (
              <ArrowDown className="h-3 w-3" />
            )}
          </button>
        )}

        {/* Action buttons */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2 text-xs shrink-0"
          onClick={handleScan}
          disabled={queryState.isLoading}
        >
          <ScanLine className="h-3 w-3 mr-1" />
          Scan
        </Button>
        <Button
          size="sm"
          className="h-8 px-3 text-xs shrink-0"
          onClick={handleRunQuery}
          disabled={queryState.isLoading || !canQuery}
        >
          <Play className="h-3 w-3 mr-1" />
          Query
        </Button>
      </div>

      {/* Sort Key Condition (collapsible) */}
      {skAttr && (
        <div className="border-t">
          <button
            onClick={() => setShowSkCondition(!showSkCondition)}
            className="w-full flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
          >
            {showSkCondition ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Sort Key: {skAttr.attributeName}
            {queryState.skValue && (
              <span className="ml-1 px-1 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px]">
                {SK_OPERATORS.find(o => o.value === queryState.skOperator)?.label} "{queryState.skValue}"
              </span>
            )}
          </button>

          {showSkCondition && (
            <div className="px-2 pb-2 flex items-center gap-2">
              <div className="relative shrink-0">
                <select
                  value={queryState.skOperator}
                  onChange={(e) => updateTabQueryState(tab.id, { skOperator: e.target.value as SkOperator })}
                  className="h-8 pl-2 pr-7 rounded border border-input bg-background text-xs appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {SK_OPERATORS.map((op) => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
              </div>
              <input
                type="text"
                value={queryState.skValue}
                onChange={(e) => updateTabQueryState(tab.id, { skValue: e.target.value })}
                onKeyDown={handleKeyDown}
                placeholder={`${skAttr.attributeName} value`}
                className={cn(
                  'h-8 px-2 rounded border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring',
                  queryState.skOperator === 'between' ? 'w-32' : 'flex-1'
                )}
              />
              {queryState.skOperator === 'between' && (
                <>
                  <span className="text-xs text-muted-foreground">and</span>
                  <input
                    type="text"
                    value={queryState.skValue2}
                    onChange={(e) => updateTabQueryState(tab.id, { skValue2: e.target.value })}
                    onKeyDown={handleKeyDown}
                    placeholder="end value"
                    className="flex-1 h-8 px-2 rounded border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </>
              )}
              {queryState.skValue && (
                <button
                  onClick={() => updateTabQueryState(tab.id, { skValue: '', skValue2: '' })}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  title="Clear sort key condition"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Filters Section */}
      <div className="border-t">
        <button
          onClick={() => {
            const newFilter: FilterCondition = {
              id: generateFilterId(),
              attribute: '',
              operator: 'eq',
              value: '',
            };
            updateTabQueryState(tab.id, { filters: [...queryState.filters, newFilter] });
          }}
          className="w-full flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Add Filter
          {queryState.filters.length > 0 && (
            <span className="ml-1 px-1 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px]">
              {queryState.filters.length} active
            </span>
          )}
        </button>

        {queryState.filters.length > 0 && (
          <div className="px-2 pb-2 space-y-2">
            {queryState.filters.map((filter, index) => {
              const operatorConfig = FILTER_OPERATORS.find(o => o.value === filter.operator);
              return (
                <div key={filter.id} className="flex items-center gap-2">
                  <Filter className="h-3 w-3 text-muted-foreground shrink-0" />
                  {/* Attribute selector - dropdown with discovered keys + "Other..." */}
                  {availableAttributes.length > 0 && !availableAttributes.includes(filter.attribute) && filter.attribute !== '' ? (
                    // Custom attribute mode - show text input
                    <input
                      type="text"
                      value={filter.attribute}
                      onChange={(e) => {
                        const newFilters = [...queryState.filters];
                        newFilters[index] = { ...filter, attribute: e.target.value };
                        updateTabQueryState(tab.id, { filters: newFilters });
                      }}
                      onKeyDown={handleKeyDown}
                      placeholder="attribute"
                      className="w-28 h-7 px-2 rounded border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      autoFocus
                    />
                  ) : availableAttributes.length > 0 ? (
                    // Dropdown mode - show discovered attributes + "Other..."
                    <div className="relative shrink-0">
                      <select
                        value={filter.attribute}
                        onChange={(e) => {
                          const newFilters = [...queryState.filters];
                          if (e.target.value === '__other__') {
                            newFilters[index] = { ...filter, attribute: '' };
                          } else {
                            newFilters[index] = { ...filter, attribute: e.target.value };
                          }
                          updateTabQueryState(tab.id, { filters: newFilters });
                        }}
                        className="w-28 h-7 pl-2 pr-6 rounded border border-input bg-background text-xs appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">attribute...</option>
                        {availableAttributes.map((attr) => (
                          <option key={attr} value={attr}>{attr}</option>
                        ))}
                        <option value="__other__">Other...</option>
                      </select>
                      <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                    </div>
                  ) : (
                    // No results yet - plain text input
                    <input
                      type="text"
                      value={filter.attribute}
                      onChange={(e) => {
                        const newFilters = [...queryState.filters];
                        newFilters[index] = { ...filter, attribute: e.target.value };
                        updateTabQueryState(tab.id, { filters: newFilters });
                      }}
                      onKeyDown={handleKeyDown}
                      placeholder="attribute"
                      className="w-28 h-7 px-2 rounded border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  )}
                  {/* Operator selector */}
                  <div className="relative shrink-0">
                    <select
                      value={filter.operator}
                      onChange={(e) => {
                        const newFilters = [...queryState.filters];
                        newFilters[index] = { ...filter, operator: e.target.value as FilterOperator };
                        updateTabQueryState(tab.id, { filters: newFilters });
                      }}
                      className="h-7 pl-2 pr-6 rounded border border-input bg-background text-xs appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      {FILTER_OPERATORS.map((op) => (
                        <option key={op.value} value={op.value}>
                          {op.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                  </div>
                  {/* Value input (if needed) */}
                  {operatorConfig?.needsValue && (
                    <>
                      <input
                        type="text"
                        value={filter.value}
                        onChange={(e) => {
                          const newFilters = [...queryState.filters];
                          newFilters[index] = { ...filter, value: e.target.value };
                          updateTabQueryState(tab.id, { filters: newFilters });
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder="value"
                        className={cn(
                          'h-7 px-2 rounded border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring',
                          filter.operator === 'between' ? 'w-20' : 'flex-1'
                        )}
                      />
                      {filter.operator === 'between' && (
                        <>
                          <span className="text-xs text-muted-foreground">and</span>
                          <input
                            type="text"
                            value={filter.value2 || ''}
                            onChange={(e) => {
                              const newFilters = [...queryState.filters];
                              newFilters[index] = { ...filter, value2: e.target.value };
                              updateTabQueryState(tab.id, { filters: newFilters });
                            }}
                            onKeyDown={handleKeyDown}
                            placeholder="value"
                            className="flex-1 h-7 px-2 rounded border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </>
                      )}
                    </>
                  )}
                  {/* Remove button */}
                  <button
                    onClick={() => {
                      const newFilters = queryState.filters.filter((_, i) => i !== index);
                      updateTabQueryState(tab.id, { filters: newFilters });
                    }}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
                    title="Remove filter"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

interface TabResultsTableProps {
  tab: Tab;
  tableInfo: TableInfo;
  onFetchMore: () => Promise<void>;
}

function TabResultsTable({ tab, tableInfo: _tableInfo, onFetchMore }: TabResultsTableProps) {
  const { updateTabQueryState } = useTabsStore();
  const queryState = tab.queryState;
  const parentRef = useRef<HTMLDivElement>(null);

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>([]);
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    if (queryState.results.length === 0) return [];

    const allKeys = new Set<string>();
    queryState.results.forEach((item) => {
      Object.keys(item).forEach((key) => allKeys.add(key));
    });

    const sortedKeys = Array.from(allKeys).sort((a, b) => {
      const pkSk = ['pk', 'PK', 'sk', 'SK', 'id', 'ID'];
      const aIdx = pkSk.indexOf(a);
      const bIdx = pkSk.indexOf(b);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return a.localeCompare(b);
    });

    return sortedKeys.map((key) => ({
      id: key,
      accessorKey: key,
      header: ({ column }) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => column.toggleSorting()}
            className="flex items-center gap-1 hover:text-foreground text-xs"
          >
            {key}
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="h-3 w-3" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="h-3 w-3" />
            ) : (
              <ArrowUpDown className="h-3 w-3 opacity-40" />
            )}
          </button>
        </div>
      ),
      cell: ({ getValue }) => <CellRenderer value={getValue()} />,
      sortingFn: (rowA, rowB, columnId) => {
        const a = rowA.getValue(columnId);
        const b = rowB.getValue(columnId);
        const aStr = formatCellValue(a);
        const bStr = formatCellValue(b);
        return aStr.localeCompare(bStr, undefined, { numeric: true });
      },
    }));
  }, [queryState.results]);

  useMemo(() => {
    if (columns.length > 0 && columnOrder.length === 0) {
      setColumnOrder(columns.map(c => c.id as string));
    }
  }, [columns]);

  const table = useReactTable({
    data: queryState.results,
    columns,
    state: { sorting, columnOrder },
    onSortingChange: setSorting,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;

  // Virtual scrolling - only render visible rows
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32, // Estimated row height in px
    overscan: 10, // Render 10 extra rows above/below viewport
  });

  const handleDragStart = useCallback((e: React.DragEvent, columnId: string) => {
    setDraggedColumn(columnId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault();
    if (!draggedColumn || draggedColumn === targetColumnId) return;

    const newOrder = [...columnOrder];
    const draggedIdx = newOrder.indexOf(draggedColumn);
    const targetIdx = newOrder.indexOf(targetColumnId);

    if (draggedIdx !== -1 && targetIdx !== -1) {
      newOrder.splice(draggedIdx, 1);
      newOrder.splice(targetIdx, 0, draggedColumn);
      setColumnOrder(newOrder);
    }
    setDraggedColumn(null);
  }, [draggedColumn, columnOrder]);

  const handleDragEnd = useCallback(() => {
    setDraggedColumn(null);
  }, []);

  const handleClearResults = () => {
    updateTabQueryState(tab.id, {
      results: [],
      lastEvaluatedKey: undefined,
      count: 0,
      scannedCount: 0,
      error: null,
    });
  };

  if (queryState.results.length === 0 && !queryState.isLoading && !queryState.error) {
    return null;
  }

  return (
    <div className="border rounded-lg bg-card flex flex-col">
      {queryState.error && (
        <div className="px-3 py-2 text-xs text-red-500">
          {queryState.error}
        </div>
      )}

      {queryState.results.length > 0 && (
        <div
          ref={parentRef}
          className="overflow-auto flex-1"
          style={{ maxHeight: 'calc(100vh - 280px)' }}
        >
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b">
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, header.id)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, header.id)}
                      onDragEnd={handleDragEnd}
                      className={cn(
                        'px-2 py-1.5 text-left font-medium text-muted-foreground cursor-grab active:cursor-grabbing',
                        draggedColumn === header.id && 'opacity-50'
                      )}
                    >
                      <div className="flex items-center gap-1">
                        <GripVertical className="h-3 w-3 opacity-30" />
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {/* Top spacer for virtual items above viewport */}
              {rowVirtualizer.getVirtualItems().length > 0 && (
                <tr>
                  <td
                    colSpan={columns.length}
                    style={{ height: `${rowVirtualizer.getVirtualItems()[0]?.start ?? 0}px`, padding: 0 }}
                  />
                </tr>
              )}
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index];
                return (
                  <tr
                    key={row.id}
                    data-index={virtualRow.index}
                    className={cn(
                      'border-b last:border-0 hover:bg-muted/40 transition-colors',
                      virtualRow.index % 2 === 0 ? 'bg-background' : 'bg-muted/50'
                    )}
                    style={{ height: `${virtualRow.size}px` }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-2 py-1 align-top max-w-xs truncate">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {/* Bottom spacer for virtual items below viewport */}
              {rowVirtualizer.getVirtualItems().length > 0 && (
                <tr>
                  <td
                    colSpan={columns.length}
                    style={{
                      height: `${rowVirtualizer.getTotalSize() - (rowVirtualizer.getVirtualItems().at(-1)?.end ?? 0)}px`,
                      padding: 0,
                    }}
                  />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="sticky bottom-0 flex items-center justify-between px-3 py-1.5 border-t bg-card">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="font-medium">{queryState.results.length.toLocaleString()}</span>
          <span className="text-muted-foreground">items</span>
          {queryState.scannedCount > queryState.count && (
            <span className="text-muted-foreground/60">({queryState.scannedCount.toLocaleString()} scanned)</span>
          )}
          {(queryState.isLoading || queryState.isFetchingMore) && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          )}
          {queryState.queryElapsedMs !== undefined && (
            <span className="text-muted-foreground/60">
              · {queryState.queryElapsedMs >= 1000
                ? `${(queryState.queryElapsedMs / 1000).toFixed(1)}s`
                : `${queryState.queryElapsedMs}ms`}
            </span>
          )}
          {/* Fast-forward button to fetch more */}
          {queryState.lastEvaluatedKey && !queryState.isLoading && !queryState.isFetchingMore && (
            <button
              onClick={onFetchMore}
              className="ml-1 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Fetch more results"
            >
              <FastForward className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Max Results input */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Max</span>
            <input
              type="number"
              value={queryState.maxResults}
              onChange={(e) => updateTabQueryState(tab.id, { maxResults: Math.max(1, parseInt(e.target.value) || 1) })}
              min={1}
              max={100000}
              className="w-20 h-6 px-1.5 rounded border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleClearResults} title="Clear results">
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function TabContent() {
  const { tabs, activeTabId, updateTabQueryState } = useTabsStore();
  const { selectedProfile } = useProfileStore();
  const [schemaExpanded, setSchemaExpanded] = useState(false);
  const lastScannedTabs = useRef<Set<string>>(new Set());

  const activeTab = tabs.find(t => t.id === activeTabId);
  const tableInfo = activeTab?.tableInfo;

  const INITIAL_SCAN_LIMIT = 500;

  // Continue fetching more results beyond current set using batch API
  // NOTE: Must be before any early returns to maintain hook order
  const handleFetchMore = useCallback(async () => {
    if (!activeTab || !tableInfo) return;
    const queryState = activeTab.queryState;
    if (!activeTab.profileName || !queryState.lastEvaluatedKey) return;

    const startTime = queryState.queryStartTime || Date.now();
    const existingResults = queryState.results;
    const existingCount = queryState.count;
    const existingScanned = queryState.scannedCount;

    updateTabQueryState(activeTab.id, { isFetchingMore: true, error: null, queryStartTime: startTime });

    // Get current key schema based on selected index
    let keySchema = tableInfo.keySchema;
    if (queryState.selectedIndex) {
      const gsi = tableInfo.globalSecondaryIndexes?.find(g => g.indexName === queryState.selectedIndex);
      if (gsi) keySchema = gsi.keySchema;
      const lsi = tableInfo.localSecondaryIndexes?.find(l => l.indexName === queryState.selectedIndex);
      if (lsi) keySchema = lsi.keySchema;
    }
    const pkAttr = keySchema.find(k => k.keyType === 'HASH');
    const skAttr = keySchema.find(k => k.keyType === 'RANGE');
    const validFilters = queryState.filters.filter(f => f.attribute.trim());

    // Accumulate new items from progress events
    let accumulatedItems: Record<string, unknown>[] = [...existingResults];

    // Listen for progress updates from backend - stream items as they arrive
    const unsubscribe = window.hotswap.onQueryProgress((progress) => {
      if (progress.items && progress.items.length > 0) {
        accumulatedItems = [...accumulatedItems, ...progress.items];
      }
      updateTabQueryState(activeTab.id, {
        results: accumulatedItems,
        count: existingCount + progress.count,
        scannedCount: existingScanned + progress.scannedCount,
        queryElapsedMs: Date.now() - startTime,
        isFetchingMore: !progress.isComplete,
      });
    });

    try {
      // Use query if we have a PK value, otherwise scan
      if (queryState.pkValue && pkAttr) {
        const params: QueryParams = {
          tableName: tableInfo.tableName,
          indexName: queryState.selectedIndex || undefined,
          keyCondition: {
            pk: { name: pkAttr.attributeName, value: queryState.pkValue },
          },
          filters: validFilters.length > 0 ? validFilters : undefined,
          scanIndexForward: queryState.scanForward,
          exclusiveStartKey: queryState.lastEvaluatedKey,
        };

        if (skAttr && queryState.skValue) {
          params.keyCondition.sk = {
            name: skAttr.attributeName,
            operator: queryState.skOperator,
            value: queryState.skValue,
            value2: queryState.skOperator === 'between' ? queryState.skValue2 : undefined,
          };
        }

        const result = await window.hotswap.queryTableBatch(activeTab.profileName, params, queryState.maxResults);

        // Final update with complete results
        updateTabQueryState(activeTab.id, {
          results: [...existingResults, ...result.items],
          count: existingCount + result.count,
          scannedCount: existingScanned + result.scannedCount,
          lastEvaluatedKey: result.lastEvaluatedKey,
          isFetchingMore: false,
          queryElapsedMs: Date.now() - startTime,
        });
      } else {
        const result = await window.hotswap.scanTableBatch(activeTab.profileName, {
          tableName: tableInfo.tableName,
          indexName: queryState.selectedIndex || undefined,
          filters: validFilters.length > 0 ? validFilters : undefined,
          exclusiveStartKey: queryState.lastEvaluatedKey,
        }, queryState.maxResults);

        // Final update with complete results
        updateTabQueryState(activeTab.id, {
          results: [...existingResults, ...result.items],
          count: existingCount + result.count,
          scannedCount: existingScanned + result.scannedCount,
          lastEvaluatedKey: result.lastEvaluatedKey,
          isFetchingMore: false,
          queryElapsedMs: Date.now() - startTime,
        });
      }
    } catch (error) {
      updateTabQueryState(activeTab.id, {
        error: (error as Error).message,
        isFetchingMore: false,
        queryElapsedMs: Date.now() - startTime,
      });
    } finally {
      unsubscribe();
    }
  }, [activeTab, tableInfo, updateTabQueryState]);

  // Auto-scan when tab is opened for the first time using batch API
  useEffect(() => {
    if (activeTab && activeTab.tableInfo && !lastScannedTabs.current.has(activeTab.id)) {
      lastScannedTabs.current.add(activeTab.id);

      // Execute initial scan using batch API
      const executeInitialScan = async () => {
        const startTime = Date.now();
        updateTabQueryState(activeTab.id, {
          isLoading: true,
          error: null,
          results: [],
          count: 0,
          scannedCount: 0,
          lastEvaluatedKey: undefined,
          queryStartTime: startTime,
          queryElapsedMs: 0,
        });

        // Accumulate items from progress events for streaming display
        let accumulatedItems: Record<string, unknown>[] = [];

        // Listen for progress updates from backend - stream items as they arrive
        const unsubscribe = window.hotswap.onQueryProgress((progress) => {
          if (progress.items && progress.items.length > 0) {
            accumulatedItems = [...accumulatedItems, ...progress.items];
          }
          updateTabQueryState(activeTab.id, {
            results: accumulatedItems,
            count: progress.count,
            scannedCount: progress.scannedCount,
            queryElapsedMs: progress.elapsedMs,
            isFetchingMore: !progress.isComplete,
            isLoading: !progress.isComplete,
          });
        });

        try {
          const result = await window.hotswap.scanTableBatch(activeTab.profileName, {
            tableName: activeTab.tableInfo!.tableName,
          }, INITIAL_SCAN_LIMIT);

          // Final update with complete results (in case any items weren't sent via progress)
          updateTabQueryState(activeTab.id, {
            results: result.items,
            count: result.count,
            scannedCount: result.scannedCount,
            lastEvaluatedKey: result.lastEvaluatedKey,
            isLoading: false,
            isFetchingMore: false,
            queryElapsedMs: result.elapsedMs,
          });
        } catch (error) {
          updateTabQueryState(activeTab.id, {
            error: (error as Error).message,
            isLoading: false,
            isFetchingMore: false,
            queryElapsedMs: Date.now() - startTime,
          });
        } finally {
          unsubscribe();
        }
      };
      executeInitialScan();
    }
  }, [activeTab?.id]);

  if (!selectedProfile) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Database className="h-16 w-16 mb-4 opacity-30" />
        <p className="text-lg">Select a profile to get started</p>
      </div>
    );
  }

  if (!activeTab) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Table2 className="h-16 w-16 mb-4 opacity-30" />
        <p className="text-lg">Select a table to view details</p>
        <p className="text-sm mt-2">Choose a table from the list on the left</p>
      </div>
    );
  }

  if (!tableInfo) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hashKey = tableInfo.keySchema.find((k) => k.keyType === 'HASH');
  const rangeKey = tableInfo.keySchema.find((k) => k.keyType === 'RANGE');

  const getAttributeType = (name: string): string => {
    const attr = tableInfo.attributeDefinitions.find((a) => a.attributeName === name);
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
            <h2 className="text-lg font-semibold truncate">{tableInfo.tableName}</h2>
            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
              <span>{formatNumber(tableInfo.itemCount)} items</span>
              <span>·</span>
              <span>{formatBytes(tableInfo.tableSizeBytes)}</span>
              <span>·</span>
              <span className={
                tableInfo.tableStatus === 'ACTIVE'
                  ? 'text-green-500'
                  : 'text-yellow-500'
              }>
                {tableInfo.tableStatus}
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

        {schemaExpanded && (
          <div className="mt-4 pt-4 border-t space-y-4">
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

            {tableInfo.globalSecondaryIndexes && tableInfo.globalSecondaryIndexes.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  GSIs ({tableInfo.globalSecondaryIndexes.length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {tableInfo.globalSecondaryIndexes.map((gsi) => {
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

            {tableInfo.localSecondaryIndexes && tableInfo.localSecondaryIndexes.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  LSIs ({tableInfo.localSecondaryIndexes.length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {tableInfo.localSecondaryIndexes.map((lsi) => {
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

      {/* Main Content */}
      <div className="p-4 space-y-3">
        {/* Compact Query Builder */}
        <div className="border rounded-lg overflow-hidden">
          <TabQueryBuilder tab={activeTab} tableInfo={tableInfo} />
        </div>
        <TabResultsTable tab={activeTab} tableInfo={tableInfo} onFetchMore={handleFetchMore} />
      </div>
    </div>
  );
}
