import { create } from 'zustand';

export interface PendingChange {
  id: string;
  tabId: string;
  rowIndex: number;
  primaryKey: Record<string, unknown>;
  type: 'update' | 'delete' | 'pk-change';

  // For updates
  field?: string;
  originalValue?: unknown;
  newValue?: unknown;

  // For pk-change (stores full old and new items)
  originalItem?: Record<string, unknown>;
  newItem?: Record<string, unknown>;
}

interface PendingChangesState {
  changesByTab: Map<string, PendingChange[]>;

  // Actions
  addChange: (tabId: string, change: Omit<PendingChange, 'id'>) => void;
  removeChange: (tabId: string, changeId: string) => void;
  clearChangesForTab: (tabId: string) => void;
  getChangesForTab: (tabId: string) => PendingChange[];
  clearAllChanges: () => void;

  // Get pending change for a specific cell
  getCellChange: (tabId: string, rowIndex: number, field: string) => PendingChange | undefined;

  // Check if a row is marked for deletion
  isRowDeleted: (tabId: string, rowIndex: number) => boolean;

  // Check if a row has a PK change
  getRowPkChange: (tabId: string, rowIndex: number) => PendingChange | undefined;

  // Computed
  hasChanges: (tabId: string) => boolean;
  changeCount: (tabId: string) => number;
  totalChangeCount: () => number;
}

let changeIdCounter = 0;
const generateChangeId = () => `change-${++changeIdCounter}`;

export const usePendingChangesStore = create<PendingChangesState>((set, get) => ({
  changesByTab: new Map(),

  addChange: (tabId, change) => {
    set((state) => {
      const newMap = new Map(state.changesByTab);
      const existing = newMap.get(tabId) || [];

      // If this is an update to an existing cell, replace it
      if (change.type === 'update' && change.field) {
        const existingIndex = existing.findIndex(
          (c) =>
            c.type === 'update' &&
            c.rowIndex === change.rowIndex &&
            c.field === change.field
        );

        if (existingIndex >= 0) {
          // If new value equals original, remove the change
          if (existing[existingIndex].originalValue === change.newValue) {
            const updated = existing.filter((_, i) => i !== existingIndex);
            newMap.set(tabId, updated);
            return { changesByTab: newMap };
          }
          // Replace existing change
          const updated = [...existing];
          updated[existingIndex] = {
            ...change,
            id: existing[existingIndex].id,
            originalValue: existing[existingIndex].originalValue, // Keep original
          };
          newMap.set(tabId, updated);
          return { changesByTab: newMap };
        }
      }

      // If marking row as deleted, remove any existing updates for that row
      if (change.type === 'delete') {
        const filtered = existing.filter(
          (c) => !(c.rowIndex === change.rowIndex && c.type !== 'delete')
        );
        // Check if already marked for deletion
        const alreadyDeleted = filtered.some(
          (c) => c.rowIndex === change.rowIndex && c.type === 'delete'
        );
        if (!alreadyDeleted) {
          newMap.set(tabId, [...filtered, { ...change, id: generateChangeId() }]);
        }
        return { changesByTab: newMap };
      }

      // If this is a PK change, replace any existing PK change for this row
      if (change.type === 'pk-change') {
        const filtered = existing.filter(
          (c) => !(c.rowIndex === change.rowIndex && c.type === 'pk-change')
        );
        newMap.set(tabId, [...filtered, { ...change, id: generateChangeId() }]);
        return { changesByTab: newMap };
      }

      // Add new change
      newMap.set(tabId, [...existing, { ...change, id: generateChangeId() }]);
      return { changesByTab: newMap };
    });
  },

  removeChange: (tabId, changeId) => {
    set((state) => {
      const newMap = new Map(state.changesByTab);
      const existing = newMap.get(tabId) || [];
      newMap.set(
        tabId,
        existing.filter((c) => c.id !== changeId)
      );
      return { changesByTab: newMap };
    });
  },

  clearChangesForTab: (tabId) => {
    set((state) => {
      const newMap = new Map(state.changesByTab);
      newMap.delete(tabId);
      return { changesByTab: newMap };
    });
  },

  clearAllChanges: () => {
    set({ changesByTab: new Map() });
  },

  getChangesForTab: (tabId) => {
    return get().changesByTab.get(tabId) || [];
  },

  getCellChange: (tabId, rowIndex, field) => {
    const changes = get().changesByTab.get(tabId) || [];
    return changes.find(
      (c) => c.type === 'update' && c.rowIndex === rowIndex && c.field === field
    );
  },

  isRowDeleted: (tabId, rowIndex) => {
    const changes = get().changesByTab.get(tabId) || [];
    return changes.some((c) => c.type === 'delete' && c.rowIndex === rowIndex);
  },

  getRowPkChange: (tabId, rowIndex) => {
    const changes = get().changesByTab.get(tabId) || [];
    return changes.find((c) => c.type === 'pk-change' && c.rowIndex === rowIndex);
  },

  hasChanges: (tabId) => {
    const changes = get().changesByTab.get(tabId) || [];
    return changes.length > 0;
  },

  changeCount: (tabId) => {
    const changes = get().changesByTab.get(tabId) || [];
    return changes.length;
  },

  totalChangeCount: () => {
    let total = 0;
    get().changesByTab.forEach((changes) => {
      total += changes.length;
    });
    return total;
  },
}));
