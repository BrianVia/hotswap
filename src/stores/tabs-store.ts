import { create } from 'zustand';
import type { TableInfo, SkOperator, FilterCondition } from '../types';

// Persist default maxResults to localStorage
const STORAGE_KEY = 'dynomite:defaultMaxResults';
const DEFAULT_MAX_RESULTS = 1000;

const getStoredMaxResults = (): number => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  } catch {
    // localStorage not available
  }
  return DEFAULT_MAX_RESULTS;
};

const saveMaxResults = (value: number): void => {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // localStorage not available
  }
};

export interface TabQueryState {
  selectedIndex: string | null;
  pkValue: string;
  skOperator: SkOperator;
  skValue: string;
  skValue2: string;
  filters: FilterCondition[];
  maxResults: number; // Target max results to fetch (auto-paginates until this)
  scanForward: boolean;
  results: Record<string, unknown>[];
  lastEvaluatedKey?: Record<string, unknown>;
  isLoading: boolean;
  isFetchingMore: boolean; // True when auto-paginating
  error: string | null;
  count: number;
  scannedCount: number;
  queryStartTime?: number; // Timestamp when query started
  queryElapsedMs?: number; // Elapsed time in ms
  currentQueryId?: string; // ID of in-flight query (for cancellation)
}

export interface Tab {
  id: string;
  tableName: string;
  tableInfo: TableInfo | null;
  queryState: TabQueryState;
  profileName: string;
  isNew?: boolean; // For entrance animation
  isClosing?: boolean; // For exit animation
}

interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;

  // Actions
  openTab: (tableName: string, tableInfo: TableInfo | null, profileName: string) => void;
  openTabInBackground: (tableName: string, tableInfo: TableInfo | null, profileName: string) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTabTableInfo: (tabId: string, tableInfo: TableInfo) => void;
  updateTabQueryState: (tabId: string, updates: Partial<TabQueryState>) => void;
  getActiveTab: () => Tab | null;
}

const createDefaultQueryState = (): TabQueryState => ({
  selectedIndex: null,
  pkValue: '',
  skOperator: 'eq',
  skValue: '',
  skValue2: '',
  filters: [],
  maxResults: getStoredMaxResults(), // Use persisted default
  scanForward: true, // Ascending order (regular sort key)
  results: [],
  lastEvaluatedKey: undefined,
  isLoading: false,
  isFetchingMore: false,
  error: null,
  count: 0,
  scannedCount: 0,
  queryStartTime: undefined,
  queryElapsedMs: undefined,
  currentQueryId: undefined,
});

let tabIdCounter = 0;
const generateTabId = () => `tab-${++tabIdCounter}`;

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTab: (tableName, tableInfo, profileName) => {
    const state = get();

    // Check if tab with this table AND profile already exists
    const existingTab = state.tabs.find(t => t.tableName === tableName && t.profileName === profileName);
    if (existingTab) {
      set({ activeTabId: existingTab.id });
      return;
    }

    const newTab: Tab = {
      id: generateTabId(),
      tableName,
      tableInfo,
      queryState: createDefaultQueryState(),
      profileName,
      isNew: true,
    };

    set({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
    });

    // Clear the isNew flag after animation
    setTimeout(() => {
      set(state => ({
        tabs: state.tabs.map(t => t.id === newTab.id ? { ...t, isNew: false } : t),
      }));
    }, 200);
  },

  openTabInBackground: (tableName, tableInfo, profileName) => {
    const state = get();

    // Always create a new tab - user explicitly requested "Open in New Tab"
    const newTab: Tab = {
      id: generateTabId(),
      tableName,
      tableInfo,
      queryState: createDefaultQueryState(),
      profileName,
      isNew: true,
    };

    set({
      tabs: [...state.tabs, newTab],
      // Keep activeTabId unchanged
    });

    // Clear the isNew flag after animation
    setTimeout(() => {
      set(state => ({
        tabs: state.tabs.map(t => t.id === newTab.id ? { ...t, isNew: false } : t),
      }));
    }, 200);
  },

  closeTab: (tabId) => {
    const state = get();
    const tabIndex = state.tabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;

    // Mark tab as closing for exit animation
    set(state => ({
      tabs: state.tabs.map(t => t.id === tabId ? { ...t, isClosing: true } : t),
    }));

    // Actually remove the tab after animation
    setTimeout(() => {
      const currentState = get();
      const newTabs = currentState.tabs.filter(t => t.id !== tabId);

      let newActiveTabId = currentState.activeTabId;
      if (currentState.activeTabId === tabId) {
        // If closing active tab, switch to adjacent tab
        if (newTabs.length === 0) {
          newActiveTabId = null;
        } else if (tabIndex >= newTabs.length) {
          newActiveTabId = newTabs[newTabs.length - 1].id;
        } else {
          newActiveTabId = newTabs[tabIndex].id;
        }
      }

      set({
        tabs: newTabs,
        activeTabId: newActiveTabId,
      });
    }, 150);
  },

  setActiveTab: (tabId) => {
    set({ activeTabId: tabId });
  },

  updateTabTableInfo: (tabId, tableInfo) => {
    set(state => ({
      tabs: state.tabs.map(tab =>
        tab.id === tabId ? { ...tab, tableInfo } : tab
      ),
    }));
  },

  updateTabQueryState: (tabId, updates) => {
    // Persist maxResults when it changes
    if (updates.maxResults !== undefined) {
      saveMaxResults(updates.maxResults);
    }
    set(state => ({
      tabs: state.tabs.map(tab =>
        tab.id === tabId
          ? { ...tab, queryState: { ...tab.queryState, ...updates } }
          : tab
      ),
    }));
  },

  getActiveTab: () => {
    const state = get();
    if (!state.activeTabId) return null;
    return state.tabs.find(t => t.id === state.activeTabId) || null;
  },
}));
