import { X, Table2 } from 'lucide-react';
import { useTabsStore } from '@/stores/tabs-store';
import { useProfileStore, PROFILE_COLORS } from '@/stores/profile-store';
import { cn } from '@/lib/utils';

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useTabsStore();
  const { getProfileDisplayName, getProfileColor } = useProfileStore();

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center border-b bg-muted/30 overflow-x-auto">
      {tabs.map((tab) => {
        const displayName = getProfileDisplayName(tab.profileName);
        const color = getProfileColor(tab.profileName);
        const colorConfig = PROFILE_COLORS.find(c => c.value === color);
        return (
          <div
            key={tab.id}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 border-r cursor-pointer group min-w-0 max-w-[280px]',
              'hover:bg-muted/50 transition-all duration-200',
              activeTabId === tab.id
                ? 'bg-background border-b-2 border-b-primary'
                : 'bg-muted/20',
              tab.isNew && 'tab-enter',
              tab.isClosing && 'tab-exit'
            )}
            onClick={() => !tab.isClosing && setActiveTab(tab.id)}
          >
            <span className={cn(
              'text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0',
              colorConfig?.classes || 'bg-gray-500/20 text-gray-600 dark:text-gray-400'
            )}>
              {displayName}
            </span>
            <Table2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs truncate">{tab.tableName}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!tab.isClosing) closeTab(tab.id);
              }}
              className="ml-auto p-0.5 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
