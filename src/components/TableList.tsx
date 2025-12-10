import { useState } from 'react';
import { Database, Loader2, Search, RefreshCw, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { useProfileStore } from '@/stores/profile-store';
import { useTableStore } from '@/stores/table-store';

export function TableList() {
  const { selectedProfile, authStatuses, login } = useProfileStore();
  const {
    tablesByProfile,
    selectedTable,
    isLoadingTables,
    error,
    loadTables,
    selectTable,
  } = useTableStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const profileName = selectedProfile?.name;
  const tables = profileName ? tablesByProfile.get(profileName) || [] : [];
  const isAuthenticated = profileName ? authStatuses.get(profileName)?.authenticated : false;

  // Filter tables by search query
  const filteredTables = tables.filter((table) =>
    table.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Extract the "friendly name" from table (e.g., "MetadataStack-savvymetadata..." -> "Metadata")
  const getTableDisplayName = (tableName: string): { stack: string; table: string } => {
    const match = tableName.match(/^([A-Za-z]+)Stack-/);
    const stack = match ? match[1] : '';
    return { stack, table: tableName };
  };

  const handleRefresh = () => {
    if (profileName) {
      loadTables(profileName);
    }
  };

  const handleLogin = async () => {
    if (!profileName) return;
    setLoggingIn(true);
    const result = await login(profileName);
    setLoggingIn(false);
    if (result.success) {
      loadTables(profileName);
    }
  };

  if (!selectedProfile) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Database className="h-12 w-12 mb-4 opacity-50" />
        <p>Select a profile to view tables</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
        <AlertCircle className="h-12 w-12 text-yellow-500" />
        <p>Authentication required for {selectedProfile.name}</p>
        <Button onClick={handleLogin} disabled={loggingIn}>
          {loggingIn ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Logging in...
            </>
          ) : (
            'Login with SSO'
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search tables..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 pl-8 pr-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRefresh}
          disabled={isLoadingTables}
        >
          <RefreshCw className={cn('h-4 w-4', isLoadingTables && 'animate-spin')} />
        </Button>
      </div>

      {/* Error state */}
      {error && (
        <div className="px-3 py-2 text-sm text-red-500 bg-red-500/10 border-b">
          {error}
        </div>
      )}

      {/* Table list */}
      <div className="flex-1 overflow-y-auto">
        {isLoadingTables ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredTables.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            {searchQuery ? (
              <p className="text-sm">No tables match "{searchQuery}"</p>
            ) : (
              <p className="text-sm">No tables found</p>
            )}
          </div>
        ) : (
          <div className="p-1">
            {filteredTables.map((tableName) => {
              const { stack } = getTableDisplayName(tableName);
              const isSelected = selectedTable?.tableName === tableName;

              return (
                <button
                  key={tableName}
                  onClick={() => selectTable(profileName!, tableName)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors',
                    isSelected
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/50'
                  )}
                >
                  <Database className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {stack && (
                        <span className="text-muted-foreground">{stack} · </span>
                      )}
                      <span className="truncate">{tableName}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t text-xs text-muted-foreground">
        {filteredTables.length} of {tables.length} tables
      </div>
    </div>
  );
}
