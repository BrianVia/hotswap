import { useState, useEffect } from 'react';
import { X, Bookmark } from 'lucide-react';
import { Button } from '../ui/button';
import { useBookmarksStore } from '@/stores/bookmarks-store';
import type { SavedBookmark, FilterCondition, SkOperator } from '@/types';

interface QueryState {
  selectedIndex: string | null;
  pkValue: string;
  skOperator: SkOperator;
  skValue: string;
  skValue2: string;
  filters: FilterCondition[];
  maxResults: number;
  scanForward: boolean;
}

interface SaveBookmarkDialogProps {
  isOpen: boolean;
  onClose: () => void;
  tableName: string;
  queryState: QueryState;
  existingBookmark?: SavedBookmark; // For editing
}

export function SaveBookmarkDialog({
  isOpen,
  onClose,
  tableName,
  queryState,
  existingBookmark,
}: SaveBookmarkDialogProps) {
  const { addBookmark, updateBookmark } = useBookmarksStore();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setName(existingBookmark?.name || '');
      setError(null);
    }
  }, [isOpen, existingBookmark]);

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please enter a name for the bookmark');
      return;
    }

    if (existingBookmark) {
      // Update existing bookmark
      updateBookmark(existingBookmark.id, {
        name: trimmedName,
        selectedIndex: queryState.selectedIndex,
        pkValue: queryState.pkValue,
        skOperator: queryState.skOperator,
        skValue: queryState.skValue,
        skValue2: queryState.skValue2,
        filters: queryState.filters,
        maxResults: queryState.maxResults,
        scanForward: queryState.scanForward,
      });
    } else {
      // Add new bookmark
      addBookmark(tableName, {
        name: trimmedName,
        selectedIndex: queryState.selectedIndex,
        pkValue: queryState.pkValue,
        skOperator: queryState.skOperator,
        skValue: queryState.skValue,
        skValue2: queryState.skValue2,
        filters: queryState.filters,
        maxResults: queryState.maxResults,
        scanForward: queryState.scanForward,
      });
    }

    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-popover border rounded-lg shadow-lg w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Bookmark className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">
              {existingBookmark ? 'Edit Bookmark' : 'Save Bookmark'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <div className="p-4 space-y-4">
          {/* Name Input */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              onKeyDown={handleKeyDown}
              placeholder="e.g., Active users query"
              autoFocus
              className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>

          {/* Query Preview */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">
              Query Details
            </label>
            <div className="text-xs space-y-1 p-3 rounded-md bg-muted/30 font-mono">
              {queryState.selectedIndex && (
                <div>
                  <span className="text-muted-foreground">Index:</span>{' '}
                  {queryState.selectedIndex}
                </div>
              )}
              {queryState.pkValue && (
                <div>
                  <span className="text-muted-foreground">PK:</span>{' '}
                  {queryState.pkValue}
                </div>
              )}
              {queryState.skValue && (
                <div>
                  <span className="text-muted-foreground">SK:</span>{' '}
                  {queryState.skOperator} {queryState.skValue}
                  {queryState.skOperator === 'between' && queryState.skValue2
                    ? ` AND ${queryState.skValue2}`
                    : ''}
                </div>
              )}
              {queryState.filters.length > 0 && (
                <div>
                  <span className="text-muted-foreground">Filters:</span>{' '}
                  {queryState.filters.length} filter
                  {queryState.filters.length !== 1 ? 's' : ''}
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Max Results:</span>{' '}
                {queryState.maxResults}
              </div>
              <div>
                <span className="text-muted-foreground">Sort:</span>{' '}
                {queryState.scanForward ? 'Ascending' : 'Descending'}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t bg-muted/30">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>
            <Bookmark className="h-3.5 w-3.5 mr-1" />
            {existingBookmark ? 'Update' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
