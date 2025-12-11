import { useMemo, useState, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnOrderState,
} from '@tanstack/react-table';
import { ArrowUpDown, ArrowUp, ArrowDown, X, Loader2, ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
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

  // String - truncate if too long
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
  }, [results]);

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

  // Empty state
  if (results.length === 0 && !isLoading && !error) {
    return null;
  }

  return (
    <div className="border rounded-lg bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">Results</span>
          <span className="text-xs text-muted-foreground">
            {count.toLocaleString()} items
            {scannedCount !== count && (
              <> (scanned {scannedCount.toLocaleString()})</>
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
              {table.getRowModel().rows.map((row, rowIndex) => (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b last:border-0 hover:bg-muted/40 transition-colors',
                    rowIndex % 2 === 0 ? 'bg-background' : 'bg-muted/50'
                  )}
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t">
        <span className="text-xs text-muted-foreground">
          Showing {results.length.toLocaleString()} items
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
