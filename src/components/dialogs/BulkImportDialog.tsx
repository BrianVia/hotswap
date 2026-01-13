import { useState, useEffect, useCallback, useRef } from 'react';
import { AlertCircle, X, Upload, FileJson, GripHorizontal, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';
import type { TableInfo, BatchWriteOperation, WriteProgress } from '@/types';

interface BulkImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
  tableInfo: TableInfo;
  profileName: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  items: Record<string, unknown>[];
}

function validateItems(
  items: unknown,
  tableInfo: TableInfo
): ValidationResult {
  const errors: string[] = [];

  // Must be an array
  if (!Array.isArray(items)) {
    return { valid: false, errors: ['JSON must be an array of objects'], items: [] };
  }

  if (items.length === 0) {
    return { valid: false, errors: ['Array is empty'], items: [] };
  }

  const hashKeyAttr = tableInfo.keySchema.find((k) => k.keyType === 'HASH')?.attributeName;
  const rangeKeyAttr = tableInfo.keySchema.find((k) => k.keyType === 'RANGE')?.attributeName;

  // Track seen keys for duplicate detection
  const seenKeys = new Set<string>();
  const validItems: Record<string, unknown>[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // Must be an object
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      errors.push(`Item ${i + 1}: must be an object`);
      continue;
    }

    const typedItem = item as Record<string, unknown>;

    // Check partition key
    if (!hashKeyAttr || !(hashKeyAttr in typedItem) || typedItem[hashKeyAttr] === undefined || typedItem[hashKeyAttr] === null || typedItem[hashKeyAttr] === '') {
      errors.push(`Item ${i + 1}: missing partition key (${hashKeyAttr})`);
      continue;
    }

    // Check sort key if table has one
    if (rangeKeyAttr && (!(rangeKeyAttr in typedItem) || typedItem[rangeKeyAttr] === undefined || typedItem[rangeKeyAttr] === null || typedItem[rangeKeyAttr] === '')) {
      errors.push(`Item ${i + 1}: missing sort key (${rangeKeyAttr})`);
      continue;
    }

    // Check for duplicates within the batch
    const keyStr = rangeKeyAttr
      ? `${JSON.stringify(typedItem[hashKeyAttr])}|${JSON.stringify(typedItem[rangeKeyAttr])}`
      : JSON.stringify(typedItem[hashKeyAttr]);

    if (seenKeys.has(keyStr)) {
      errors.push(`Item ${i + 1}: duplicate key (${hashKeyAttr}=${JSON.stringify(typedItem[hashKeyAttr])}${rangeKeyAttr ? `, ${rangeKeyAttr}=${JSON.stringify(typedItem[rangeKeyAttr])}` : ''})`);
      continue;
    }

    seenKeys.add(keyStr);
    validItems.push(typedItem);
  }

  return {
    valid: errors.length === 0,
    errors,
    items: validItems,
  };
}

export function BulkImportDialog({
  isOpen,
  onClose,
  onImported,
  tableInfo,
  profileName,
}: BulkImportDialogProps) {
  const [rawJson, setRawJson] = useState('');
  const [parsedItems, setParsedItems] = useState<Record<string, unknown>[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<WriteProgress | null>(null);
  const [importResult, setImportResult] = useState<{ success: boolean; processed: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Resize state
  const [size, setSize] = useState({ width: 700, height: 650 });
  const isResizing = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const startSize = useRef({ width: 0, height: 0 });

  // Get PK and SK attribute names
  const hashKeyAttr = tableInfo.keySchema.find((k) => k.keyType === 'HASH')?.attributeName;
  const rangeKeyAttr = tableInfo.keySchema.find((k) => k.keyType === 'RANGE')?.attributeName;

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setRawJson('');
      setParsedItems([]);
      setValidationErrors([]);
      setParseError(null);
      setIsImporting(false);
      setImportProgress(null);
      setImportResult(null);
      setSize({ width: 700, height: 650 });
    }
  }, [isOpen]);

  // Subscribe to write progress
  useEffect(() => {
    if (!isImporting) return;

    const unsubscribe = window.dynomite.onWriteProgress((progress) => {
      setImportProgress(progress);
    });

    return unsubscribe;
  }, [isImporting]);

  // Parse and validate JSON when it changes
  useEffect(() => {
    if (!rawJson.trim()) {
      setParsedItems([]);
      setValidationErrors([]);
      setParseError(null);
      return;
    }

    try {
      const parsed = JSON.parse(rawJson);
      setParseError(null);

      const result = validateItems(parsed, tableInfo);
      setParsedItems(result.items);
      setValidationErrors(result.errors);
    } catch {
      setParseError('Invalid JSON syntax');
      setParsedItems([]);
      setValidationErrors([]);
    }
  }, [rawJson, tableInfo]);

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
          width: Math.max(500, Math.min(window.innerWidth * 0.95, startSize.current.width + deltaX)),
          height: Math.max(400, Math.min(window.innerHeight * 0.95, startSize.current.height + deltaY)),
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

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        setRawJson(content);
      }
    };
    reader.onerror = () => {
      setParseError('Failed to read file');
    };
    reader.readAsText(file);

    // Reset file input so same file can be selected again
    e.target.value = '';
  }, []);

  const handleImport = async () => {
    if (parsedItems.length === 0) return;

    setIsImporting(true);
    setImportProgress(null);
    setImportResult(null);

    try {
      // Build batch write operations
      const operations: BatchWriteOperation[] = parsedItems.map((item) => ({
        type: 'put' as const,
        tableName: tableInfo.tableName,
        item,
      }));

      const result = await window.dynomite.batchWrite(profileName, operations);
      setImportResult(result);

      if (result.success && result.errors.length === 0) {
        // All items imported successfully
        onImported();
        setTimeout(() => {
          onClose();
        }, 1500);
      }
    } catch (err) {
      setImportResult({
        success: false,
        processed: 0,
        errors: [err instanceof Error ? err.message : 'Import failed'],
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    if (!isImporting) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const canImport = parsedItems.length > 0 && validationErrors.length === 0 && !parseError && !isImporting;
  const hasValidationIssues = validationErrors.length > 0;
  const totalItems = parsedItems.length + validationErrors.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm dialog-backdrop">
      <div
        className="bg-popover border rounded-lg shadow-lg overflow-hidden flex flex-col relative dialog-content"
        style={{ width: size.width, height: size.height, maxWidth: '95vw', maxHeight: '95vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <FileJson className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold text-lg">Bulk Import</h3>
          </div>
          <button onClick={handleClose} className="p-1 rounded hover:bg-muted transition-colors" disabled={isImporting}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Import Result Banner */}
        {importResult && (
          <div
            className={cn(
              'mx-4 mt-4 p-3 rounded-md border',
              importResult.success && importResult.errors.length === 0
                ? 'bg-green-500/10 border-green-500/30'
                : 'bg-red-500/10 border-red-500/30'
            )}
          >
            <div
              className={cn(
                'flex items-center gap-2',
                importResult.success && importResult.errors.length === 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              )}
            >
              {importResult.success && importResult.errors.length === 0 ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm font-medium">Successfully imported {importResult.processed} items</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    Import completed with errors ({importResult.processed} succeeded, {importResult.errors.length} failed)
                  </span>
                </>
              )}
            </div>
            {importResult.errors.length > 0 && (
              <div className="mt-2 max-h-24 overflow-y-auto">
                {importResult.errors.slice(0, 10).map((error, i) => (
                  <div key={i} className="text-xs text-red-600 dark:text-red-400 font-mono">
                    {error}
                  </div>
                ))}
                {importResult.errors.length > 10 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    ...and {importResult.errors.length - 10} more errors
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Instructions */}
          <div className="text-sm text-muted-foreground">
            Import a JSON array of items. Each item must include:
            <code className="ml-1 px-1 py-0.5 rounded bg-muted font-mono text-xs">{hashKeyAttr}</code>
            {rangeKeyAttr && (
              <>
                {' '}and <code className="px-1 py-0.5 rounded bg-muted font-mono text-xs">{rangeKeyAttr}</code>
              </>
            )}
          </div>

          {/* File Upload */}
          <div className="flex gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept=".json,application/json"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload JSON File
            </Button>
          </div>

          {/* JSON Input */}
          <div className="flex-1 flex flex-col gap-2">
            <label className="text-sm font-medium">JSON Array</label>
            <textarea
              value={rawJson}
              onChange={(e) => setRawJson(e.target.value)}
              placeholder={`[\n  { "${hashKeyAttr}": "value1"${rangeKeyAttr ? `, "${rangeKeyAttr}": "sort1"` : ''}, "attr": "..." },\n  { "${hashKeyAttr}": "value2"${rangeKeyAttr ? `, "${rangeKeyAttr}": "sort2"` : ''}, "attr": "..." }\n]`}
              disabled={isImporting}
              className={cn(
                'flex-1 min-h-[200px] px-4 py-3 rounded-md border bg-background text-sm font-mono resize-none',
                'focus:outline-none focus:ring-2 focus:ring-ring',
                parseError && 'border-red-500/50'
              )}
            />
          </div>

          {/* Parse Error */}
          {parseError && (
            <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{parseError}</span>
              </div>
            </div>
          )}

          {/* Validation Errors */}
          {hasValidationIssues && (
            <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/30">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-2">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm font-medium">
                  {validationErrors.length} validation {validationErrors.length === 1 ? 'error' : 'errors'} - these items will be skipped
                </span>
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {validationErrors.slice(0, 20).map((error, i) => (
                  <div key={i} className="text-xs text-amber-600 dark:text-amber-400 font-mono">
                    {error}
                  </div>
                ))}
                {validationErrors.length > 20 && (
                  <div className="text-xs text-muted-foreground">...and {validationErrors.length - 20} more errors</div>
                )}
              </div>
            </div>
          )}

          {/* Preview */}
          {parsedItems.length > 0 && !parseError && (
            <div className="p-3 rounded-md bg-muted/50 border">
              <div className="text-sm font-medium mb-2">
                Preview: {parsedItems.length} valid {parsedItems.length === 1 ? 'item' : 'items'} ready to import
                {totalItems > parsedItems.length && (
                  <span className="text-muted-foreground ml-1">
                    ({totalItems - parsedItems.length} will be skipped)
                  </span>
                )}
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1 font-mono text-xs">
                {parsedItems.slice(0, 5).map((item, i) => (
                  <div key={i} className="text-muted-foreground truncate">
                    {JSON.stringify(item)}
                  </div>
                ))}
                {parsedItems.length > 5 && (
                  <div className="text-muted-foreground">...and {parsedItems.length - 5} more items</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
          <div className="text-sm text-muted-foreground">
            {isImporting && importProgress ? (
              <span>
                Importing... {importProgress.processed}/{importProgress.total}
              </span>
            ) : parsedItems.length > 0 ? (
              <span>
                {parsedItems.length} {parsedItems.length === 1 ? 'item' : 'items'} ready to import
              </span>
            ) : (
              <span>Paste or upload JSON array</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleClose} disabled={isImporting}>
              {importResult?.success && importResult.errors.length === 0 ? 'Close' : 'Cancel'}
            </Button>
            <Button onClick={handleImport} disabled={!canImport}>
              {isImporting ? 'Importing...' : `Import ${parsedItems.length > 0 ? parsedItems.length : ''} Items`}
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
