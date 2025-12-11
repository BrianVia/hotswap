import { useEffect, useState } from 'react';
import { ProfileSelector } from './components/ProfileSelector';
import { TableList } from './components/TableList';
import { TabBar } from './components/TabBar';
import { TabContent } from './components/TabContent';
import { UpdateNotifier } from './components/UpdateNotifier';

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Initialize theme from system
  useEffect(() => {
    window.hotswap.getSystemTheme().then(setTheme);

    // Listen for theme changes
    const unsubscribe = window.hotswap.onThemeChange(setTheme);
    return unsubscribe;
  }, []);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Title bar / Header */}
      <header className="h-12 flex items-center px-4 border-b drag-region shrink-0">
        {/* macOS traffic lights spacer */}
        <div className="w-20 shrink-0" />

        <div className="flex-1 flex items-center justify-center">
          <h1 className="text-sm font-semibold">HotSwap</h1>
        </div>

        <div className="w-20 flex justify-end no-drag">
          <ProfileSelector />
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar - Table List */}
        <aside className="w-80 border-r flex flex-col shrink-0">
          <TableList />
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
