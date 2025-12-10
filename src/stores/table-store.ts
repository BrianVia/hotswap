import { create } from 'zustand';
import type { TableInfo } from '../types';

interface TableState {
  // Tables per profile
  tablesByProfile: Map<string, string[]>;
  // Selected table info
  selectedTable: TableInfo | null;
  // Loading states
  isLoadingTables: boolean;
  isLoadingTableInfo: boolean;
  error: string | null;

  // Actions
  loadTables: (profileName: string) => Promise<void>;
  selectTable: (profileName: string, tableName: string) => Promise<void>;
  clearSelection: () => void;
  getTablesForProfile: (profileName: string) => string[];
}

export const useTableStore = create<TableState>((set, get) => ({
  tablesByProfile: new Map(),
  selectedTable: null,
  isLoadingTables: false,
  isLoadingTableInfo: false,
  error: null,

  loadTables: async (profileName) => {
    set({ isLoadingTables: true, error: null });
    try {
      const tables = await window.hotswap.listTables(profileName);
      set((state) => ({
        tablesByProfile: new Map(state.tablesByProfile).set(profileName, tables),
        isLoadingTables: false,
      }));
    } catch (error) {
      const errorMessage = (error as Error).message;
      // Check for auth errors
      if (errorMessage.includes('token') || errorMessage.includes('credentials') || errorMessage.includes('expired')) {
        set({ error: 'Authentication required. Please login.', isLoadingTables: false });
      } else {
        set({ error: errorMessage, isLoadingTables: false });
      }
    }
  },

  selectTable: async (profileName, tableName) => {
    set({ isLoadingTableInfo: true, error: null });
    try {
      const tableInfo = await window.hotswap.describeTable(profileName, tableName);
      set({ selectedTable: tableInfo, isLoadingTableInfo: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoadingTableInfo: false });
    }
  },

  clearSelection: () => {
    set({ selectedTable: null });
  },

  getTablesForProfile: (profileName) => {
    return get().tablesByProfile.get(profileName) || [];
  },
}));
