import { useState, useEffect } from 'react';
import { X, Check, Download } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';

type ExportFormat = 'json' | 'csv';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  fields: string[];
  rows: Record<string, unknown>[];
  selectedRowIndices: number[];
  tableName: string;
}

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  // Escape quotes and wrap in quotes if contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function convertToCSV(rows: Record<string, unknown>[], fields: string[]): string {
  const header = fields.map(f => escapeCSV(f)).join(',');
  const dataRows = rows.map(row =>
    fields.map(f => escapeCSV(row[f])).join(',')
  );
  return [header, ...dataRows].join('\n');
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ExportDialog({
  isOpen,
  onClose,
  fields,
  rows,
  selectedRowIndices,
  tableName,
}: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('json');
  const [selectedFields, setSelectedFields] = useState<Set<string>>(() => new Set(fields));
  const [exportSelected, setExportSelected] = useState(selectedRowIndices.length > 0);

  // Reset selection when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSelectedFields(new Set(fields));
      setExportSelected(selectedRowIndices.length > 0);
    }
  }, [isOpen, fields, selectedRowIndices.length]);

  const toggleField = (field: string) => {
    setSelectedFields(prev => {
      const next = new Set(prev);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next;
    });
  };

  const selectAll = () => setSelectedFields(new Set(fields));
  const selectNone = () => setSelectedFields(new Set());

  const rowsToExport = exportSelected && selectedRowIndices.length > 0
    ? selectedRowIndices.map(idx => rows[idx]).filter(Boolean)
    : rows;

  const handleExport = () => {
    const fieldsArray = Array.from(selectedFields);
    const filteredRows = rowsToExport.map(row => {
      const filtered: Record<string, unknown> = {};
      fieldsArray.forEach(f => {
        if (f in row) filtered[f] = row[f];
      });
      return filtered;
    });

    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
    const filename = `${tableName}_${timestamp}`;

    if (format === 'json') {
      const content = JSON.stringify(filteredRows, null, 2);
      downloadFile(content, `${filename}.json`, 'application/json');
    } else {
      const content = convertToCSV(filteredRows, fieldsArray);
      downloadFile(content, `${filename}.csv`, 'text/csv');
    }

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-popover border rounded-lg shadow-lg w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold">Export Data</h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Format Selection */}
          <div>
            <label className="text-sm font-medium mb-2 block">Format</label>
            <div className="flex gap-2">
              <button
                onClick={() => setFormat('json')}
                className={cn(
                  'flex-1 px-3 py-2 rounded-md border text-sm font-medium transition-colors',
                  format === 'json'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-input hover:bg-muted'
                )}
              >
                JSON
              </button>
              <button
                onClick={() => setFormat('csv')}
                className={cn(
                  'flex-1 px-3 py-2 rounded-md border text-sm font-medium transition-colors',
                  format === 'csv'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-input hover:bg-muted'
                )}
              >
                CSV
              </button>
            </div>
          </div>

          {/* Row Selection */}
          {selectedRowIndices.length > 0 && (
            <div>
              <label className="text-sm font-medium mb-2 block">Rows</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setExportSelected(true)}
                  className={cn(
                    'flex-1 px-3 py-2 rounded-md border text-sm transition-colors',
                    exportSelected
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input hover:bg-muted'
                  )}
                >
                  Selected ({selectedRowIndices.length})
                </button>
                <button
                  onClick={() => setExportSelected(false)}
                  className={cn(
                    'flex-1 px-3 py-2 rounded-md border text-sm transition-colors',
                    !exportSelected
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input hover:bg-muted'
                  )}
                >
                  All ({rows.length})
                </button>
              </div>
            </div>
          )}

          {/* Field Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Fields ({selectedFields.size}/{fields.length})</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={selectAll}
                  className="text-xs text-primary hover:underline"
                >
                  All
                </button>
                <span className="text-muted-foreground">|</span>
                <button
                  onClick={selectNone}
                  className="text-xs text-primary hover:underline"
                >
                  None
                </button>
              </div>
            </div>
            <div className="max-h-[200px] overflow-y-auto border rounded-md p-2 space-y-1">
              {fields.map(field => (
                <button
                  key={field}
                  onClick={() => toggleField(field)}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-1 rounded text-sm text-left transition-colors',
                    selectedFields.has(field)
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted'
                  )}
                >
                  <div className={cn(
                    'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
                    selectedFields.has(field)
                      ? 'bg-primary border-primary'
                      : 'border-input'
                  )}>
                    {selectedFields.has(field) && (
                      <Check className="h-3 w-3 text-primary-foreground" />
                    )}
                  </div>
                  <span className="font-mono truncate">{field}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
          <div className="text-xs text-muted-foreground">
            {rowsToExport.length} rows, {selectedFields.size} fields
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleExport}
              disabled={selectedFields.size === 0}
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              Export
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
