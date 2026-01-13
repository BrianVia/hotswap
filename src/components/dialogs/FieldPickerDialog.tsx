import { useState, useMemo } from 'react';
import { X, Check, Copy } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';

interface FieldPickerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  fields: string[];
  onCopy: (selectedFields: string[]) => void;
  rowCount: number;
}

export function FieldPickerDialog({
  isOpen,
  onClose,
  fields,
  onCopy,
  rowCount,
}: FieldPickerDialogProps) {
  const [selectedFields, setSelectedFields] = useState<Set<string>>(() => new Set(fields));

  // Reset selection when dialog opens
  useMemo(() => {
    if (isOpen) {
      setSelectedFields(new Set(fields));
    }
  }, [isOpen, fields]);

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

  const handleCopy = () => {
    onCopy(Array.from(selectedFields));
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm dialog-backdrop">
      <div className="bg-popover border rounded-lg shadow-lg w-full max-w-md mx-4 dialog-content">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold">Select Fields to Copy</h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Field List */}
        <div className="p-4 max-h-[400px] overflow-y-auto">
          <div className="space-y-1">
            {fields.map(field => (
              <button
                key={field}
                onClick={() => toggleField(field)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-1.5 rounded text-sm text-left transition-colors',
                  selectedFields.has(field)
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted'
                )}
              >
                <div className={cn(
                  'w-4 h-4 rounded border flex items-center justify-center',
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

        {/* Actions */}
        <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
          <div className="flex items-center gap-2">
            <button
              onClick={selectAll}
              className="text-xs text-primary hover:underline"
            >
              Select All
            </button>
            <span className="text-muted-foreground">|</span>
            <button
              onClick={selectNone}
              className="text-xs text-primary hover:underline"
            >
              Select None
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCopy}
              disabled={selectedFields.size === 0}
            >
              <Copy className="h-3.5 w-3.5 mr-1" />
              Copy {rowCount} {rowCount === 1 ? 'row' : 'rows'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
