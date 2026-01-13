import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, AlertCircle, Check, Minus } from 'lucide-react';
import { Button } from '../ui/button';
import { usePendingChangesStore } from '@/stores/pending-changes-store';
import { cn } from '@/lib/utils';
import type { TableInfo } from '@/types';

interface ScriptEditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  fieldName: string;
  selectedRows: number[];
  results: Record<string, unknown>[];
  tabId: string;
  tableInfo: TableInfo;
}

interface TransformResult {
  rowIndex: number;
  originalValue: unknown;
  newValue: unknown;
  changed: boolean;
  error?: string;
}

interface PreviewState {
  results: TransformResult[];
  changedCount: number;
  unchangedCount: number;
  errorCount: number;
}

const DEFAULT_SCRIPT = `values.map((value, index, row) => {
  // value = current cell value
  // index = position in selection (0-based)
  // row = full row object with all fields

  return value;
})`;

function preserveType(newValue: unknown, originalValue: unknown): unknown {
  // If same type, return as-is
  if (typeof newValue === typeof originalValue) {
    return newValue;
  }

  // String "null" -> null
  if (newValue === 'null') return null;

  // String to number if original was number
  if (typeof originalValue === 'number' && typeof newValue === 'string') {
    const num = Number(newValue);
    if (!isNaN(num)) return num;
  }

  // String to boolean if original was boolean
  if (typeof originalValue === 'boolean' && typeof newValue === 'string') {
    if (newValue === 'true') return true;
    if (newValue === 'false') return false;
  }

  return newValue;
}

function executeScript(
  script: string,
  values: unknown[],
  rows: Record<string, unknown>[]
): { results: unknown[] | null; error: string | null } {
  try {
    // Check if script already has a return statement at the start
    const trimmedScript = script.trim();
    const needsReturn = !trimmedScript.startsWith('return ') && !trimmedScript.startsWith('return\n');

    // Wrap user script in a function, adding return if needed
    const wrappedScript = `
      return (function(values, rows) {
        ${needsReturn ? 'return ' : ''}${script}
      })(values, rows);
    `;

    // Create function with controlled scope
    const fn = new Function('values', 'rows', wrappedScript);
    const results = fn(values, rows);

    // Validate results
    if (!Array.isArray(results)) {
      return { results: null, error: 'Script must return an array (use values.map(...))' };
    }

    if (results.length !== values.length) {
      return {
        results: null,
        error: `Expected ${values.length} results, got ${results.length}`,
      };
    }

    return { results, error: null };
  } catch (e) {
    return {
      results: null,
      error: e instanceof Error ? e.message : 'Unknown error',
    };
  }
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

function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function ScriptEditDialog({
  isOpen,
  onClose,
  fieldName,
  selectedRows,
  results,
  tabId,
  tableInfo,
}: ScriptEditDialogProps) {
  const { addChange } = usePendingChangesStore();
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPkWarning, setShowPkWarning] = useState(false);

  // Check if field is PK or SK
  const hashKeyAttr = tableInfo.keySchema.find((k) => k.keyType === 'HASH')?.attributeName;
  const rangeKeyAttr = tableInfo.keySchema.find((k) => k.keyType === 'RANGE')?.attributeName;
  const isPkOrSk = fieldName === hashKeyAttr || fieldName === rangeKeyAttr;

  // Get current values and full rows for the selected indices
  const { currentValues, fullRows } = useMemo(() => {
    const values = selectedRows.map((idx) => results[idx]?.[fieldName]);
    const rows = selectedRows.map((idx) => results[idx]);
    return { currentValues: values, fullRows: rows };
  }, [selectedRows, results, fieldName]);

  // Generate comment showing current values
  const valuesComment = useMemo(() => {
    const sample = currentValues.slice(0, 5).map(formatValue);
    const suffix = currentValues.length > 5 ? `, ... (${currentValues.length} total)` : '';
    return `// Current values: [${sample.join(', ')}${suffix}]`;
  }, [currentValues]);

  // Run preview with debounce
  const runPreview = useCallback(() => {
    const { results: transformed, error: execError } = executeScript(
      script,
      currentValues,
      fullRows
    );

    if (execError) {
      setError(execError);
      setPreview(null);
      return;
    }

    setError(null);

    if (!transformed) return;

    // Build preview results
    const previewResults: TransformResult[] = selectedRows.map((rowIndex, i) => {
      const originalValue = currentValues[i];
      const rawNewValue = transformed[i];
      const newValue = preserveType(rawNewValue, originalValue);
      const changed = JSON.stringify(originalValue) !== JSON.stringify(newValue);

      return { rowIndex, originalValue, newValue, changed };
    });

    const changedCount = previewResults.filter((r) => r.changed).length;
    const unchangedCount = previewResults.filter((r) => !r.changed && !r.error).length;
    const errorCount = previewResults.filter((r) => r.error).length;

    setPreview({ results: previewResults, changedCount, unchangedCount, errorCount });
  }, [script, currentValues, fullRows, selectedRows]);

  // Auto-preview with debounce
  useEffect(() => {
    const timer = setTimeout(runPreview, 300);
    return () => clearTimeout(timer);
  }, [runPreview]);

  const handleApply = useCallback(() => {
    if (!preview || preview.errorCount > 0) return;

    // Show PK warning first if needed
    if (isPkOrSk && !showPkWarning) {
      setShowPkWarning(true);
      return;
    }

    // Stage all changes
    preview.results.forEach(({ rowIndex, originalValue, newValue, changed }) => {
      if (!changed) return;

      const row = results[rowIndex];
      if (!row) return;

      const primaryKey = extractPrimaryKey(row, tableInfo);

      if (isPkOrSk) {
        const newItem = { ...row, [fieldName]: newValue };
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
          newValue,
        });
      }
    });

    onClose();
  }, [preview, isPkOrSk, showPkWarning, results, tableInfo, fieldName, tabId, addChange, onClose]);

  if (!isOpen) return null;

  const canApply = preview && preview.changedCount > 0 && preview.errorCount === 0 && !error;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm dialog-backdrop">
      <div className="bg-popover border rounded-lg shadow-lg w-full max-w-5xl mx-4 max-h-[90vh] flex flex-col dialog-content">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h3 className="font-semibold">
            Edit "{fieldName}" with JavaScript ({selectedRows.length} rows)
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* PK/SK Warning */}
          {isPkOrSk && (
            <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-sm">
              <span className="font-medium text-amber-600 dark:text-amber-400">Warning:</span>
              <span className="text-muted-foreground ml-1">
                Changing this key field will delete and recreate items.
              </span>
            </div>
          )}

          {/* Confirmation warning for PK changes */}
          {showPkWarning && (
            <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30 text-sm">
              <span className="font-medium text-red-600 dark:text-red-400">Confirm:</span>
              <span className="text-muted-foreground ml-1">
                This will delete and recreate {preview?.changedCount} items. Click Apply again to confirm.
              </span>
            </div>
          )}

          {/* Script editor */}
          <div>
            <label className="text-sm font-medium mb-1 block">Transform script:</label>
            <div className="text-xs text-muted-foreground font-mono mb-1 truncate">
              {valuesComment}
            </div>
            <textarea
              value={script}
              onChange={(e) => {
                setScript(e.target.value);
                setShowPkWarning(false);
              }}
              spellCheck={false}
              className={cn(
                'w-full px-3 py-2 rounded-md border bg-background text-sm font-mono',
                'focus:outline-none focus:ring-2 focus:ring-ring',
                'resize-y min-h-[200px]'
              )}
            />
          </div>

          {/* Error display */}
          {error && (
            <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30 text-sm flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <span className="text-red-600 dark:text-red-400 font-mono text-xs">{error}</span>
            </div>
          )}

          {/* Preview table */}
          {preview && !error && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Preview:</label>
                <div className="text-xs text-muted-foreground">
                  {preview.changedCount} changed, {preview.unchangedCount} unchanged
                </div>
              </div>
              <div className="border rounded-md overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left px-2 py-1.5 font-medium">Original</th>
                      <th className="text-left px-2 py-1.5 font-medium">New Value</th>
                      <th className="text-center px-2 py-1.5 font-medium w-16">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.results.slice(0, 50).map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1 font-mono truncate max-w-[200px]">
                          {formatValue(r.originalValue)}
                        </td>
                        <td
                          className={cn(
                            'px-2 py-1 font-mono truncate max-w-[200px]',
                            r.changed && 'text-green-600 dark:text-green-400'
                          )}
                        >
                          {formatValue(r.newValue)}
                        </td>
                        <td className="px-2 py-1 text-center">
                          {r.error ? (
                            <AlertCircle className="h-3.5 w-3.5 text-red-500 inline" />
                          ) : r.changed ? (
                            <Check className="h-3.5 w-3.5 text-green-500 inline" />
                          ) : (
                            <Minus className="h-3.5 w-3.5 text-muted-foreground inline" />
                          )}
                        </td>
                      </tr>
                    ))}
                    {preview.results.length > 50 && (
                      <tr className="border-t">
                        <td colSpan={3} className="px-2 py-1 text-center text-muted-foreground">
                          ... and {preview.results.length - 50} more rows
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t bg-muted/30 shrink-0">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={!canApply}>
            {showPkWarning ? 'Confirm Apply' : `Apply ${preview?.changedCount || 0} Changes`}
          </Button>
        </div>
      </div>
    </div>
  );
}
