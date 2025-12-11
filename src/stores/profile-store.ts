import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AwsProfile, AuthStatus } from '../types';

export type ProfileColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'gray';
export type ProfileEnvironment = 'dev' | 'test' | 'stage' | 'prod';

export const PROFILE_COLORS: { value: ProfileColor; label: string; classes: string }[] = [
  { value: 'red', label: 'Red', classes: 'bg-red-500/20 text-red-600 dark:text-red-400' },
  { value: 'orange', label: 'Orange', classes: 'bg-orange-500/20 text-orange-600 dark:text-orange-400' },
  { value: 'yellow', label: 'Yellow', classes: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400' },
  { value: 'green', label: 'Green', classes: 'bg-green-500/20 text-green-600 dark:text-green-400' },
  { value: 'blue', label: 'Blue', classes: 'bg-blue-500/20 text-blue-600 dark:text-blue-400' },
  { value: 'purple', label: 'Purple', classes: 'bg-purple-500/20 text-purple-600 dark:text-purple-400' },
  { value: 'pink', label: 'Pink', classes: 'bg-pink-500/20 text-pink-600 dark:text-pink-400' },
  { value: 'gray', label: 'Gray', classes: 'bg-gray-500/20 text-gray-600 dark:text-gray-400' },
];

export const PROFILE_ENVIRONMENTS: { value: ProfileEnvironment; label: string; color: ProfileColor }[] = [
  { value: 'dev', label: 'DEV', color: 'green' },
  { value: 'test', label: 'TEST', color: 'blue' },
  { value: 'stage', label: 'STAGE', color: 'yellow' },
  { value: 'prod', label: 'PROD', color: 'red' },
];

interface ProfileState {
  profiles: AwsProfile[];
  selectedProfile: AwsProfile | null;
  authStatuses: Map<string, AuthStatus>;
  isLoading: boolean;
  error: string | null;
  // Custom display names for profiles (persisted)
  profileDisplayNames: Record<string, string>;
  // Custom colors for profiles (persisted)
  profileColors: Record<string, ProfileColor>;
  // Disabled profiles - hidden from selector (persisted)
  disabledProfiles: Record<string, boolean>;
  // Default profile to auto-select on startup (persisted)
  defaultProfileName: string | null;
  // Environment tags - explicit override of auto-detected env (persisted)
  profileEnvironments: Record<string, ProfileEnvironment>;
  // Last selected profile name for persistence (persisted)
  lastSelectedProfileName: string | null;

  // Actions
  loadProfiles: () => Promise<void>;
  selectProfile: (profile: AwsProfile | null) => void;
  checkAuth: (profileName: string) => Promise<AuthStatus>;
  login: (profileName: string) => Promise<{ success: boolean; error?: string }>;
  setProfileDisplayName: (profileName: string, displayName: string) => void;
  getProfileDisplayName: (profileName: string) => string;
  setProfileColor: (profileName: string, color: ProfileColor) => void;
  getProfileColor: (profileName: string) => ProfileColor;
  // New actions
  setProfileDisabled: (profileName: string, disabled: boolean) => void;
  isProfileDisabled: (profileName: string) => boolean;
  setDefaultProfile: (profileName: string | null) => void;
  setProfileEnvironment: (profileName: string, env: ProfileEnvironment | null) => void;
  getProfileEnvironment: (profileName: string) => ProfileEnvironment | null;
  getEnabledProfiles: () => AwsProfile[];
}

// Helper to derive a short name from profile name
const deriveShortName = (profileName: string): string => {
  // Try to extract environment suffix like DEV, PROD, STAGING
  const envMatch = profileName.match(/[-_](DEV|PROD|STAGING|QA|UAT|TEST|LOCAL)$/i);
  if (envMatch) {
    return envMatch[1].toUpperCase();
  }
  // Otherwise return first 8 chars
  return profileName.slice(0, 8);
};

// Helper to derive a default color from profile name
const deriveDefaultColor = (profileName: string): ProfileColor => {
  const name = profileName.toUpperCase();
  if (name.includes('PROD')) return 'red';
  if (name.includes('STAGING') || name.includes('UAT')) return 'yellow';
  if (name.includes('DEV') || name.includes('LOCAL')) return 'green';
  if (name.includes('QA') || name.includes('TEST')) return 'blue';
  return 'gray';
};

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      profiles: [],
      selectedProfile: null,
      authStatuses: new Map(),
      isLoading: false,
      error: null,
      profileDisplayNames: {},
      profileColors: {},
      disabledProfiles: {},
      defaultProfileName: null,
      profileEnvironments: {},
      lastSelectedProfileName: null,

      loadProfiles: async () => {
        set({ isLoading: true, error: null });
        try {
          const profiles = await window.hotswap.getProfiles();
          set({ profiles, isLoading: false });
        } catch (error) {
          set({ error: (error as Error).message, isLoading: false });
        }
      },

      selectProfile: (profile) => {
        set({
          selectedProfile: profile,
          lastSelectedProfileName: profile?.name ?? null,
        });
      },

      checkAuth: async (profileName) => {
        const status = await window.hotswap.checkAuthStatus(profileName);
        set((state) => ({
          authStatuses: new Map(state.authStatuses).set(profileName, status),
        }));
        return status;
      },

      login: async (profileName) => {
        const result = await window.hotswap.loginWithSSO(profileName);
        if (result.success) {
          // Re-check auth status after successful login
          await get().checkAuth(profileName);
        }
        return result;
      },

      setProfileDisplayName: (profileName, displayName) => {
        set((state) => ({
          profileDisplayNames: {
            ...state.profileDisplayNames,
            [profileName]: displayName,
          },
        }));
      },

      getProfileDisplayName: (profileName) => {
        const state = get();
        // Return custom name if set, otherwise derive from profile name
        return state.profileDisplayNames[profileName] || deriveShortName(profileName);
      },

      setProfileColor: (profileName, color) => {
        set((state) => ({
          profileColors: {
            ...state.profileColors,
            [profileName]: color,
          },
        }));
      },

      getProfileColor: (profileName) => {
        const state = get();
        // Return custom color if set, otherwise derive from profile name
        return state.profileColors[profileName] || deriveDefaultColor(profileName);
      },

      setProfileDisabled: (profileName, disabled) => {
        set((state) => ({
          disabledProfiles: {
            ...state.disabledProfiles,
            [profileName]: disabled,
          },
        }));
      },

      isProfileDisabled: (profileName) => {
        return get().disabledProfiles[profileName] ?? false;
      },

      setDefaultProfile: (profileName) => {
        set({ defaultProfileName: profileName });
      },

      setProfileEnvironment: (profileName, env) => {
        set((state) => {
          const newEnvs = { ...state.profileEnvironments };
          if (env === null) {
            delete newEnvs[profileName];
          } else {
            newEnvs[profileName] = env;
          }
          return { profileEnvironments: newEnvs };
        });
      },

      getProfileEnvironment: (profileName) => {
        const state = get();
        // Return explicit env if set, otherwise auto-detect from profile name
        if (state.profileEnvironments[profileName]) {
          return state.profileEnvironments[profileName];
        }
        // Auto-detect from profile name
        const name = profileName.toUpperCase();
        if (name.includes('PROD')) return 'prod';
        if (name.includes('STAGING') || name.includes('STAGE') || name.includes('STG')) return 'stage';
        if (name.includes('TEST') || name.includes('QA') || name.includes('UAT')) return 'test';
        if (name.includes('DEV') || name.includes('LOCAL') || name.includes('DEVELOPMENT')) return 'dev';
        return null;
      },

      getEnabledProfiles: () => {
        const state = get();
        return state.profiles.filter((p) => !state.disabledProfiles[p.name]);
      },
    }),
    {
      name: 'hotswap-profiles',
      partialize: (state) => ({
        profileDisplayNames: state.profileDisplayNames,
        profileColors: state.profileColors,
        disabledProfiles: state.disabledProfiles,
        defaultProfileName: state.defaultProfileName,
        profileEnvironments: state.profileEnvironments,
        lastSelectedProfileName: state.lastSelectedProfileName,
      }),
    }
  )
);
