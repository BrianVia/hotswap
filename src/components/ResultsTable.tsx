import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnOrderState,
} from '@tanstack/react-table';
import { ArrowUpDown, ArrowUp, ArrowDown, X, Loader2, ChevronRight, GripVertical, Copy, Check } from 'lucide-react';
import { Button } from './ui/button';
import { useQueryStore } from '@/stores/query-store';
import { useProfileStore } from '@/stores/profile-store';
import { useTableStore } from '@/stores/table-store';
import { cn } from '@/lib/utils';

function formatCellValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return value.toLocaleString();
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

// Copy tooltip component
function CopyTooltip({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="copy-tooltip absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-1 text-xs bg-foreground text-background rounded whitespace-nowrap z-50">
      Copied!
    </span>
  );
}

// Animated counter component
function AnimatedCounter({ value, className }: { value: number; className?: string }) {
  const [displayValue, setDisplayValue] = useState(value);
  const [animate, setAnimate] = useState(false);
  const prevValue = useRef(value);

  useEffect(() => {
    if (value !== prevValue.current) {
      setAnimate(true);
      // Animate counting up
      const diff = value - prevValue.current;
      const steps = Math.min(Math.abs(diff), 20);
      const stepValue = diff / steps;
      let currentStep = 0;

      const interval = setInterval(() => {
        currentStep++;
        if (currentStep >= steps) {
          setDisplayValue(value);
          clearInterval(interval);
          setTimeout(() => setAnimate(false), 300);
        } else {
          setDisplayValue(Math.round(prevValue.current + stepValue * currentStep));
        }
      }, 30);

      prevValue.current = value;
      return () => clearInterval(interval);
    }
  }, [value]);

  return (
    <span className={cn(className, animate && 'count-animate')}>
      {displayValue.toLocaleString()}
    </span>
  );
}

// Skeleton loader for table
function TableSkeleton() {
  return (
    <div className="p-4 space-y-3">
      {/* Header skeleton */}
      <div className="flex gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton h-4 w-24" />
        ))}
      </div>
      {/* Row skeletons */}
      {[1, 2, 3, 4, 5].map((row) => (
        <div key={row} className="flex gap-4">
          {[1, 2, 3, 4, 5].map((col) => (
            <div key={col} className="skeleton h-4" style={{ width: `${60 + Math.random() * 60}px` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

function CellRenderer({ value, onCopy }: { value: unknown; onCopy: (text: string) => void }) {
  const [expanded, setExpanded] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    // Don't copy if clicking expand button
    if ((e.target as HTMLElement).closest('button')) return;
    onCopy(formatCellValue(value));
  };

  if (value === null) {
    return (
      <span
        className="text-muted-foreground italic cursor-pointer hover:bg-muted/50 px-1 rounded transition-colors"
        onClick={handleClick}
      >
        null
      </span>
    );
  }

  if (value === undefined) {
    return <span className="text-muted-foreground">-</span>;
  }

  if (typeof value === 'boolean') {
    return (
      <span
        onClick={handleClick}
        className={cn(
          'px-1 py-0.5 rounded text-xs font-medium cursor-pointer hover:ring-1 hover:ring-ring transition-all',
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
    return (
      <span
        className="font-mono cursor-pointer hover:bg-muted/50 px-1 rounded transition-colors"
        onClick={handleClick}
      >
        {value.toLocaleString()}
      </span>
    );
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
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className={cn('transition-transform duration-200', expanded && 'rotate-90')}>
              <ChevronRight className="h-3 w-3" />
            </span>
            <span className="text-blue-500">{Array.isArray(value) ? 'Array' : 'Object'}</span>
            <span className="text-muted-foreground">
              ({Array.isArray(value) ? value.length : Object.keys(value).length})
            </span>
          </button>
        ) : (
          <span
            className="text-muted-foreground cursor-pointer hover:bg-muted/50 px-1 rounded transition-colors"
            onClick={handleClick}
          >
            {preview}
          </span>
        )}
        <div className={cn('expand-collapse', expanded && 'expanded')}>
          <div>
            <pre
              className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto max-w-md cursor-pointer hover:ring-1 hover:ring-ring transition-all"
              onClick={handleClick}
            >
              {json}
            </pre>
          </div>
        </div>
      </div>
    );
  }

  // String - truncate if too long
  const strValue = String(value);
  if (strValue.length > 80) {
    return (
      <span
        title={strValue}
        className="cursor-pointer hover:bg-muted/50 px-1 rounded transition-colors"
        onClick={handleClick}
      >
        {strValue.slice(0, 80)}...
      </span>
    );
  }

  return (
    <span
      className="cursor-pointer hover:bg-muted/50 px-1 rounded transition-colors"
      onClick={handleClick}
    >
      {strValue}
    </span>
  );
}

// Expanded row detail view
function RowDetail({ row }: { row: Record<string, unknown> }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (key: string, value: unknown) => {
    navigator.clipboard.writeText(formatCellValue(value));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1200);
  };

  return (
    <div className="row-detail-enter bg-muted/30 p-4 border-t">
      <div className="grid gap-2 text-sm max-h-[400px] overflow-y-auto">
        {Object.entries(row).map(([key, value]) => (
          <div key={key} className="flex gap-4 items-start group">
            <span className="font-medium text-muted-foreground min-w-[120px] shrink-0">{key}</span>
            <div className="flex-1 font-mono text-xs break-all">
              {typeof value === 'object' ? (
                <pre className="whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>
              ) : (
                formatCellValue(value)
              )}
            </div>
            <button
              onClick={() => handleCopy(key, value)}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded"
            >
              {copiedKey === key ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3 text-muted-foreground" />
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ResultsTable() {
  const { selectedProfile } = useProfileStore();
  const { selectedTable } = useTableStore();
  const {
    results,
    lastEvaluatedKey,
    isLoading,
    error,
    count,
    scannedCount,
    loadMore,
    clearResults,
  } = useQueryStore();

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>([]);
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [copiedCell, setCopiedCell] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const prevResultsLength = useRef(results.length);
  const headerRef = useRef<HTMLDivElement>(null);

  // Show success animation when results first load
  useEffect(() => {
    if (results.length > 0 && prevResultsLength.current === 0 && !isLoading) {
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 600);
    }
    prevResultsLength.current = results.length;
  }, [results.length, isLoading]);

  // Reset expanded rows when results change
  useEffect(() => {
    setExpandedRows(new Set());
  }, [results]);

  const handleCopy = useCallback((text: string, cellId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCell(cellId);
    setTimeout(() => setCopiedCell(null), 1200);
  }, []);

  const toggleRowExpand = useCallback((rowIndex: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowIndex)) {
        next.delete(rowIndex);
      } else {
        next.add(rowIndex);
      }
      return next;
    });
  }, []);

  // Dynamically generate columns from result data
  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    if (results.length === 0) return [];

    // Collect all unique keys from all items
    const allKeys = new Set<string>();
    results.forEach((item) => {
      Object.keys(item).forEach((key) => allKeys.add(key));
    });

    // Sort keys: pk/sk first, then alphabetically
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
            className="flex items-center gap-1 hover:text-foreground text-xs transition-colors"
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
      cell: ({ getValue, row }) => {
        const cellId = `${row.id}-${key}`;
        return (
          <div className="relative">
            <CellRenderer
              value={getValue()}
              onCopy={(text) => handleCopy(text, cellId)}
            />
            <CopyTooltip show={copiedCell === cellId} />
          </div>
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
  }, [results, copiedCell, handleCopy]);

  // Initialize column order when columns change
  useMemo(() => {
    if (columns.length > 0 && columnOrder.length === 0) {
      setColumnOrder(columns.map(c => c.id as string));
    }
  }, [columns]);

  const table = useReactTable({
    data: results,
    columns,
    state: { sorting, columnOrder },
    onSortingChange: setSorting,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
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

  const handleLoadMore = () => {
    if (!selectedProfile || !selectedTable) return;
    loadMore(selectedProfile.name, selectedTable);
  };

  // Show skeleton while loading initial results
  if (isLoading && results.length === 0) {
    return (
      <div className="border rounded-lg bg-card">
        <div className="flex items-center justify-between px-3 py-1.5 border-b">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium">Results</span>
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          </div>
        </div>
        <TableSkeleton />
      </div>
    );
  }

  // Empty state
  if (results.length === 0 && !isLoading && !error) {
    return null;
  }

  return (
    <div className="border rounded-lg bg-card">
      {/* Header */}
      <div
        ref={headerRef}
        className={cn(
          'flex items-center justify-between px-3 py-1.5 border-b transition-colors',
          showSuccess && 'success-flash'
        )}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">Results</span>
          {showSuccess && <Check className="h-3 w-3 text-green-500" />}
          <span className="text-xs text-muted-foreground">
            <AnimatedCounter value={count} /> items
            {scannedCount !== count && (
              <> (scanned <AnimatedCounter value={scannedCount} />)</>
            )}
          </span>
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={clearResults}>
          <X className="h-3 w-3" />
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-2 text-xs text-red-500">
          {error}
        </div>
      )}

      {/* Table */}
      {results.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b bg-muted/50">
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, header.id)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, header.id)}
                      onDragEnd={handleDragEnd}
                      className={cn(
                        'px-2 py-1.5 text-left font-medium text-muted-foreground cursor-grab active:cursor-grabbing transition-opacity',
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
              {table.getRowModel().rows.map((row, rowIndex) => (
                <>
                  <tr
                    key={row.id}
                    onClick={() => toggleRowExpand(rowIndex)}
                    className={cn(
                      'border-b last:border-0 hover:bg-muted/40 transition-colors cursor-pointer',
                      rowIndex % 2 === 0 ? 'bg-background' : 'bg-muted/50',
                      expandedRows.has(rowIndex) && 'bg-accent/50'
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="px-2 py-1 align-top max-w-xs truncate"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    ))}
                  </tr>
                  {expandedRows.has(rowIndex) && (
                    <tr key={`${row.id}-detail`}>
                      <td colSpan={row.getVisibleCells().length} className="p-0">
                        <RowDetail row={row.original} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t">
        <span className="text-xs text-muted-foreground">
          Showing <AnimatedCounter value={results.length} /> items
        </span>
        {lastEvaluatedKey && (
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs"
            onClick={handleLoadMore}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Loading...
              </>
            ) : (
              'Load More'
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
