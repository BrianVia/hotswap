import { useEffect, useState, useRef } from 'react';
import { ChevronDown, Check, LogIn, Loader2, Shield, ShieldCheck, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { useProfileStore, PROFILE_COLORS } from '@/stores/profile-store';
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
  } = useProfileStore();

  const { loadTables, clearSelection } = useTableStore();

  const [isOpen, setIsOpen] = useState(false);
  const [loggingIn, setLoggingIn] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
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
          <div className="absolute top-full left-0 z-20 mt-1 w-96 rounded-md border bg-popover shadow-lg">
            <div className="px-3 py-2 border-b">
              <div className="text-xs text-muted-foreground">
                Click the pencil to set a friendly name for each profile
              </div>
            </div>
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
                  const isEditing = editingProfile === profile.name;
                  const displayName = getProfileDisplayName(profile.name);

                  return (
                    <div
                      key={profile.name}
                      onClick={() => handleSelectProfile(profile)}
                      className={cn(
                        'group flex items-center justify-between rounded-sm px-3 py-2 text-sm cursor-pointer transition-colors',
                        isSelected
                          ? 'bg-accent text-accent-foreground'
                          : 'hover:bg-accent/50',
                        isEditing && 'cursor-default'
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {isSelected && <Check className="h-4 w-4 shrink-0" />}
                        {!isSelected && <div className="w-4" />}

                        <div className="min-w-0 flex-1">
                          <div className="inline-flex items-center gap-1">
                            {isEditing ? (
                              <>
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
                                <div className="flex items-center gap-1">
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
                                          'w-3.5 h-3.5 rounded-full transition-all',
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
                              </>
                            ) : (
                              <>
                                <span className={cn(
                                  'text-xs font-semibold px-1.5 py-0.5 rounded',
                                  PROFILE_COLORS.find(c => c.value === getProfileColor(profile.name))?.classes
                                )}>
                                  {displayName}
                                </span>
                                <button
                                  onClick={(e) => handleStartEdit(e, profile.name)}
                                  className="p-0.5 rounded hover:bg-muted/80 opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity"
                                  title="Edit display name & color"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              </>
                            )}
                          </div>
                          <div className="font-medium truncate mt-1">{profile.name}</div>
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
