import { useState, useEffect, useCallback, useRef } from 'react';
import { AlertCircle, X, Plus, Trash2, GripHorizontal, ChevronDown, ChevronRight, Braces } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';
import type { TableInfo } from '@/types';

interface InsertRowDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onInserted: () => void;
  tableInfo: TableInfo;
  profileName: string;
  existingColumns: string[];
}

function parseValue(value: string): unknown {
  if (value === '') return undefined;
  if (value === 'null') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;

  // Try to parse as number
  const num = Number(value);
  if (!isNaN(num) && value.trim() !== '') return num;

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

interface FieldEntry {
  id: string;
  name: string;
  value: string;
  isJson: boolean;
  isExpanded: boolean;
}

let fieldIdCounter = 0;
const generateFieldId = () => `field-${++fieldIdCounter}`;

export function InsertRowDialog({
  isOpen,
  onClose,
  onInserted,
  tableInfo,
  profileName,
  existingColumns,
}: InsertRowDialogProps) {
  const [fields, setFields] = useState<FieldEntry[]>([]);
  const [isInserting, setIsInserting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawJsonMode, setRawJsonMode] = useState(false);
  const [rawJson, setRawJson] = useState('');

  // Resize state
  const [size, setSize] = useState({ width: 672, height: 600 });
  const isResizing = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const startSize = useRef({ width: 0, height: 0 });

  // Get PK and SK attribute names
  const hashKeyAttr = tableInfo.keySchema.find((k) => k.keyType === 'HASH')?.attributeName;
  const rangeKeyAttr = tableInfo.keySchema.find((k) => k.keyType === 'RANGE')?.attributeName;

  // Initialize fields when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSize({ width: 672, height: 600 });
      setError(null);
      setIsInserting(false);
      setRawJsonMode(false);
      setRawJson('');

      // Start with PK/SK fields, then add common columns
      const initialFields: FieldEntry[] = [];

      // Always add PK first
      if (hashKeyAttr) {
        initialFields.push({ id: generateFieldId(), name: hashKeyAttr, value: '', isJson: false, isExpanded: false });
      }
      // Add SK if exists
      if (rangeKeyAttr) {
        initialFields.push({ id: generateFieldId(), name: rangeKeyAttr, value: '', isJson: false, isExpanded: false });
      }

      // Add other common columns from existing data (excluding PK/SK)
      const pkSkSet = new Set([hashKeyAttr, rangeKeyAttr].filter(Boolean));
      existingColumns
        .filter((col) => !pkSkSet.has(col))
        .slice(0, 10) // Limit to first 10 additional columns
        .forEach((col) => {
          initialFields.push({ id: generateFieldId(), name: col, value: '', isJson: false, isExpanded: false });
        });

      setFields(initialFields);
    }
  }, [isOpen, hashKeyAttr, rangeKeyAttr, existingColumns]);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizing.current = true;
      startPos.current = { x: e.clientX, y: e.clientY };
      startSize.current = { ...size };

      const handleMouseMove = (e: MouseEvent) => {
        if (!isResizing.current) return;
        const deltaX = e.clientX - startPos.current.x;
        const deltaY = e.clientY - startPos.current.y;
        setSize({
          width: Math.max(400, Math.min(window.innerWidth * 0.95, startSize.current.width + deltaX)),
          height: Math.max(300, Math.min(window.innerHeight * 0.95, startSize.current.height + deltaY)),
        });
      };

      const handleMouseUp = () => {
        isResizing.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [size]
  );

  const handleFieldNameChange = useCallback((id: string, name: string) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
  }, []);

  const handleFieldValueChange = useCallback((id: string, value: string) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, value } : f)));
  }, []);

  const handleAddField = useCallback(() => {
    setFields((prev) => [...prev, { id: generateFieldId(), name: '', value: '', isJson: false, isExpanded: false }]);
  }, []);

  const handleToggleJson = useCallback((id: string) => {
    setFields((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const newIsJson = !f.isJson;
        // When switching to JSON mode, format the value if it's valid JSON
        let newValue = f.value;
        if (newIsJson && f.value.trim()) {
          try {
            const parsed = JSON.parse(f.value);
            newValue = JSON.stringify(parsed, null, 2);
          } catch {
            // If not valid JSON, wrap string in quotes or start fresh
            newValue = f.value.startsWith('{') || f.value.startsWith('[') ? f.value : '{}';
          }
        }
        return { ...f, isJson: newIsJson, value: newValue, isExpanded: newIsJson };
      })
    );
  }, []);

  const handleToggleExpand = useCallback((id: string) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, isExpanded: !f.isExpanded } : f)));
  }, []);

  const handleRemoveField = useCallback((id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleInsert = async () => {
    setError(null);

    let item: Record<string, unknown>;

    if (rawJsonMode) {
      // Parse raw JSON
      try {
        item = JSON.parse(rawJson);
        if (typeof item !== 'object' || item === null || Array.isArray(item)) {
          setError('JSON must be an object');
          return;
        }
      } catch {
        setError('Invalid JSON');
        return;
      }

      // Validate PK is in the JSON
      if (!item[hashKeyAttr!]) {
        setError(`Partition key (${hashKeyAttr}) is required`);
        return;
      }

      // Validate SK if table has one
      if (rangeKeyAttr && !item[rangeKeyAttr]) {
        setError(`Sort key (${rangeKeyAttr}) is required`);
        return;
      }
    } else {
      // Build item from fields
      // Validate PK is provided
      const pkField = fields.find((f) => f.name === hashKeyAttr);
      if (!pkField || !pkField.value.trim()) {
        setError(`Partition key (${hashKeyAttr}) is required`);
        return;
      }

      // Validate SK if table has one
      if (rangeKeyAttr) {
        const skField = fields.find((f) => f.name === rangeKeyAttr);
        if (!skField || !skField.value.trim()) {
          setError(`Sort key (${rangeKeyAttr}) is required`);
          return;
        }
      }

      item = {};
      for (const field of fields) {
        if (field.name.trim() && field.value.trim()) {
          const parsedValue = parseValue(field.value);
          if (parsedValue !== undefined) {
            item[field.name.trim()] = parsedValue;
          }
        }
      }
    }

    setIsInserting(true);
    try {
      const result = await window.dynomite.putItem(profileName, tableInfo.tableName, item);
      if (result.success) {
        onInserted();
        onClose();
      } else {
        setError('Failed to insert record');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to insert record');
    } finally {
      setIsInserting(false);
    }
  };

  if (!isOpen) return null;

  const isPkOrSk = (name: string) => name === hashKeyAttr || name === rangeKeyAttr;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm dialog-backdrop">
      <div
        className="bg-popover border rounded-lg shadow-lg overflow-hidden flex flex-col relative dialog-content"
        style={{ width: size.width, height: size.height, maxWidth: '95vw', maxHeight: '95vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-lg">Insert New Record</h3>
          <div className="flex items-center gap-2">
            {/* Mode toggle */}
            <div className="flex items-center rounded-md border bg-muted/30 p-0.5">
              <button
                onClick={() => setRawJsonMode(false)}
                className={cn(
                  'px-3 py-1 text-sm rounded transition-colors',
                  !rawJsonMode ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Fields
              </button>
              <button
                onClick={() => setRawJsonMode(true)}
                className={cn(
                  'px-3 py-1 text-sm rounded transition-colors flex items-center gap-1.5',
                  rawJsonMode ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Braces className="h-3.5 w-3.5" />
                JSON
              </button>
            </div>
            <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mt-4 p-3 rounded-md bg-red-500/10 border border-red-500/30">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {rawJsonMode ? (
            /* Raw JSON Editor */
            <div className="h-full flex flex-col gap-2">
              <div className="text-sm text-muted-foreground">
                Enter a complete JSON object. Required keys: <code className="px-1 py-0.5 rounded bg-muted font-mono text-xs">{hashKeyAttr}</code>
                {rangeKeyAttr && (
                  <>, <code className="px-1 py-0.5 rounded bg-muted font-mono text-xs">{rangeKeyAttr}</code></>
                )}
              </div>
              <textarea
                value={rawJson}
                onChange={(e) => setRawJson(e.target.value)}
                placeholder={`{\n  "${hashKeyAttr}": "value"${rangeKeyAttr ? `,\n  "${rangeKeyAttr}": "value"` : ''},\n  "attribute": "value"\n}`}
                className={cn(
                  'flex-1 min-h-[300px] px-4 py-3 rounded-md border bg-background text-sm font-mono resize-none',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
              />
            </div>
          ) : (
            /* Field Editors */
            <div className="space-y-3">
              {fields.map((field) => (
                <div key={field.id} className="flex items-start gap-2">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={field.name}
                        onChange={(e) => handleFieldNameChange(field.id, e.target.value)}
                        placeholder="Field name"
                        disabled={isPkOrSk(field.name)}
                        className={cn(
                          'w-40 px-2 py-1 rounded border bg-background text-sm font-medium',
                          'focus:outline-none focus:ring-1 focus:ring-ring',
                          isPkOrSk(field.name) && 'bg-muted cursor-not-allowed'
                        )}
                      />
                      {isPkOrSk(field.name) && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {field.name === hashKeyAttr ? 'PK' : 'SK'}
                        </span>
                      )}
                      {/* JSON mode toggle */}
                      <button
                        type="button"
                        onClick={() => handleToggleJson(field.id)}
                        className={cn(
                          'p-1 rounded transition-colors',
                          field.isJson
                            ? 'bg-blue-500/20 text-blue-500'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                        title={field.isJson ? 'Switch to text mode' : 'Switch to JSON mode'}
                      >
                        <Braces className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {field.isJson ? (
                      <div className="space-y-1">
                        <button
                          type="button"
                          onClick={() => handleToggleExpand(field.id)}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          {field.isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          {field.isExpanded ? 'Collapse' : 'Expand'}
                        </button>
                        <textarea
                          value={field.value}
                          onChange={(e) => handleFieldValueChange(field.id, e.target.value)}
                          placeholder='{"key": "value"}'
                          rows={field.isExpanded ? 10 : 3}
                          className={cn(
                            'w-full px-3 py-2 rounded-md border bg-background text-sm font-mono resize-y',
                            'focus:outline-none focus:ring-2 focus:ring-ring',
                            'border-blue-500/50'
                          )}
                        />
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={field.value}
                        onChange={(e) => handleFieldValueChange(field.id, e.target.value)}
                        placeholder="Value"
                        className={cn(
                          'w-full px-3 py-2 rounded-md border bg-background text-sm',
                          'focus:outline-none focus:ring-2 focus:ring-ring',
                          isPkOrSk(field.name) && 'border-amber-500/50'
                        )}
                      />
                    )}
                  </div>
                  {!isPkOrSk(field.name) && (
                    <button
                      onClick={() => handleRemoveField(field.id)}
                      className={cn('p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors', field.isJson ? 'mt-8' : 'mt-6')}
                      title="Remove field"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}

              <button
                onClick={handleAddField}
                className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add Field
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
          <div className="text-sm text-muted-foreground">
            {rawJsonMode
              ? rawJson.trim() ? 'JSON ready' : 'Enter JSON object'
              : `${fields.filter((f) => f.name.trim() && f.value.trim()).length} fields with values`}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={isInserting}>
              Cancel
            </Button>
            <Button onClick={handleInsert} disabled={isInserting}>
              {isInserting ? 'Inserting...' : 'Insert'}
            </Button>
          </div>
        </div>

        {/* Resize handle */}
        <div
          onMouseDown={handleResizeStart}
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-center justify-center text-muted-foreground/50 hover:text-muted-foreground"
        >
          <GripHorizontal className="h-3 w-3 rotate-[-45deg]" />
        </div>
      </div>
    </div>
  );
}
