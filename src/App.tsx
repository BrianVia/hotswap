import { useEffect } from 'react';
import { ProfileSelector } from './components/ProfileSelector';
import { TableList } from './components/TableList';
import { BookmarksList } from './components/BookmarksList';
import { TabBar } from './components/TabBar';
import { TabContent } from './components/TabContent';
import { UpdateNotifier } from './components/UpdateNotifier';
import { ThemeSelector } from './components/ThemeSelector';
import { useTabsStore } from './stores/tabs-store';
import { useThemeStore } from './stores/theme-store';

function App() {
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const initializeTheme = useThemeStore((state) => state.initializeTheme);

  // Subscribe to both tabs and activeTabId to properly track active tab changes
  const activeTab = useTabsStore((state) =>
    state.activeTabId
      ? state.tabs.find((t) => t.id === state.activeTabId) || null
      : null
  );

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
      <div className="flex-1 flex min-h-0">
        {/* Sidebar - Table List + Bookmarks */}
        <aside className="w-80 border-r flex flex-col shrink-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto">
            <TableList />
            <BookmarksList tableName={activeTab?.tableName ?? null} />
          </div>
        </aside>

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
