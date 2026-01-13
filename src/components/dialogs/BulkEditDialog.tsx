import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/button';
import { usePendingChangesStore } from '@/stores/pending-changes-store';
import { cn } from '@/lib/utils';
import type { TableInfo } from '@/types';

interface BulkEditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  fieldName: string;
  selectedRows: number[];
  results: Record<string, unknown>[];
  tabId: string;
  tableInfo: TableInfo;
}

function parseValue(value: string, originalType: unknown): unknown {
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

export function BulkEditDialog({
  isOpen,
  onClose,
  fieldName,
  selectedRows,
  results,
  tabId,
  tableInfo,
}: BulkEditDialogProps) {
  const { addChange } = usePendingChangesStore();
  const [newValue, setNewValue] = useState('');

  // Check if field is PK or SK
  const hashKeyAttr = tableInfo.keySchema.find((k) => k.keyType === 'HASH')?.attributeName;
  const rangeKeyAttr = tableInfo.keySchema.find((k) => k.keyType === 'RANGE')?.attributeName;
  const isPkOrSk = fieldName === hashKeyAttr || fieldName === rangeKeyAttr;

  // Get sample of current values for reference
  const sampleValues = selectedRows
    .slice(0, 3)
    .map(idx => {
      const row = results[idx];
      const value = row?.[fieldName];
      if (value === null) return 'null';
      if (value === undefined) return '(undefined)';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    });

  const handleApply = () => {
    // Get a sample row to determine the original type
    const sampleRow = results[selectedRows[0]];
    const originalType = sampleRow?.[fieldName];
    const parsedValue = parseValue(newValue, originalType);

    selectedRows.forEach((rowIndex) => {
      const row = results[rowIndex];
      if (!row) return;

      const originalValue = row[fieldName];
      const primaryKey = extractPrimaryKey(row, tableInfo);

      // Skip if value didn't change
      if (JSON.stringify(originalValue) === JSON.stringify(parsedValue)) {
        return;
      }

      if (isPkOrSk) {
        // For PK/SK changes, we need to do delete + create
        const newItem = { ...row, [fieldName]: parsedValue };
        addChange(tabId, {
          tabId,
          rowIndex,
          primaryKey,
          type: 'pk-change',
          originalItem: row,
          newItem,
        });
      } else {
        addChange(tabId, {
          tabId,
          rowIndex,
          primaryKey,
          type: 'update',
          field: fieldName,
          originalValue,
          newValue: parsedValue,
        });
      }
    });

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm dialog-backdrop">
      <div className="bg-popover border rounded-lg shadow-lg w-full max-w-md mx-4 dialog-content">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold">
            Set "{fieldName}" for {selectedRows.length} rows
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* PK/SK Warning */}
          {isPkOrSk && (
            <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-sm">
              <span className="font-medium text-amber-600 dark:text-amber-400">Warning:</span>
              <span className="text-muted-foreground ml-1">
                Changing this key field will delete and recreate all {selectedRows.length} items.
              </span>
            </div>
          )}

          {/* Current values preview */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">
              Current values (sample):
            </div>
            <div className="text-xs font-mono bg-muted rounded p-2 space-y-0.5">
              {sampleValues.map((val, i) => (
                <div key={i} className="truncate">{val}</div>
              ))}
              {selectedRows.length > 3 && (
                <div className="text-muted-foreground">...and {selectedRows.length - 3} more</div>
              )}
            </div>
          </div>

          {/* New value input */}
          <div>
            <label className="text-sm font-medium mb-1 block">New value:</label>
            <input
              type="text"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="Enter new value"
              autoFocus
              className={cn(
                'w-full px-3 py-2 rounded-md border bg-background text-sm',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Use "null" for null, "true"/"false" for booleans, or JSON for objects/arrays.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t bg-muted/30">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleApply}>
            Apply to {selectedRows.length} rows
          </Button>
        </div>
      </div>
    </div>
  );
}
