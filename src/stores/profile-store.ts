import { create } from 'zustand';
import type { AwsProfile, AuthStatus } from '../types';

interface ProfileState {
  profiles: AwsProfile[];
  selectedProfile: AwsProfile | null;
  authStatuses: Map<string, AuthStatus>;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadProfiles: () => Promise<void>;
  selectProfile: (profile: AwsProfile | null) => void;
  checkAuth: (profileName: string) => Promise<AuthStatus>;
  login: (profileName: string) => Promise<{ success: boolean; error?: string }>;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profiles: [],
  selectedProfile: null,
  authStatuses: new Map(),
  isLoading: false,
  error: null,

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
    set({ selectedProfile: profile });
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
}));
