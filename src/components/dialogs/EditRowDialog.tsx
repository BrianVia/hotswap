import { useState, useMemo, useEffect, memo, useCallback } from 'react';
import { AlertCircle, X, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';
import { usePendingChangesStore } from '@/stores/pending-changes-store';
import { cn } from '@/lib/utils';
import type { TableInfo } from '@/types';

interface EditRowDialogProps {
  isOpen: boolean;
  onClose: () => void;
  row: Record<string, unknown>;
  rowIndex: number;
  tabId: string;
  tableInfo: TableInfo;
}

function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return '';
  if (typeof value === 'boolean') return value.toString();
  if (typeof value === 'number') return value.toString();
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
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

interface FieldEditorProps {
  fieldName: string;
  value: unknown;
  originalValue: unknown;
  onChange: (value: string) => void;
  isPkOrSk: boolean;
  isModified: boolean;
}

const FieldEditor = memo(function FieldEditor({ fieldName, value, originalValue, onChange, isPkOrSk, isModified }: FieldEditorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const stringValue = formatValue(value);
  const isObject = typeof originalValue === 'object' && originalValue !== null;
  const isMultiLine = stringValue.includes('\n') || stringValue.length > 100;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-foreground">
          {fieldName}
        </label>
        {isPkOrSk && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            Key
          </span>
        )}
        {isModified && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
            Modified
          </span>
        )}
      </div>

      {isObject || isMultiLine ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1"
          >
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
          <textarea
            value={stringValue}
            onChange={(e) => onChange(e.target.value)}
            rows={isExpanded ? 10 : 3}
            className={cn(
              'w-full px-3 py-2 rounded-md border bg-background text-sm font-mono resize-y',
              'focus:outline-none focus:ring-2 focus:ring-ring',
              isModified && 'border-blue-500',
              isPkOrSk && 'border-amber-500/50'
            )}
          />
        </div>
      ) : (
        <input
          type="text"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'w-full px-3 py-2 rounded-md border bg-background text-sm',
            'focus:outline-none focus:ring-2 focus:ring-ring',
            isModified && 'border-blue-500',
            isPkOrSk && 'border-amber-500/50'
          )}
        />
      )}
    </div>
  );
});

export function EditRowDialog({
  isOpen,
  onClose,
  row,
  rowIndex,
  tabId,
  tableInfo,
}: EditRowDialogProps) {
  const { addChange } = usePendingChangesStore();
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [showPkWarning, setShowPkWarning] = useState(false);

  // Get PK and SK attribute names
  const hashKeyAttr = tableInfo.keySchema.find((k) => k.keyType === 'HASH')?.attributeName;
  const rangeKeyAttr = tableInfo.keySchema.find((k) => k.keyType === 'RANGE')?.attributeName;
  const pkSkAttrs = new Set([hashKeyAttr, rangeKeyAttr].filter(Boolean));

  // Initialize edited values from row
  useEffect(() => {
    if (isOpen) {
      const initial: Record<string, string> = {};
      Object.entries(row).forEach(([key, value]) => {
        initial[key] = formatValue(value);
      });
      setEditedValues(initial);
    }
  }, [isOpen, row]);

  // Get sorted field names (PK/SK first)
  const fieldNames = useMemo(() => {
    return Object.keys(row).sort((a, b) => {
      if (a === hashKeyAttr) return -1;
      if (b === hashKeyAttr) return 1;
      if (a === rangeKeyAttr) return -1;
      if (b === rangeKeyAttr) return 1;
      return a.localeCompare(b);
    });
  }, [row, hashKeyAttr, rangeKeyAttr]);

  // Track modified fields
  const modifiedFields = useMemo(() => {
    const modified = new Set<string>();
    fieldNames.forEach(field => {
      const originalStr = formatValue(row[field]);
      const editedStr = editedValues[field] ?? originalStr;
      if (originalStr !== editedStr) {
        modified.add(field);
      }
    });
    return modified;
  }, [fieldNames, row, editedValues]);

  // Check if any PK/SK fields are modified
  const hasPkSkChanges = useMemo(() => {
    return Array.from(modifiedFields).some(field => pkSkAttrs.has(field));
  }, [modifiedFields, pkSkAttrs]);

  const handleFieldChange = useCallback((field: string, value: string) => {
    setEditedValues(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleSave = () => {
    if (modifiedFields.size === 0) {
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
      // Create new item with all edited values
      const newItem: Record<string, unknown> = {};
      fieldNames.forEach(field => {
        const editedStr = editedValues[field] ?? formatValue(row[field]);
        newItem[field] = parseValue(editedStr, row[field]);
      });

      addChange(tabId, {
        tabId,
        rowIndex,
        primaryKey,
        type: 'pk-change',
        originalItem: row,
        newItem,
      });
    } else {
      // Add individual field updates
      modifiedFields.forEach(field => {
        const originalValue = row[field];
        const newValue = parseValue(editedValues[field], originalValue);

        addChange(tabId, {
          tabId,
          rowIndex,
          primaryKey,
          type: 'update',
          field,
          originalValue,
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-popover border rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-lg">Edit Row</h3>
          <button
            onClick={handleCancel}
            className="p-1 rounded hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
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

        {/* Field Editors */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {fieldNames.map(field => (
            <FieldEditor
              key={field}
              fieldName={field}
              value={parseValue(editedValues[field] ?? formatValue(row[field]), row[field])}
              originalValue={row[field]}
              onChange={(value) => handleFieldChange(field, value)}
              isPkOrSk={pkSkAttrs.has(field)}
              isModified={modifiedFields.has(field)}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
          <div className="text-sm text-muted-foreground">
            {modifiedFields.size > 0 ? (
              <span>{modifiedFields.size} field{modifiedFields.size !== 1 ? 's' : ''} modified</span>
            ) : (
              <span>No changes</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={modifiedFields.size === 0}
            >
              {showPkWarning ? 'Confirm Changes' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
