import { useState, useRef, useEffect } from 'react';
import { Bookmark, ChevronDown, ChevronRight, Trash2, Pencil, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBookmarksStore } from '@/stores/bookmarks-store';
import { useTabsStore } from '@/stores/tabs-store';
import { SaveBookmarkDialog } from './dialogs/SaveBookmarkDialog';
import type { SavedBookmark } from '@/types';

interface BookmarksListProps {
  tableName: string | null;
}

export function BookmarksList({ tableName }: BookmarksListProps) {
  const { getBookmarksForTable, deleteBookmark } = useBookmarksStore();
  const { getActiveTab, updateTabQueryState } = useTabsStore();
  const [isExpanded, setIsExpanded] = useState(true);
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    bookmark: SavedBookmark | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    bookmark: null,
  });
  const [editingBookmark, setEditingBookmark] = useState<SavedBookmark | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const bookmarks = tableName ? getBookmarksForTable(tableName) : [];

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(event.target as Node)
      ) {
        setContextMenu({ visible: false, x: 0, y: 0, bookmark: null });
      }
    };

    if (contextMenu.visible) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu.visible]);

  const handleLoadBookmark = (bookmark: SavedBookmark) => {
    const activeTab = getActiveTab();
    if (!activeTab) return;

    updateTabQueryState(activeTab.id, {
      selectedIndex: bookmark.selectedIndex,
      pkValue: bookmark.pkValue,
      skOperator: bookmark.skOperator,
      skValue: bookmark.skValue,
      skValue2: bookmark.skValue2,
      filters: bookmark.filters,
      maxResults: bookmark.maxResults,
      scanForward: bookmark.scanForward,
      // Clear stale results
      results: [],
      count: 0,
      scannedCount: 0,
      lastEvaluatedKey: undefined,
      error: null,
    });
  };

  const handleContextMenu = (e: React.MouseEvent, bookmark: SavedBookmark) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      bookmark,
    });
  };

  const handleEdit = () => {
    if (contextMenu.bookmark) {
      setEditingBookmark(contextMenu.bookmark);
    }
    setContextMenu({ visible: false, x: 0, y: 0, bookmark: null });
  };

  const handleDelete = () => {
    if (contextMenu.bookmark) {
      deleteBookmark(contextMenu.bookmark.id);
    }
    setContextMenu({ visible: false, x: 0, y: 0, bookmark: null });
  };

  const handleRun = () => {
    if (contextMenu.bookmark) {
      handleLoadBookmark(contextMenu.bookmark);
    }
    setContextMenu({ visible: false, x: 0, y: 0, bookmark: null });
  };

  // Don't render if no table is selected
  if (!tableName) return null;

  return (
    <>
      <div className="border-t">
        {/* Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <Bookmark className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Bookmarks</span>
          {bookmarks.length > 0 && (
            <span className="text-xs text-muted-foreground ml-auto">
              {bookmarks.length}
            </span>
          )}
        </button>

        {/* Bookmarks List */}
        {isExpanded && (
          <div className="pb-2">
            {bookmarks.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                No bookmarks for this table.
                <br />
                Save a query to create one.
              </div>
            ) : (
              <div className="space-y-0.5 px-2">
                {bookmarks.map((bookmark) => (
                  <button
                    key={bookmark.id}
                    onClick={() => handleLoadBookmark(bookmark)}
                    onContextMenu={(e) => handleContextMenu(e, bookmark)}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left',
                      'hover:bg-muted transition-colors group'
                    )}
                  >
                    <Bookmark className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1">{bookmark.name}</span>
                    <Play className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu.visible && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 min-w-[160px] bg-popover border rounded-md shadow-lg py-1"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={handleRun}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted transition-colors"
          >
            <Play className="h-4 w-4" />
            Load Query
          </button>
          <button
            onClick={handleEdit}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted transition-colors"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>
          <div className="border-t my-1" />
          <button
            onClick={handleDelete}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-500 hover:bg-muted transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      )}

      {/* Edit Bookmark Dialog */}
      {editingBookmark && tableName && (
        <SaveBookmarkDialog
          isOpen={!!editingBookmark}
          onClose={() => setEditingBookmark(null)}
          tableName={tableName}
          queryState={editingBookmark}
          existingBookmark={editingBookmark}
        />
      )}
    </>
  );
}
