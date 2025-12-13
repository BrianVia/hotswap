import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeState {
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;

  // Actions
  setThemeMode: (mode: ThemeMode) => void;
  setResolvedTheme: (theme: ResolvedTheme) => void;
  initializeTheme: () => Promise<() => void>;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      themeMode: 'system',
      resolvedTheme: 'light',

      setThemeMode: (mode) => {
        set({ themeMode: mode });

        // If switching to manual mode, set resolved immediately
        if (mode === 'light' || mode === 'dark') {
          set({ resolvedTheme: mode });
        } else {
          // Switching to system - fetch current system theme
          window.dynomite.getSystemTheme().then((systemTheme) => {
            set({ resolvedTheme: systemTheme });
          });
        }
      },

      setResolvedTheme: (theme) => set({ resolvedTheme: theme }),

      initializeTheme: async () => {
        const { themeMode } = get();

        // Get initial system theme
        const systemTheme = await window.dynomite.getSystemTheme();

        if (themeMode === 'system') {
          set({ resolvedTheme: systemTheme });
        } else {
          // Manual mode - use the stored mode
          set({ resolvedTheme: themeMode });
        }

        // Subscribe to system theme changes
        const unsubscribe = window.dynomite.onThemeChange((newSystemTheme) => {
          const currentMode = get().themeMode;
          if (currentMode === 'system') {
            set({ resolvedTheme: newSystemTheme });
          }
          // If in manual mode, ignore system changes
        });

        return unsubscribe;
      },
    }),
    {
      name: 'dynomite-theme',
      partialize: (state) => ({
        themeMode: state.themeMode,
        // Don't persist resolvedTheme - it's computed
      }),
    }
  )
);
