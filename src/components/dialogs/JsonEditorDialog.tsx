import { useState, useEffect, useMemo } from 'react';
import { AlertCircle, X, Copy, Check, Code } from 'lucide-react';
import { Button } from '../ui/button';
import { usePendingChangesStore } from '@/stores/pending-changes-store';
import { cn } from '@/lib/utils';
import type { TableInfo } from '@/types';

interface JsonEditorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  row: Record<string, unknown>;
  rowIndex: number;
  tabId: string;
  tableInfo: TableInfo;
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

export function JsonEditorDialog({
  isOpen,
  onClose,
  row,
  rowIndex,
  tabId,
  tableInfo,
}: JsonEditorDialogProps) {
  const { addChange } = usePendingChangesStore();
  const [jsonText, setJsonText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [showPkWarning, setShowPkWarning] = useState(false);
  const [copied, setCopied] = useState(false);

  // Get PK and SK attribute names
  const hashKeyAttr = tableInfo.keySchema.find((k) => k.keyType === 'HASH')?.attributeName;
  const rangeKeyAttr = tableInfo.keySchema.find((k) => k.keyType === 'RANGE')?.attributeName;
  const pkSkAttrs = new Set([hashKeyAttr, rangeKeyAttr].filter(Boolean));

  // Initialize JSON text from row
  useEffect(() => {
    if (isOpen) {
      setJsonText(JSON.stringify(row, null, 2));
      setParseError(null);
      setShowPkWarning(false);
    }
  }, [isOpen, row]);

  // Parse the edited JSON and detect changes
  const { parsedJson, changes, hasPkSkChanges, isValid } = useMemo(() => {
    try {
      const parsed = JSON.parse(jsonText);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { parsedJson: null, changes: [], hasPkSkChanges: false, isValid: false };
      }

      // Detect changes by comparing each field
      const changedFields: { field: string; oldValue: unknown; newValue: unknown }[] = [];
      let pkSkChanged = false;

      // Check for modified or added fields
      Object.keys(parsed).forEach((key) => {
        const oldValue = row[key];
        const newValue = parsed[key];
        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
          changedFields.push({ field: key, oldValue, newValue });
          if (pkSkAttrs.has(key)) {
            pkSkChanged = true;
          }
        }
      });

      // Check for removed fields (set to undefined/null)
      Object.keys(row).forEach((key) => {
        if (!(key in parsed)) {
          changedFields.push({ field: key, oldValue: row[key], newValue: undefined });
          if (pkSkAttrs.has(key)) {
            pkSkChanged = true;
          }
        }
      });

      return { parsedJson: parsed, changes: changedFields, hasPkSkChanges: pkSkChanged, isValid: true };
    } catch {
      return { parsedJson: null, changes: [], hasPkSkChanges: false, isValid: false };
    }
  }, [jsonText, row, pkSkAttrs]);

  const handleJsonChange = (value: string) => {
    setJsonText(value);
    try {
      JSON.parse(value);
      setParseError(null);
    } catch (e) {
      setParseError((e as Error).message);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(jsonText);
      setJsonText(JSON.stringify(parsed, null, 2));
      setParseError(null);
    } catch {
      // Keep current text if invalid
    }
  };

  const handleSave = () => {
    if (!isValid || changes.length === 0) {
      onClose();
      return;
    }

    // If PK/SK changed, show warning first
    if (hasPkSkChanges && !showPkWarning) {
      setShowPkWarning(true);
      return;
    }

    const primaryKey = extractPrimaryKey(row, tableInfo);

    if (hasPkSkChanges) {
      // Create new item with all edited values (pk-change)
      addChange(tabId, {
        tabId,
        rowIndex,
        primaryKey,
        type: 'pk-change',
        originalItem: row,
        newItem: parsedJson as Record<string, unknown>,
      });
    } else {
      // Add individual field updates
      changes.forEach(({ field, oldValue, newValue }) => {
        addChange(tabId, {
          tabId,
          rowIndex,
          primaryKey,
          type: 'update',
          field,
          originalValue: oldValue,
          newValue,
        });
      });
    }

    onClose();
  };

  const handleCancel = () => {
    setShowPkWarning(false);
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    // Only close if clicking the backdrop itself and there are no changes
    if (e.target === e.currentTarget && changes.length === 0) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm dialog-backdrop"
      onClick={handleBackdropClick}
    >
      <div className="bg-popover border rounded-lg shadow-lg w-[85vw] h-[85vh] overflow-hidden flex flex-col dialog-content">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Code className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-lg">View/Edit JSON</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              title="Copy to clipboard"
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
            <button
              onClick={handleFormat}
              className="px-2 py-1 text-xs rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              title="Format JSON"
            >
              Format
            </button>
            <button
              onClick={handleCancel}
              className="p-1 rounded hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* PK Warning */}
        {showPkWarning && (
          <div className="mx-4 mt-4 p-3 rounded-md bg-amber-500/10 border border-amber-500/30">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-2">
              <AlertCircle className="h-4 w-4" />
              <span className="font-medium">Primary Key Change</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Changing the partition key or sort key will DELETE this item and CREATE a new one.
              This cannot be undone after applying changes.
            </p>
          </div>
        )}

        {/* Parse Error */}
        {parseError && (
          <div className="mx-4 mt-4 p-2 rounded-md bg-red-500/10 border border-red-500/30">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="font-mono text-xs truncate">{parseError}</span>
            </div>
          </div>
        )}

        {/* JSON Editor */}
        <div className="flex-1 overflow-hidden p-4 flex flex-col">
          <textarea
            value={jsonText}
            onChange={(e) => handleJsonChange(e.target.value)}
            spellCheck={false}
            className={cn(
              'w-full flex-1 p-3 rounded-md border bg-muted/30 font-mono text-sm resize-none',
              'focus:outline-none focus:ring-2 focus:ring-ring',
              parseError && 'border-red-500'
            )}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
          <div className="text-sm text-muted-foreground">
            {isValid ? (
              changes.length > 0 ? (
                <span>
                  {changes.length} field{changes.length !== 1 ? 's' : ''} modified
                  {hasPkSkChanges && (
                    <span className="text-amber-500 ml-2">(includes key change)</span>
                  )}
                </span>
              ) : (
                <span>No changes</span>
              )
            ) : (
              <span className="text-red-500">Invalid JSON</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!isValid || changes.length === 0}
            >
              {showPkWarning ? 'Confirm Changes' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
