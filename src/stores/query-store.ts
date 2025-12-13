import { create } from 'zustand';
import type { SkOperator, QueryParams, TableInfo } from '../types';

interface QueryState {
  // Query builder params
  selectedIndex: string | null; // null = primary table
  pkValue: string;
  skOperator: SkOperator;
  skValue: string;
  skValue2: string; // for 'between'
  limit: number;
  scanForward: boolean;

  // Results
  results: Record<string, unknown>[];
  lastEvaluatedKey?: Record<string, unknown>;
  isLoading: boolean;
  error: string | null;
  count: number;
  scannedCount: number;

  // Actions
  setSelectedIndex: (index: string | null) => void;
  setPkValue: (value: string) => void;
  setSkOperator: (operator: SkOperator) => void;
  setSkValue: (value: string) => void;
  setSkValue2: (value: string) => void;
  setLimit: (limit: number) => void;
  setScanForward: (forward: boolean) => void;
  executeQuery: (profileName: string, tableInfo: TableInfo) => Promise<void>;
  executeScan: (profileName: string, tableName: string) => Promise<void>;
  loadMore: (profileName: string, tableInfo: TableInfo) => Promise<void>;
  clearResults: () => void;
  resetQueryParams: () => void;
}

const getKeySchemaForIndex = (tableInfo: TableInfo, indexName: string | null) => {
  if (!indexName) {
    return tableInfo.keySchema;
  }

  const gsi = tableInfo.globalSecondaryIndexes?.find(g => g.indexName === indexName);
  if (gsi) return gsi.keySchema;

  const lsi = tableInfo.localSecondaryIndexes?.find(l => l.indexName === indexName);
  if (lsi) return lsi.keySchema;

  return tableInfo.keySchema;
};

export const useQueryStore = create<QueryState>((set, get) => ({
  // Initial state
  selectedIndex: null,
  pkValue: '',
  skOperator: 'eq',
  skValue: '',
  skValue2: '',
  limit: 100,
  scanForward: false,

  results: [],
  lastEvaluatedKey: undefined,
  isLoading: false,
  error: null,
  count: 0,
  scannedCount: 0,

  // Setters
  setSelectedIndex: (index) => set({ selectedIndex: index }),
  setPkValue: (value) => set({ pkValue: value }),
  setSkOperator: (operator) => set({ skOperator: operator }),
  setSkValue: (value) => set({ skValue: value }),
  setSkValue2: (value) => set({ skValue2: value }),
  setLimit: (limit) => set({ limit }),
  setScanForward: (forward) => set({ scanForward: forward }),

  executeQuery: async (profileName, tableInfo) => {
    const state = get();
    set({ isLoading: true, error: null, results: [], lastEvaluatedKey: undefined });

    try {
      const keySchema = getKeySchemaForIndex(tableInfo, state.selectedIndex);
      const pkAttr = keySchema.find(k => k.keyType === 'HASH');
      const skAttr = keySchema.find(k => k.keyType === 'RANGE');

      if (!pkAttr) {
        throw new Error('No partition key found for selected index');
      }

      const params: QueryParams = {
        tableName: tableInfo.tableName,
        indexName: state.selectedIndex || undefined,
        keyCondition: {
          pk: { name: pkAttr.attributeName, value: state.pkValue },
        },
        limit: state.limit,
        scanIndexForward: state.scanForward,
      };

      // Add sort key condition if value provided and table has SK
      if (skAttr && state.skValue) {
        params.keyCondition.sk = {
          name: skAttr.attributeName,
          operator: state.skOperator,
          value: state.skValue,
          value2: state.skOperator === 'between' ? state.skValue2 : undefined,
        };
      }

      const result = await window.dynomite.queryTable(profileName, params);

      set({
        results: result.items,
        lastEvaluatedKey: result.lastEvaluatedKey,
        count: result.count,
        scannedCount: result.scannedCount,
        isLoading: false,
      });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  executeScan: async (profileName, tableName) => {
    const state = get();
    set({ isLoading: true, error: null, results: [], lastEvaluatedKey: undefined });

    try {
      const result = await window.dynomite.scanTable(profileName, {
        tableName,
        indexName: state.selectedIndex || undefined,
        limit: state.limit,
      });

      set({
        results: result.items,
        lastEvaluatedKey: result.lastEvaluatedKey,
        count: result.count,
        scannedCount: result.scannedCount,
        isLoading: false,
      });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  loadMore: async (profileName, tableInfo) => {
    const state = get();
    if (!state.lastEvaluatedKey) return;

    set({ isLoading: true, error: null });

    try {
      const keySchema = getKeySchemaForIndex(tableInfo, state.selectedIndex);
      const pkAttr = keySchema.find(k => k.keyType === 'HASH');
      const skAttr = keySchema.find(k => k.keyType === 'RANGE');

      if (!pkAttr) {
        throw new Error('No partition key found for selected index');
      }

      const params: QueryParams = {
        tableName: tableInfo.tableName,
        indexName: state.selectedIndex || undefined,
        keyCondition: {
          pk: { name: pkAttr.attributeName, value: state.pkValue },
        },
        limit: state.limit,
        scanIndexForward: state.scanForward,
        exclusiveStartKey: state.lastEvaluatedKey,
      };

      if (skAttr && state.skValue) {
        params.keyCondition.sk = {
          name: skAttr.attributeName,
          operator: state.skOperator,
          value: state.skValue,
          value2: state.skOperator === 'between' ? state.skValue2 : undefined,
        };
      }

      const result = await window.dynomite.queryTable(profileName, params);

      set({
        results: [...state.results, ...result.items],
        lastEvaluatedKey: result.lastEvaluatedKey,
        count: state.count + result.count,
        scannedCount: state.scannedCount + result.scannedCount,
        isLoading: false,
      });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  clearResults: () => {
    set({
      results: [],
      lastEvaluatedKey: undefined,
      count: 0,
      scannedCount: 0,
      error: null,
    });
  },

  resetQueryParams: () => {
    set({
      selectedIndex: null,
      pkValue: '',
      skOperator: 'eq',
      skValue: '',
      skValue2: '',
      limit: 100,
      scanForward: false,
    });
  },
}));
