import { useEffect, useState } from 'react';
import { ChevronDown, Check, LogIn, Loader2, Shield, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { useProfileStore } from '@/stores/profile-store';
import { useTableStore } from '@/stores/table-store';
import type { AwsProfile, AuthStatus } from '@/types';

export function ProfileSelector() {
  const {
    profiles,
    selectedProfile,
    authStatuses,
    isLoading,
    loadProfiles,
    selectProfile,
    checkAuth,
    login,
  } = useProfileStore();

  const { loadTables, clearSelection } = useTableStore();

  const [isOpen, setIsOpen] = useState(false);
  const [loggingIn, setLoggingIn] = useState<string | null>(null);

  // Load profiles on mount
  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  // Check auth for all profiles after loading
  useEffect(() => {
    profiles.forEach((profile) => {
      checkAuth(profile.name);
    });
  }, [profiles, checkAuth]);

  const handleSelectProfile = async (profile: AwsProfile) => {
    selectProfile(profile);
    setIsOpen(false);
    clearSelection();

    // Check auth status
    const status = await checkAuth(profile.name);
    if (status.authenticated) {
      // Load tables if authenticated
      loadTables(profile.name);
    }
  };

  const handleLogin = async (e: React.MouseEvent, profileName: string) => {
    e.stopPropagation();
    setLoggingIn(profileName);
    
    const result = await login(profileName);
    setLoggingIn(null);

    if (result.success && selectedProfile?.name === profileName) {
      // Reload tables after successful login
      loadTables(profileName);
    }
  };

  const getAuthStatus = (profileName: string): AuthStatus | undefined => {
    return authStatuses.get(profileName);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading profiles...
      </div>
    );
  }

  return (
    <div className="relative">
      <Button
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        className="w-64 justify-between no-drag"
      >
        <span className="truncate">
          {selectedProfile?.name || 'Select AWS Profile'}
        </span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
      </Button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute top-full left-0 z-20 mt-1 w-80 rounded-md border bg-popover shadow-lg">
            <div className="max-h-96 overflow-y-auto p-1">
              {profiles.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No profiles found in ~/.aws/config
                </div>
              ) : (
                profiles.map((profile) => {
                  const auth = getAuthStatus(profile.name);
                  const isSelected = selectedProfile?.name === profile.name;
                  const isLoggingIn = loggingIn === profile.name;

                  return (
                    <div
                      key={profile.name}
                      onClick={() => handleSelectProfile(profile)}
                      className={cn(
                        'flex items-center justify-between rounded-sm px-3 py-2 text-sm cursor-pointer transition-colors',
                        isSelected
                          ? 'bg-accent text-accent-foreground'
                          : 'hover:bg-accent/50'
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {isSelected && <Check className="h-4 w-4 shrink-0" />}
                        {!isSelected && <div className="w-4" />}
                        
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{profile.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {profile.sso_account_id} · {profile.region}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 ml-2">
                        {auth?.authenticated ? (
                          <ShieldCheck className="h-4 w-4 text-green-500" />
                        ) : (
                          <>
                            <Shield className="h-4 w-4 text-muted-foreground" />
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => handleLogin(e, profile.name)}
                              disabled={isLoggingIn}
                              className="h-7 px-2"
                            >
                              {isLoggingIn ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <LogIn className="h-3 w-3" />
                              )}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
