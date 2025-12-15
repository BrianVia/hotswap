import { useEffect, useState, useRef } from 'react';
import { ChevronDown, Check, LogIn, Loader2, Shield, ShieldCheck, Pencil, Star, EyeOff, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { useProfileStore, PROFILE_COLORS, PROFILE_ENVIRONMENTS } from '@/stores/profile-store';
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
    getProfileDisplayName,
    setProfileDisplayName,
    getProfileColor,
    setProfileColor,
    isProfileDisabled,
    setProfileDisabled,
    defaultProfileName,
    setDefaultProfile,
    getProfileEnvironment,
    setProfileEnvironment,
    getEnabledProfiles,
    lastSelectedProfileName,
  } = useProfileStore();

  const { loadTables, clearSelection, getLastSelectedTable, selectTable } = useTableStore();

  const [isOpen, setIsOpen] = useState(false);
  const [loggingIn, setLoggingIn] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showDisabled, setShowDisabled] = useState(false);
  const [hasRestoredProfile, setHasRestoredProfile] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);

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

  // Auto-restore last selected profile on startup
  useEffect(() => {
    if (hasRestoredProfile || profiles.length === 0 || selectedProfile) return;

    const profileToRestore = lastSelectedProfileName || defaultProfileName;
    if (profileToRestore) {
      const profile = profiles.find((p) => p.name === profileToRestore);
      if (profile && !isProfileDisabled(profile.name)) {
        // Auto-select the profile
        selectProfile(profile);
        // Check auth and load tables if authenticated
        checkAuth(profile.name).then((status) => {
          if (status.authenticated) {
            loadTables(profile.name).then(() => {
              // Auto-select last table if available
              const lastTable = getLastSelectedTable(profile.name);
              if (lastTable) {
                selectTable(profile.name, lastTable);
              }
            });
          }
        });
      }
    }
    setHasRestoredProfile(true);
  }, [profiles, hasRestoredProfile, lastSelectedProfileName, defaultProfileName, selectedProfile, isProfileDisabled, selectProfile, checkAuth, loadTables, getLastSelectedTable, selectTable]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingProfile && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingProfile]);

  const handleSelectProfile = async (profile: AwsProfile) => {
    if (editingProfile) return; // Don't select while editing
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

  const handleStartEdit = (e: React.MouseEvent, profileName: string) => {
    e.stopPropagation();
    setEditingProfile(profileName);
    setEditValue(getProfileDisplayName(profileName));
  };

  const handleSaveEdit = () => {
    if (editingProfile && editValue.trim()) {
      setProfileDisplayName(editingProfile, editValue.trim());
    }
    setEditingProfile(null);
    setEditValue('');
  };

  const handleCancelEdit = () => {
    setEditingProfile(null);
    setEditValue('');
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
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
            onClick={() => {
              if (editingProfile) {
                handleCancelEdit();
              }
              setIsOpen(false);
            }}
          />

          {/* Dropdown */}
          <div className="absolute top-full right-0 z-20 mt-1 w-[500px] rounded-md border bg-popover shadow-lg p-2">
            <div className="px-3 py-2.5 border-b flex items-center justify-between rounded-t-sm">
              <div className="text-xs text-muted-foreground">
                Click <Pencil className="h-3 w-3 inline" /> to customize name, color & environment
              </div>
              {profiles.some((p) => isProfileDisabled(p.name)) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDisabled(!showDisabled);
                  }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {showDisabled ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {showDisabled ? 'Hide' : 'Show'} disabled
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto p-1 space-y-1">
              {profiles.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No profiles found in ~/.aws/config
                </div>
              ) : (
                <>
                {/* Enabled profiles */}
                {getEnabledProfiles().map((profile) => {
                  const auth = getAuthStatus(profile.name);
                  const isSelected = selectedProfile?.name === profile.name;
                  const isLoggingIn = loggingIn === profile.name;
                  const isEditing = editingProfile === profile.name;
                  const displayName = getProfileDisplayName(profile.name);
                  const env = getProfileEnvironment(profile.name);
                  const isDefault = defaultProfileName === profile.name;

                  return (
                    <div
                      key={profile.name}
                      onClick={() => handleSelectProfile(profile)}
                      className={cn(
                        'group flex items-center justify-between rounded-md px-4 py-3 text-sm cursor-pointer transition-colors',
                        isSelected
                          ? 'bg-accent text-accent-foreground'
                          : 'hover:bg-accent/50',
                        isEditing && 'cursor-default'
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {isSelected && <Check className="h-4 w-4 shrink-0" />}
                        {!isSelected && <div className="w-4" />}

                        <div className="min-w-0 flex-1">
                          <div className="inline-flex items-center gap-2">
                            {isEditing ? (
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-center gap-1">
                                  <input
                                    ref={editInputRef}
                                    type="text"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onKeyDown={handleEditKeyDown}
                                    onBlur={handleSaveEdit}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-20 h-6 px-1.5 text-xs font-semibold rounded border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                                    maxLength={12}
                                  />
                                  <div className="flex items-center gap-0.5">
                                    {PROFILE_COLORS.map((color) => {
                                      const isActiveColor = getProfileColor(profile.name) === color.value;
                                      return (
                                        <button
                                          key={color.value}
                                          onMouseDown={(e) => e.preventDefault()}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setProfileColor(profile.name, color.value);
                                          }}
                                          className={cn(
                                            'w-3 h-3 rounded-full transition-all',
                                            color.value === 'red' && 'bg-red-500',
                                            color.value === 'orange' && 'bg-orange-500',
                                            color.value === 'yellow' && 'bg-yellow-500',
                                            color.value === 'green' && 'bg-green-500',
                                            color.value === 'blue' && 'bg-blue-500',
                                            color.value === 'purple' && 'bg-purple-500',
                                            color.value === 'pink' && 'bg-pink-500',
                                            color.value === 'gray' && 'bg-gray-500',
                                            isActiveColor ? 'ring-2 ring-offset-1 ring-foreground/50' : 'opacity-50 hover:opacity-100'
                                          )}
                                          title={color.label}
                                        />
                                      );
                                    })}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] text-muted-foreground">Env:</span>
                                  {PROFILE_ENVIRONMENTS.map((envOption) => (
                                    <button
                                      key={envOption.value}
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setProfileEnvironment(profile.name, env === envOption.value ? null : envOption.value);
                                      }}
                                      className={cn(
                                        'px-1.5 py-0.5 text-[10px] rounded transition-all',
                                        env === envOption.value
                                          ? 'bg-foreground/10 font-semibold'
                                          : 'opacity-50 hover:opacity-100'
                                      )}
                                    >
                                      {envOption.label}
                                    </button>
                                  ))}
                                  <div className="ml-auto flex items-center gap-1">
                                    <button
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDefaultProfile(isDefault ? null : profile.name);
                                      }}
                                      className={cn(
                                        'p-0.5 rounded transition-all',
                                        isDefault ? 'text-yellow-500' : 'opacity-50 hover:opacity-100'
                                      )}
                                      title={isDefault ? 'Remove as default' : 'Set as default profile'}
                                    >
                                      <Star className={cn('h-3 w-3', isDefault && 'fill-current')} />
                                    </button>
                                    <button
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setProfileDisabled(profile.name, true);
                                        handleCancelEdit();
                                      }}
                                      className="p-0.5 rounded opacity-50 hover:opacity-100 hover:text-red-500 transition-all"
                                      title="Disable this profile"
                                    >
                                      <EyeOff className="h-3 w-3" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <>
                                {isDefault && (
                                  <span title="Default profile">
                                    <Star className="h-3 w-3 text-yellow-500 fill-current shrink-0" />
                                  </span>
                                )}
                                <span className={cn(
                                  'text-xs font-semibold px-1.5 py-0.5 rounded',
                                  PROFILE_COLORS.find(c => c.value === getProfileColor(profile.name))?.classes
                                )}>
                                  {displayName}
                                </span>
                                {env && (
                                  <span className={cn(
                                    'text-[10px] px-1 py-0.5 rounded',
                                    env === 'prod' && 'bg-red-500/20 text-red-600 dark:text-red-400',
                                    env === 'stage' && 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400',
                                    env === 'test' && 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
                                    env === 'dev' && 'bg-green-500/20 text-green-600 dark:text-green-400'
                                  )}>
                                    {env.toUpperCase()}
                                  </span>
                                )}
                                <button
                                  onClick={(e) => handleStartEdit(e, profile.name)}
                                  className="p-0.5 rounded hover:bg-muted/80 opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity"
                                  title="Edit display name, color & environment"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              </>
                            )}
                          </div>
                          <div className="font-medium truncate mt-1.5">{profile.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {profile.sso_account_id} · {profile.region}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 ml-3">
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
                })}

                {/* Disabled profiles section */}
                {showDisabled && profiles.filter((p) => isProfileDisabled(p.name)).length > 0 && (
                  <>
                    <div className="border-t my-3 mx-3" />
                    <div className="px-4 py-1.5 text-xs text-muted-foreground">
                      Disabled profiles
                    </div>
                    {profiles.filter((p) => isProfileDisabled(p.name)).map((profile) => {
                      const displayName = getProfileDisplayName(profile.name);
                      const env = getProfileEnvironment(profile.name);

                      return (
                        <div
                          key={profile.name}
                          className="group flex items-center justify-between rounded-md px-4 py-3 text-sm opacity-50"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-4" />
                            <div className="min-w-0 flex-1">
                              <div className="inline-flex items-center gap-2">
                                <span className={cn(
                                  'text-xs font-semibold px-1.5 py-0.5 rounded',
                                  PROFILE_COLORS.find(c => c.value === getProfileColor(profile.name))?.classes
                                )}>
                                  {displayName}
                                </span>
                                {env && (
                                  <span className={cn(
                                    'text-[10px] px-1 py-0.5 rounded',
                                    env === 'prod' && 'bg-red-500/20 text-red-600 dark:text-red-400',
                                    env === 'stage' && 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400',
                                    env === 'test' && 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
                                    env === 'dev' && 'bg-green-500/20 text-green-600 dark:text-green-400'
                                  )}>
                                    {env.toUpperCase()}
                                  </span>
                                )}
                              </div>
                              <div className="font-medium truncate mt-1.5 line-through">{profile.name}</div>
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setProfileDisabled(profile.name, false);
                            }}
                            className="p-1 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Enable this profile"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </>
                )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
