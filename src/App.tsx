import { useEffect, useState, useCallback } from 'react';
import { ProfileSelector } from './components/ProfileSelector';
import { TableList } from './components/TableList';
import { BookmarksList } from './components/BookmarksList';
import { TabBar } from './components/TabBar';
import { TabContent } from './components/TabContent';
import { UpdateNotifier } from './components/UpdateNotifier';
import { ThemeSelector } from './components/ThemeSelector';
import { useTabsStore } from './stores/tabs-store';
import { useThemeStore } from './stores/theme-store';

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 600;
const DEFAULT_SIDEBAR_WIDTH = 320;

function App() {
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const initializeTheme = useThemeStore((state) => state.initializeTheme);

  // Subscribe to both tabs and activeTabId to properly track active tab changes
  const activeTab = useTabsStore((state) =>
    state.activeTabId
      ? state.tabs.find((t) => t.id === state.activeTabId) || null
      : null
  );

  // Resizable sidebar state
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, e.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Initialize theme from store
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    initializeTheme().then((unsubscribe) => {
      cleanup = unsubscribe;
    });
    return () => cleanup?.();
  }, [initializeTheme]);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  }, [resolvedTheme]);

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Title bar / Header */}
      <header className="h-12 flex items-center px-4 border-b drag-region shrink-0">
        {/* macOS traffic lights spacer */}
        <div className="w-20 shrink-0" />

        <div className="flex-1 flex items-center justify-center">
          <h1 className="text-sm font-semibold">Dynomite</h1>
        </div>

        <div className="flex justify-end no-drag items-center gap-3 mr-2">
          <ThemeSelector />
          <ProfileSelector />
        </div>
      </header>

      {/* Main content */}
      <div className={`flex-1 flex min-h-0 ${isResizing ? 'select-none' : ''}`}>
        {/* Sidebar - Table List + Bookmarks */}
        <aside
          className="border-r flex flex-col shrink-0 overflow-hidden"
          style={{ width: sidebarWidth }}
        >
          <div className="flex-1 min-h-0 overflow-y-auto">
            <TableList />
            <BookmarksList tableName={activeTab?.tableName ?? null} />
          </div>
        </aside>

        {/* Resize handle */}
        <div
          className="w-1 hover:bg-primary/20 cursor-col-resize shrink-0 transition-colors active:bg-primary/30"
          onMouseDown={handleMouseDown}
          style={{ backgroundColor: isResizing ? 'var(--color-primary-20)' : undefined }}
        />

        {/* Main panel - Tabs + Content */}
        <main className="flex-1 min-w-0 flex flex-col">
          <TabBar />
          <div className="flex-1 min-h-0">
            <TabContent />
          </div>
        </main>
      </div>

      {/* Update notification */}
      <UpdateNotifier />
    </div>
  );
}

export default App;
