import { useEffect, useRef, useMemo, useState, useCallback, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnOrderState,
  type VisibilityState,
  type ColumnSizingState,
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
  AlertCircle,
  AlertTriangle,
  Trash2,
  Pencil,
  Save,
  RotateCcw,
  Eye,
  EyeOff,
  Copy,
  Download,
  Code,
  Bookmark,
} from 'lucide-react';
import { Button } from './ui/button';
import { EditRowDialog } from './dialogs/EditRowDialog';
import { BulkEditDialog } from './dialogs/BulkEditDialog';
import { ScriptEditDialog } from './dialogs/ScriptEditDialog';
import { FieldPickerDialog } from './dialogs/FieldPickerDialog';
import { ExportDialog } from './dialogs/ExportDialog';
import { JsonEditorDialog } from './dialogs/JsonEditorDialog';
import { SaveBookmarkDialog } from './dialogs/SaveBookmarkDialog';
import { InsertRowDialog } from './dialogs/InsertRowDialog';
import { useTabsStore, type Tab } from '@/stores/tabs-store';
import { useProfileStore } from '@/stores/profile-store';
import { usePendingChangesStore, type PendingChange } from '@/stores/pending-changes-store';
import { cn } from '@/lib/utils';
import type { TableInfo, SkOperator, QueryParams, FilterOperator, FilterCondition, BatchWriteOperation } from '@/types';

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

function parseEditValue(value: string, originalType: unknown): unknown {
  // Try to preserve the original type
  if (value === 'null') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;

  // If original was a number, try to parse as number
  if (typeof originalType === 'number') {
    const num = Number(value);
    if (!isNaN(num)) return num;
  }

  // Try to parse as JSON for objects/arrays
  if (value.startsWith('{') || value.startsWith('[')) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  return value;
}

function extractPrimaryKey(
  row: Record<string, unknown>,
  tableInfo: TableInfo
): Record<string, unknown> {
  const pk: Record<string, unknown> = {};
  const hashKey = tableInfo.keySchema.find((k) => k.keyType === 'HASH');
  const rangeKey = tableInfo.keySchema.find((k) => k.keyType === 'RANGE');

  if (hashKey) {
    pk[hashKey.attributeName] = row[hashKey.attributeName];
  }
  if (rangeKey) {
    pk[rangeKey.attributeName] = row[rangeKey.attributeName];
  }
  return pk;
}

interface EditableCellRendererProps {
  value: unknown;
  columnId: string;
  rowIndex: number;
  tabId: string;
  tableInfo: TableInfo;
  row: Record<string, unknown>;
  isPkOrSk: boolean;
  pendingChange?: PendingChange;
  isRowDeleted: boolean;
  onAddChange: (tabId: string, change: Omit<PendingChange, 'id'>) => void;
}

const EditableCellRenderer = memo(function EditableCellRenderer({
  value,
  columnId,
  rowIndex,
  tabId,
  tableInfo,
  row,
  isPkOrSk,
  pendingChange,
  isRowDeleted,
  onAddChange,
}: EditableCellRendererProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [showPkWarning, setShowPkWarning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Determine displayed value (pending change or original)
  const displayValue = pendingChange?.newValue !== undefined ? pendingChange.newValue : value;

  const handleStartEdit = () => {
    if (isRowDeleted) return;
    setEditValue(formatCellValue(displayValue));
    setIsEditing(true);
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleConfirmEdit = () => {
    const newValue = parseEditValue(editValue, value);
    const originalValue = value;

    // Only add change if value actually changed
    if (JSON.stringify(newValue) !== JSON.stringify(displayValue)) {
      if (isPkOrSk) {
        setShowPkWarning(true);
        return;
      }
      onAddChange(tabId, {
        tabId,
        rowIndex,
        primaryKey: extractPrimaryKey(row, tableInfo),
        type: 'update',
        field: columnId,
        originalValue,
        newValue,
      });
    }
    setIsEditing(false);
  };

  const handleConfirmPkChange = () => {
    const newValue = parseEditValue(editValue, value);
    const newItem = { ...row, [columnId]: newValue };
    onAddChange(tabId, {
      tabId,
      rowIndex,
      primaryKey: extractPrimaryKey(row, tableInfo),
      type: 'pk-change',
      originalItem: row,
      newItem,
    });
    setShowPkWarning(false);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setShowPkWarning(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirmEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    } else if (e.key === 'Tab') {
      handleConfirmEdit();
    }
  };

  // PK/SK warning dialog
  if (showPkWarning) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-popover border rounded-lg shadow-lg p-4 max-w-md">
          <div className="flex items-center gap-2 text-amber-500 mb-3">
            <AlertCircle className="h-5 w-5" />
            <span className="font-semibold">Primary Key Change</span>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Changing the partition key or sort key will DELETE this item and CREATE a new one.
            This cannot be undone after applying.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={handleCancelEdit}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleConfirmPkChange}>
              Continue
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleConfirmEdit}
        className="w-full h-6 px-1 text-sm rounded border border-ring bg-background focus:outline-none"
      />
    );
  }

  return (
    <div
      onDoubleClick={handleStartEdit}
      className={cn(
        'cursor-pointer min-h-[20px]',
        pendingChange && 'bg-amber-500/20 rounded px-1',
        isRowDeleted && 'line-through opacity-50'
      )}
      title="Double-click to edit"
    >
      <CellRendererInner value={displayValue} />
    </div>
  );
});

const CellRendererInner = memo(function CellRendererInner({ value }: { value: unknown }) {
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
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
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
});

interface TabQueryBuilderProps {
  tab: Tab;
  tableInfo: TableInfo;
}

const TabQueryBuilder = memo(function TabQueryBuilder({ tab, tableInfo }: TabQueryBuilderProps) {
  const { updateTabQueryState } = useTabsStore();
  const queryState = tab.queryState;
  const profileName = tab.profileName;
  const [showSkCondition, setShowSkCondition] = useState(false);
  const [showSaveBookmark, setShowSaveBookmark] = useState(false);

  // Local state for inputs - provides instant feedback without waiting for store re-render
  const [localPkValue, setLocalPkValue] = useState(queryState.pkValue);
  const [localSkValue, setLocalSkValue] = useState(queryState.skValue);
  const [localSkEndValue, setLocalSkEndValue] = useState(queryState.skValue2); // For "between" operator

  // Sync local state when store changes externally (e.g., clear button, tab switch)
  useEffect(() => {
    setLocalPkValue(queryState.pkValue);
  }, [queryState.pkValue]);

  useEffect(() => {
    setLocalSkValue(queryState.skValue);
  }, [queryState.skValue]);

  useEffect(() => {
    setLocalSkEndValue(queryState.skValue2);
  }, [queryState.skValue2]);

  // Flush local values to store (called on blur and before running query)
  const flushToStore = useCallback(() => {
    updateTabQueryState(tab.id, {
      pkValue: localPkValue,
      skValue: localSkValue,
      skValue2: localSkEndValue,
    });
  }, [tab.id, localPkValue, localSkValue, localSkEndValue, updateTabQueryState]);

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
  // Sample first 100 items for performance - DynamoDB items have consistent schema
  const availableAttributes = useMemo(() => {
    if (queryState.results.length === 0) return [];

    const allKeys = new Set<string>();
    const sampleSize = Math.min(100, queryState.results.length);
    for (let i = 0; i < sampleSize; i++) {
      Object.keys(queryState.results[i]).forEach((key) => allKeys.add(key));
    }

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
    if (!profileName || !localPkValue.trim()) return;

    const startTime = Date.now();
    updateTabQueryState(tab.id, {
      // Persist local values to store
      pkValue: localPkValue,
      skValue: localSkValue,
      skValue2: localSkEndValue,
      // Reset query state
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

    // Listen for query start to capture query ID for cancellation
    const unsubscribeStart = window.dynomite.onQueryStarted(({ queryId }) => {
      updateTabQueryState(tab.id, { currentQueryId: queryId });
    });

    // Listen for progress updates from backend - stream items as they arrive
    const unsubscribe = window.dynomite.onQueryProgress((progress) => {
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
        currentQueryId: progress.isComplete ? undefined : progress.queryId,
      });
    });

    try {
      const params: QueryParams = {
        tableName: tableInfo.tableName,
        indexName: queryState.selectedIndex || undefined,
        keyCondition: {
          pk: { name: pkAttr?.attributeName || '', value: localPkValue },
        },
        filters: validFilters.length > 0 ? validFilters : undefined,
        scanIndexForward: queryState.scanForward,
      };

      // Use local SK values (not store values) since store update is async
      if (skAttr && localSkValue) {
        params.keyCondition.sk = {
          name: skAttr.attributeName,
          operator: queryState.skOperator,
          value: localSkValue,
          value2: queryState.skOperator === 'between' ? localSkEndValue : undefined,
        };
      }

      const result = await window.dynomite.queryTableBatch(profileName, params, queryState.maxResults);

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
        currentQueryId: undefined,
      });
    } finally {
      unsubscribe();
      unsubscribeStart();
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

    // Listen for query start to capture query ID for cancellation
    const unsubscribeStart = window.dynomite.onQueryStarted(({ queryId }) => {
      updateTabQueryState(tab.id, { currentQueryId: queryId });
    });

    // Listen for progress updates from backend - stream items as they arrive
    const unsubscribe = window.dynomite.onQueryProgress((progress) => {
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
        currentQueryId: progress.isComplete ? undefined : progress.queryId,
      });
    });

    try {
      const result = await window.dynomite.scanTableBatch(profileName, {
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
        currentQueryId: undefined,
      });
    } finally {
      unsubscribe();
      unsubscribeStart();
    }
  };

  const handleCancel = async () => {
    if (queryState.currentQueryId) {
      await window.dynomite.cancelQuery(queryState.currentQueryId);
      updateTabQueryState(tab.id, {
        isLoading: false,
        isFetchingMore: false,
        currentQueryId: undefined,
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && localPkValue.trim()) {
      e.preventDefault();
      handleRunQuery(); // Uses local values directly, persists to store
    }
  };

  const canQuery = localPkValue.trim().length > 0;

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
          value={localPkValue}
          onChange={(e) => setLocalPkValue(e.target.value)}
          onBlur={flushToStore}
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
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 shrink-0"
          onClick={() => setShowSaveBookmark(true)}
          title="Save query as bookmark"
        >
          <Bookmark className="h-4 w-4" />
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
            {localSkValue && (
              <span className="ml-1 px-1 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px]">
                {SK_OPERATORS.find(o => o.value === queryState.skOperator)?.label} "{localSkValue}"
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
                value={localSkValue}
                onChange={(e) => setLocalSkValue(e.target.value)}
                onBlur={flushToStore}
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
                    value={localSkEndValue}
                    onChange={(e) => setLocalSkEndValue(e.target.value)}
                    onBlur={flushToStore}
                    onKeyDown={handleKeyDown}
                    placeholder="end value"
                    className="flex-1 h-8 px-2 rounded border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </>
              )}
              {localSkValue && (
                <button
                  onClick={() => {
                    setLocalSkValue('');
                    setLocalSkEndValue('');
                    updateTabQueryState(tab.id, { skValue: '', skValue2: '' });
                  }}
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

      {/* Save Bookmark Dialog */}
      <SaveBookmarkDialog
        isOpen={showSaveBookmark}
        onClose={() => setShowSaveBookmark(false)}
        tableName={tableInfo.tableName}
        queryState={{
          selectedIndex: queryState.selectedIndex,
          pkValue: localPkValue,
          skOperator: queryState.skOperator,
          skValue: localSkValue,
          skValue2: localSkEndValue,
          filters: queryState.filters,
          maxResults: queryState.maxResults,
          scanForward: queryState.scanForward,
        }}
      />
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render when query builder relevant data changes
  // Ignore results, loading states, counts (those are for the results table)
  const prevQ = prevProps.tab.queryState;
  const nextQ = nextProps.tab.queryState;

  return (
    prevProps.tab.id === nextProps.tab.id &&
    prevProps.tab.profileName === nextProps.tab.profileName &&
    prevProps.tableInfo === nextProps.tableInfo &&
    prevQ.selectedIndex === nextQ.selectedIndex &&
    prevQ.scanForward === nextQ.scanForward &&
    prevQ.skOperator === nextQ.skOperator &&
    prevQ.filters === nextQ.filters &&
    prevQ.maxResults === nextQ.maxResults
  );
});

interface TabResultsTableProps {
  tab: Tab;
  tableInfo: TableInfo;
  onFetchMore: () => Promise<void>;
  onCancel: () => void;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  rowIndex: number | null;
  cellValue?: string;
  columnId?: string;
}

const TabResultsTable = memo(function TabResultsTable({ tab, tableInfo, onFetchMore, onCancel }: TabResultsTableProps) {
  const { updateTabQueryState } = useTabsStore();
  const { selectedProfile, getProfileEnvironment } = useProfileStore();
  const {
    getChangesForTab,
    addChange,
    clearChangesForTab,
    hasChanges,
    changeCount,
  } = usePendingChangesStore();
  const queryState = tab.queryState;
  const profileEnvironment = getProfileEnvironment(tab.profileName);
  const isProduction = profileEnvironment === 'prod';
  const parentRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [lastSelectedRow, setLastSelectedRow] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    rowIndex: null,
  });
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [jsonEditingRow, setJsonEditingRow] = useState<number | null>(null);
  const [bulkEditField, setBulkEditField] = useState<string | null>(null);
  const [scriptEditField, setScriptEditField] = useState<string | null>(null);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showSaveBookmarkDialog, setShowSaveBookmarkDialog] = useState(false);
  const [showInsertDialog, setShowInsertDialog] = useState(false);

  // Get PK and SK attribute names
  const hashKeyAttr = tableInfo.keySchema.find((k) => k.keyType === 'HASH')?.attributeName;
  const rangeKeyAttr = tableInfo.keySchema.find((k) => k.keyType === 'RANGE')?.attributeName;
  const pkSkAttrs = useMemo(() => new Set([hashKeyAttr, rangeKeyAttr].filter(Boolean)), [hashKeyAttr, rangeKeyAttr]);

  const pendingChanges = getChangesForTab(tab.id);
  const hasPendingChanges = hasChanges(tab.id);
  const pendingCount = changeCount(tab.id);

  // Stable callback for adding changes (prevents re-renders)
  const handleAddChange = useCallback((tabId: string, change: Omit<PendingChange, 'id'>) => {
    addChange(tabId, change);
  }, [addChange]);

  // Build fast lookup maps for pending changes (computed once per change set)
  const { cellChangesMap, deletedRowsSet } = useMemo(() => {
    const cellMap = new Map<string, PendingChange>(); // key: "rowIndex:field"
    const deletedSet = new Set<number>();

    pendingChanges.forEach((change) => {
      if (change.type === 'update' && change.field) {
        cellMap.set(`${change.rowIndex}:${change.field}`, change);
      } else if (change.type === 'delete') {
        deletedSet.add(change.rowIndex);
      }
    });

    return { cellChangesMap: cellMap, deletedRowsSet: deletedSet };
  }, [pendingChanges]);

  // Keyboard shortcut for Cmd+S / Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (hasPendingChanges) {
          setShowConfirmDialog(true);
        }
      }
      // Escape to clear selection
      if (e.key === 'Escape') {
        setSelectedRows(new Set());
      }
      // Cmd+A / Ctrl+A to select all
      if ((e.metaKey || e.ctrlKey) && e.key === 'a' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        setSelectedRows(new Set(queryState.results.map((_, i) => i)));
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [hasPendingChanges, queryState.results.length]);

  // Close context menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu({ visible: false, x: 0, y: 0, rowIndex: null });
      }
    };

    if (contextMenu.visible) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu.visible]);

  // Toggle column visibility
  const toggleColumnVisibility = useCallback((columnId: string) => {
    setHiddenColumns(prev => {
      const next = new Set(prev);
      if (next.has(columnId)) {
        next.delete(columnId);
      } else {
        next.add(columnId);
      }
      return next;
    });
  }, []);

  // Copy rows to clipboard
  const copyRowsToClipboard = useCallback((rowIndices: number[], fields?: string[]) => {
    const rows = rowIndices.map(idx => {
      const row = queryState.results[idx];
      if (!row) return null;
      if (fields) {
        const filtered: Record<string, unknown> = {};
        fields.forEach(f => {
          if (f in row) filtered[f] = row[f];
        });
        return filtered;
      }
      return row;
    }).filter(Boolean);

    const json = JSON.stringify(rows.length === 1 ? rows[0] : rows, null, 2);
    navigator.clipboard.writeText(json);
  }, [queryState.results]);

  // Get all field names from results (sample first 100 for performance - DynamoDB items have consistent schema)
  const allFieldNames = useMemo(() => {
    const fields = new Set<string>();
    const sampleSize = Math.min(100, queryState.results.length);
    for (let i = 0; i < sampleSize; i++) {
      Object.keys(queryState.results[i]).forEach(key => fields.add(key));
    }
    // Sort with PK/SK first
    return Array.from(fields).sort((a, b) => {
      if (a === hashKeyAttr) return -1;
      if (b === hashKeyAttr) return 1;
      if (a === rangeKeyAttr) return -1;
      if (b === rangeKeyAttr) return 1;
      return a.localeCompare(b);
    });
  }, [queryState.results, hashKeyAttr, rangeKeyAttr]);

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    if (queryState.results.length === 0) return [];

    // Sample first 100 items for column detection (DynamoDB items have consistent schema)
    const allKeys = new Set<string>();
    const sampleSize = Math.min(100, queryState.results.length);
    for (let i = 0; i < sampleSize; i++) {
      Object.keys(queryState.results[i]).forEach((key) => allKeys.add(key));
    }

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
            {pkSkAttrs.has(key) && (
              <span className="text-[10px] text-blue-500 font-normal">
                {key === hashKeyAttr ? 'PK' : 'SK'}
              </span>
            )}
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
      cell: ({ getValue, row }) => {
        const rowIndex = row.index;
        const rowData = queryState.results[rowIndex];
        // Use fast map lookups instead of store function calls
        const pendingChange = cellChangesMap.get(`${rowIndex}:${key}`);
        const rowDeleted = deletedRowsSet.has(rowIndex);
        const isPkOrSk = pkSkAttrs.has(key);

        return (
          <EditableCellRenderer
            value={getValue()}
            columnId={key}
            rowIndex={rowIndex}
            tabId={tab.id}
            tableInfo={tableInfo}
            row={rowData}
            isPkOrSk={isPkOrSk}
            pendingChange={pendingChange}
            isRowDeleted={rowDeleted}
            onAddChange={handleAddChange}
          />
        );
      },
      sortingFn: (rowA, rowB, columnId) => {
        const a = rowA.getValue(columnId);
        const b = rowB.getValue(columnId);
        const aStr = formatCellValue(a);
        const bStr = formatCellValue(b);
        return aStr.localeCompare(bStr, undefined, { numeric: true });
      },
    }));
  }, [queryState.results, tab.id, tableInfo, pkSkAttrs, hashKeyAttr, cellChangesMap, deletedRowsSet, handleAddChange]);

  // Initialize column order when columns change
  useEffect(() => {
    if (columns.length > 0 && columnOrder.length === 0) {
      setColumnOrder(columns.map(c => c.id as string));
    }
  }, [columns.length]);

  // Convert hiddenColumns Set to VisibilityState
  const columnVisibility = useMemo<VisibilityState>(() => {
    const visibility: VisibilityState = {};
    hiddenColumns.forEach(col => {
      visibility[col] = false;
    });
    return visibility;
  }, [hiddenColumns]);

  const table = useReactTable({
    data: queryState.results,
    columns,
    state: { sorting, columnOrder, columnVisibility, columnSizing },
    onSortingChange: setSorting,
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    defaultColumn: {
      minSize: 60,
      size: 150,
      maxSize: 800,
    },
  });

  const rows = table.getRowModel().rows;

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 10,
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

  const handleRowClick = useCallback((e: React.MouseEvent, rowIndex: number) => {
    if (e.metaKey || e.ctrlKey) {
      // Toggle selection
      setSelectedRows(prev => {
        const next = new Set(prev);
        if (next.has(rowIndex)) {
          next.delete(rowIndex);
        } else {
          next.add(rowIndex);
        }
        return next;
      });
    } else if (e.shiftKey && lastSelectedRow !== null) {
      // Range select
      const start = Math.min(lastSelectedRow, rowIndex);
      const end = Math.max(lastSelectedRow, rowIndex);
      const range = new Set<number>();
      for (let i = start; i <= end; i++) {
        range.add(i);
      }
      setSelectedRows(range);
    } else {
      // Single select
      setSelectedRows(new Set([rowIndex]));
    }
    setLastSelectedRow(rowIndex);
  }, [lastSelectedRow]);

  const handleContextMenu = useCallback((e: React.MouseEvent, rowIndex: number, cellValue?: string, columnId?: string) => {
    e.preventDefault();
    // If right-clicking on an unselected row, select it
    if (!selectedRows.has(rowIndex)) {
      setSelectedRows(new Set([rowIndex]));
    }
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      rowIndex,
      cellValue,
      columnId,
    });
  }, [selectedRows]);

  const handleDeleteRow = useCallback(() => {
    const rowsToDelete = selectedRows.size > 0 ? Array.from(selectedRows) : contextMenu.rowIndex !== null ? [contextMenu.rowIndex] : [];

    rowsToDelete.forEach(rowIndex => {
      const rowData = queryState.results[rowIndex];
      if (rowData) {
        addChange(tab.id, {
          tabId: tab.id,
          rowIndex,
          primaryKey: extractPrimaryKey(rowData, tableInfo),
          type: 'delete',
        });
      }
    });

    setContextMenu({ visible: false, x: 0, y: 0, rowIndex: null });
    setSelectedRows(new Set());
  }, [selectedRows, contextMenu.rowIndex, queryState.results, tab.id, tableInfo, addChange]);

  const handleDiscardChanges = useCallback(() => {
    clearChangesForTab(tab.id);
  }, [tab.id, clearChangesForTab]);

  const handleApplyChanges = useCallback(async () => {
    if (!selectedProfile) return;

    setIsSaving(true);
    try {
      const changes = getChangesForTab(tab.id);
      const operations: BatchWriteOperation[] = [];

      for (const change of changes) {
        if (change.type === 'delete') {
          operations.push({
            type: 'delete',
            tableName: tableInfo.tableName,
            key: change.primaryKey,
          });
        } else if (change.type === 'pk-change' && change.originalItem && change.newItem) {
          operations.push({
            type: 'pk-change',
            tableName: tableInfo.tableName,
            oldKey: extractPrimaryKey(change.originalItem, tableInfo),
            newItem: change.newItem,
          });
        } else if (change.type === 'update' && change.field) {
          // For updates, we need to send just the field update
          await window.dynomite.updateItem(
            selectedProfile.name,
            tableInfo.tableName,
            change.primaryKey,
            { [change.field]: change.newValue }
          );
        }
      }

      // Execute batch operations (deletes and pk-changes)
      if (operations.length > 0) {
        await window.dynomite.batchWrite(selectedProfile.name, operations);
      }

      // Clear pending changes and refresh
      clearChangesForTab(tab.id);
      setShowConfirmDialog(false);

      // Re-scan to get updated data
      updateTabQueryState(tab.id, {
        results: [],
        lastEvaluatedKey: undefined,
        count: 0,
        scannedCount: 0,
      });
    } catch (error) {
      console.error('Failed to apply changes:', error);
    } finally {
      setIsSaving(false);
    }
  }, [selectedProfile, tab.id, tableInfo, getChangesForTab, clearChangesForTab, updateTabQueryState]);

  const handleClearResults = () => {
    updateTabQueryState(tab.id, {
      results: [],
      lastEvaluatedKey: undefined,
      count: 0,
      scannedCount: 0,
      error: null,
    });
    clearChangesForTab(tab.id);
  };

  // Summary of changes for confirm dialog (must be before early return to maintain hook order)
  const changeSummary = useMemo(() => {
    const updates = pendingChanges.filter(c => c.type === 'update').length;
    const deletes = pendingChanges.filter(c => c.type === 'delete').length;
    const pkChanges = pendingChanges.filter(c => c.type === 'pk-change').length;
    return { updates, deletes, pkChanges };
  }, [pendingChanges]);

  if (queryState.results.length === 0 && !queryState.isLoading && !queryState.error) {
    return null;
  }

  return (
    <div className="border rounded-lg bg-card flex flex-col overflow-hidden h-full">
      {/* Pending Changes Bar */}
      {hasPendingChanges && (
        <div className="flex items-center justify-between px-3 py-2 bg-amber-500/10 border-b border-amber-500/30">
          <div className="flex items-center gap-2 text-sm">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="font-medium text-amber-600 dark:text-amber-400">
              {pendingCount} pending change{pendingCount !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDiscardChanges}
              className="h-7 text-xs"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Discard
            </Button>
            <Button
              size="sm"
              onClick={() => setShowConfirmDialog(true)}
              className="h-7 text-xs"
            >
              <Save className="h-3 w-3 mr-1" />
              Save
              <span className="ml-1 text-[10px] opacity-70">⌘S</span>
            </Button>
          </div>
        </div>
      )}

      {queryState.error && (
        <div className="px-3 py-2 text-xs text-red-500">
          {queryState.error}
        </div>
      )}

      {queryState.results.length > 0 && (
        <div
          ref={parentRef}
          className="overflow-auto flex-1 min-h-0"
        >
          <table className="text-sm border-collapse" style={{ width: table.getCenterTotalSize() }}>
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
                        'px-2 py-1.5 text-left font-medium text-muted-foreground cursor-grab active:cursor-grabbing whitespace-nowrap group relative',
                        draggedColumn === header.id && 'opacity-50'
                      )}
                      style={{ width: header.getSize() }}
                    >
                      <div className="flex items-center gap-1">
                        <GripVertical className="h-3 w-3 opacity-30" />
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleColumnVisibility(header.id);
                          }}
                          className="ml-auto p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity"
                          title="Hide column"
                        >
                          <EyeOff className="h-3 w-3" />
                        </button>
                      </div>
                      {/* Resize handle */}
                      <div
                        draggable={false}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          header.getResizeHandler()(e);
                        }}
                        onTouchStart={(e) => {
                          e.stopPropagation();
                          header.getResizeHandler()(e);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                          'absolute right-0 top-0 h-full w-2 cursor-col-resize select-none touch-none',
                          'hover:bg-primary/50 active:bg-primary',
                          header.column.getIsResizing() && 'bg-primary'
                        )}
                      />
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
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
                const originalIndex = row.index;
                const isSelected = selectedRows.has(originalIndex);
                const rowDeleted = deletedRowsSet.has(originalIndex);

                return (
                  <tr
                    key={row.id}
                    data-index={virtualRow.index}
                    onClick={(e) => handleRowClick(e, originalIndex)}
                    className={cn(
                      'border-b last:border-0 transition-colors cursor-pointer',
                      isSelected
                        ? 'bg-blue-500/20'
                        : virtualRow.index % 2 === 0
                        ? 'bg-background hover:bg-muted/40'
                        : 'bg-muted/50 hover:bg-muted/60',
                      rowDeleted && 'bg-red-500/20 opacity-60'
                    )}
                    style={{ height: `${virtualRow.size}px` }}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const cellValue = cell.getValue();
                      const cellString = cellValue === null ? 'null'
                        : cellValue === undefined ? ''
                        : typeof cellValue === 'object' ? JSON.stringify(cellValue, null, 2)
                        : String(cellValue);
                      return (
                        <td
                          key={cell.id}
                          className="px-2 py-1 align-top whitespace-nowrap select-text"
                          style={{ width: cell.column.getSize() }}
                          onContextMenu={(e) => handleContextMenu(e, originalIndex, cellString, cell.column.id)}
                        >
                          <div className="truncate">
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
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
          {selectedRows.size > 0 && (
            <span className="text-blue-500">({selectedRows.size} selected)</span>
          )}
          {hiddenColumns.size > 0 && (
            <button
              onClick={() => setHiddenColumns(new Set())}
              className="flex items-center gap-1 text-amber-500 hover:text-amber-400"
              title="Show all columns"
            >
              <Eye className="h-3 w-3" />
              <span>{hiddenColumns.size} hidden</span>
            </button>
          )}
          {queryState.scannedCount > queryState.count && (
            <span className="text-muted-foreground/60">({queryState.scannedCount.toLocaleString()} scanned)</span>
          )}
          {(queryState.isLoading || queryState.isFetchingMore) && (
            <>
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              <button
                onClick={onCancel}
                className="ml-1 px-1.5 py-0.5 rounded text-xs bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
              >
                Cancel Query
              </button>
            </>
          )}
          {queryState.queryElapsedMs !== undefined && (
            <span className="text-muted-foreground/60">
              · {queryState.queryElapsedMs >= 1000
                ? `${(queryState.queryElapsedMs / 1000).toFixed(1)}s`
                : `${queryState.queryElapsedMs}ms`}
            </span>
          )}
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
          <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => setShowInsertDialog(true)} title="Insert new record">
            <Plus className="h-3 w-3 mr-1" />
            <span className="text-xs">Insert</span>
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleClearResults} title="Clear results">
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu.visible && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 min-w-[200px] bg-popover border rounded-md shadow-lg py-1"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {/* Edit options - first like Dynobase */}
          {selectedRows.size <= 1 && contextMenu.rowIndex !== null && (
            <>
              <button
                onClick={() => {
                  setEditingRow(contextMenu.rowIndex);
                  setContextMenu({ visible: false, x: 0, y: 0, rowIndex: null });
                }}
                className="w-full flex items-center justify-between px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Pencil className="h-3.5 w-3.5" />
                  Edit Item
                </span>
              </button>
              <button
                onClick={() => {
                  setJsonEditingRow(contextMenu.rowIndex);
                  setContextMenu({ visible: false, x: 0, y: 0, rowIndex: null });
                }}
                className="w-full flex items-center justify-between px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Code className="h-3.5 w-3.5" />
                  Edit as JSON
                </span>
              </button>
              <div className="border-t my-1" />
            </>
          )}

          {/* Bulk edit for multiple rows */}
          {selectedRows.size > 1 && (
            <>
              <div className="px-3 py-1.5">
                <div className="text-xs text-muted-foreground mb-1">
                  Set field for {selectedRows.size} rows:
                </div>
                <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                  {columns.slice(0, 20).map((col) => (
                    <button
                      key={col.id}
                      onClick={() => {
                        setBulkEditField(col.id as string);
                        setContextMenu({ visible: false, x: 0, y: 0, rowIndex: null });
                      }}
                      className="px-2 py-0.5 text-xs rounded bg-muted hover:bg-accent transition-colors"
                    >
                      {col.id}
                    </button>
                  ))}
                </div>
              </div>
              {/* Quick edit options for right-clicked column */}
              {contextMenu.columnId && (
                <>
                  <button
                    onClick={() => {
                      setBulkEditField(contextMenu.columnId!);
                      setContextMenu({ visible: false, x: 0, y: 0, rowIndex: null });
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Set "{contextMenu.columnId}" to value... ({selectedRows.size} rows)
                  </button>
                  <button
                    onClick={() => {
                      setScriptEditField(contextMenu.columnId!);
                      setContextMenu({ visible: false, x: 0, y: 0, rowIndex: null });
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors"
                  >
                    <Code className="h-3.5 w-3.5" />
                    Edit "{contextMenu.columnId}" with JavaScript ({selectedRows.size} rows)
                  </button>
                </>
              )}
              <div className="border-t my-1" />
            </>
          )}

          {/* Copy options */}
          {contextMenu.cellValue !== undefined && selectedRows.size <= 1 && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(contextMenu.cellValue || '');
                setContextMenu({ visible: false, x: 0, y: 0, rowIndex: null });
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy Cell
              {contextMenu.columnId && (
                <span className="ml-auto text-xs text-muted-foreground truncate max-w-[100px]">
                  {contextMenu.columnId}
                </span>
              )}
            </button>
          )}
          <button
            onClick={() => {
              const rowsToCopy = selectedRows.size > 0 ? Array.from(selectedRows) : (contextMenu.rowIndex !== null ? [contextMenu.rowIndex] : []);
              copyRowsToClipboard(rowsToCopy);
              setContextMenu({ visible: false, x: 0, y: 0, rowIndex: null });
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy {selectedRows.size > 1 ? `${selectedRows.size} rows` : 'Row'}
          </button>
          <button
            onClick={() => {
              setShowFieldPicker(true);
              setContextMenu({ visible: false, x: 0, y: 0, rowIndex: null });
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors"
          >
            <Filter className="h-3.5 w-3.5" />
            Copy with filter...
          </button>

          <div className="border-t my-1" />

          {/* Export */}
          <button
            onClick={() => {
              setShowExportDialog(true);
              setContextMenu({ visible: false, x: 0, y: 0, rowIndex: null });
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export...
          </button>

          <div className="border-t my-1" />

          {/* Delete - last with keyboard shortcut */}
          <button
            onClick={handleDeleteRow}
            className="w-full flex items-center justify-between px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors text-red-500"
          >
            <span className="flex items-center gap-2">
              <Trash2 className="h-3.5 w-3.5" />
              Delete {selectedRows.size > 1 ? `${selectedRows.size} rows` : 'row'}
            </span>
            <span className="text-xs text-muted-foreground">⌘⌫</span>
          </button>
        </div>
      )}

      {/* Confirm Changes Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-popover border rounded-lg shadow-lg p-4 max-w-md w-full mx-4">
            <h3 className="font-semibold text-lg mb-3">Apply {pendingCount} Changes?</h3>
            {isProduction && (
              <div className="p-3 rounded-md bg-red-500/20 border border-red-500/50 mb-4">
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-semibold">
                  <AlertTriangle className="h-5 w-5" />
                  PRODUCTION ENVIRONMENT
                </div>
                <p className="text-sm text-red-600/80 dark:text-red-400/80 mt-1">
                  You are about to modify data in a production account.
                </p>
              </div>
            )}
            <div className="space-y-1 text-sm text-muted-foreground mb-4">
              {changeSummary.updates > 0 && (
                <div className="flex items-center gap-2">
                  <Pencil className="h-3.5 w-3.5" />
                  <span>Update {changeSummary.updates} field{changeSummary.updates !== 1 ? 's' : ''}</span>
                </div>
              )}
              {changeSummary.deletes > 0 && (
                <div className="flex items-center gap-2 text-red-500">
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete {changeSummary.deletes} row{changeSummary.deletes !== 1 ? 's' : ''}</span>
                </div>
              )}
              {changeSummary.pkChanges > 0 && (
                <div className="flex items-center gap-2 text-purple-500">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span>{changeSummary.pkChanges} key change{changeSummary.pkChanges !== 1 ? 's' : ''} (delete + create)</span>
                </div>
              )}
            </div>
            <div className="text-xs text-muted-foreground mb-4 p-2 bg-muted rounded">
              This will modify data in DynamoDB. This action cannot be undone.
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowConfirmDialog(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant={isProduction ? "destructive" : "default"}
                onClick={handleApplyChanges}
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    Applying...
                  </>
                ) : isProduction ? (
                  `Apply ${pendingCount} Changes to PROD`
                ) : (
                  'Apply Changes'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Row Dialog */}
      {editingRow !== null && queryState.results[editingRow] && (
        <EditRowDialog
          isOpen={editingRow !== null}
          onClose={() => setEditingRow(null)}
          row={queryState.results[editingRow]}
          rowIndex={editingRow}
          tabId={tab.id}
          tableInfo={tableInfo}
        />
      )}

      {/* JSON Editor Dialog */}
      {jsonEditingRow !== null && queryState.results[jsonEditingRow] && (
        <JsonEditorDialog
          isOpen={jsonEditingRow !== null}
          onClose={() => setJsonEditingRow(null)}
          row={queryState.results[jsonEditingRow]}
          rowIndex={jsonEditingRow}
          tabId={tab.id}
          tableInfo={tableInfo}
        />
      )}

      {/* Bulk Edit Dialog */}
      {bulkEditField !== null && (
        <BulkEditDialog
          isOpen={bulkEditField !== null}
          onClose={() => setBulkEditField(null)}
          fieldName={bulkEditField}
          selectedRows={Array.from(selectedRows)}
          results={queryState.results}
          tabId={tab.id}
          tableInfo={tableInfo}
        />
      )}

      {/* Script Edit Dialog */}
      {scriptEditField !== null && (
        <ScriptEditDialog
          isOpen={scriptEditField !== null}
          onClose={() => setScriptEditField(null)}
          fieldName={scriptEditField}
          selectedRows={Array.from(selectedRows)}
          results={queryState.results}
          tabId={tab.id}
          tableInfo={tableInfo}
        />
      )}

      {/* Field Picker Dialog */}
      <FieldPickerDialog
        isOpen={showFieldPicker}
        onClose={() => setShowFieldPicker(false)}
        fields={allFieldNames}
        rowCount={selectedRows.size > 0 ? selectedRows.size : (contextMenu.rowIndex !== null ? 1 : queryState.results.length)}
        onCopy={(selectedFields) => {
          const rowIndices = selectedRows.size > 0
            ? Array.from(selectedRows)
            : (contextMenu.rowIndex !== null ? [contextMenu.rowIndex] : queryState.results.map((_, i) => i));
          copyRowsToClipboard(rowIndices, selectedFields);
        }}
      />

      {/* Export Dialog */}
      <ExportDialog
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        fields={allFieldNames}
        rows={queryState.results}
        selectedRowIndices={Array.from(selectedRows)}
        tableName={tableInfo.tableName}
      />

      {/* Insert Row Dialog */}
      <InsertRowDialog
        isOpen={showInsertDialog}
        onClose={() => setShowInsertDialog(false)}
        onInserted={() => {
          // Clear results to encourage re-query
          updateTabQueryState(tab.id, {
            results: [],
            count: 0,
            scannedCount: 0,
            lastEvaluatedKey: undefined,
          });
        }}
        tableInfo={tableInfo}
        profileName={tab.profileName}
        existingColumns={allFieldNames}
      />
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render when relevant data changes
  // Ignore pkValue, skValue, skValue2 changes (input fields)
  const prevQ = prevProps.tab.queryState;
  const nextQ = nextProps.tab.queryState;

  return (
    prevProps.tab.id === nextProps.tab.id &&
    prevProps.tab.profileName === nextProps.tab.profileName &&
    prevProps.tableInfo === nextProps.tableInfo &&
    prevQ.results === nextQ.results &&
    prevQ.isLoading === nextQ.isLoading &&
    prevQ.isFetchingMore === nextQ.isFetchingMore &&
    prevQ.error === nextQ.error &&
    prevQ.count === nextQ.count &&
    prevQ.scannedCount === nextQ.scannedCount &&
    prevQ.lastEvaluatedKey === nextQ.lastEvaluatedKey &&
    prevQ.selectedIndex === nextQ.selectedIndex &&
    prevQ.scanForward === nextQ.scanForward &&
    prevQ.maxResults === nextQ.maxResults
  );
});

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
    const unsubscribe = window.dynomite.onQueryProgress((progress) => {
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

        const result = await window.dynomite.queryTableBatch(activeTab.profileName, params, queryState.maxResults);

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
        const result = await window.dynomite.scanTableBatch(activeTab.profileName, {
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

  // Cancel in-flight query
  const handleCancel = useCallback(async () => {
    if (activeTab?.queryState.currentQueryId) {
      await window.dynomite.cancelQuery(activeTab.queryState.currentQueryId);
      updateTabQueryState(activeTab.id, {
        isLoading: false,
        isFetchingMore: false,
        currentQueryId: undefined,
      });
    }
  }, [activeTab, updateTabQueryState]);

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
        const unsubscribe = window.dynomite.onQueryProgress((progress) => {
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
          const result = await window.dynomite.scanTableBatch(activeTab.profileName, {
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
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 bg-background border-b p-4">
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
      <div className="flex-1 min-h-0 p-4 flex flex-col gap-3 min-w-0">
        {/* Compact Query Builder */}
        <div className="shrink-0 border rounded-lg overflow-hidden">
          <TabQueryBuilder tab={activeTab} tableInfo={tableInfo} />
        </div>
        <div className="flex-1 min-h-0">
          <TabResultsTable tab={activeTab} tableInfo={tableInfo} onFetchMore={handleFetchMore} onCancel={handleCancel} />
        </div>
      </div>
    </div>
  );
}
