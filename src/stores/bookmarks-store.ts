import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SavedBookmark, FilterCondition, SkOperator } from '../types';
import { extractTablePrefix } from '@/lib/table-utils';

interface BookmarksState {
  // Bookmarks keyed by table prefix for cross-environment matching
  bookmarksByPrefix: Record<string, SavedBookmark[]>;

  // Actions
  addBookmark: (
    tableName: string,
    bookmark: {
      name: string;
      selectedIndex: string | null;
      pkValue: string;
      skOperator: SkOperator;
      skValue: string;
      skValue2: string;
      filters: FilterCondition[];
      maxResults: number;
      scanForward: boolean;
    }
  ) => string;
  updateBookmark: (
    bookmarkId: string,
    updates: Partial<
      Pick<
        SavedBookmark,
        | 'name'
        | 'selectedIndex'
        | 'pkValue'
        | 'skOperator'
        | 'skValue'
        | 'skValue2'
        | 'filters'
        | 'maxResults'
        | 'scanForward'
      >
    >
  ) => void;
  deleteBookmark: (bookmarkId: string) => void;
  getBookmarksForTable: (tableName: string) => SavedBookmark[];
  getBookmarkById: (bookmarkId: string) => SavedBookmark | undefined;
}

let bookmarkIdCounter = 0;
const generateBookmarkId = () => `bookmark-${Date.now()}-${++bookmarkIdCounter}`;

export const useBookmarksStore = create<BookmarksState>()(
  persist(
    (set, get) => ({
      bookmarksByPrefix: {},

      addBookmark: (tableName, bookmark) => {
        const prefix = extractTablePrefix(tableName);
        const id = generateBookmarkId();
        const now = Date.now();

        const newBookmark: SavedBookmark = {
          ...bookmark,
          id,
          tablePrefix: prefix,
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          bookmarksByPrefix: {
            ...state.bookmarksByPrefix,
            [prefix]: [...(state.bookmarksByPrefix[prefix] || []), newBookmark],
          },
        }));

        return id;
      },

      updateBookmark: (bookmarkId, updates) => {
        set((state) => {
          const newBookmarksByPrefix = { ...state.bookmarksByPrefix };

          for (const prefix of Object.keys(newBookmarksByPrefix)) {
            const bookmarks = newBookmarksByPrefix[prefix];
            const index = bookmarks.findIndex((b) => b.id === bookmarkId);

            if (index !== -1) {
              newBookmarksByPrefix[prefix] = [
                ...bookmarks.slice(0, index),
                { ...bookmarks[index], ...updates, updatedAt: Date.now() },
                ...bookmarks.slice(index + 1),
              ];
              break;
            }
          }

          return { bookmarksByPrefix: newBookmarksByPrefix };
        });
      },

      deleteBookmark: (bookmarkId) => {
        set((state) => {
          const newBookmarksByPrefix = { ...state.bookmarksByPrefix };

          for (const prefix of Object.keys(newBookmarksByPrefix)) {
            const bookmarks = newBookmarksByPrefix[prefix];
            const filteredBookmarks = bookmarks.filter((b) => b.id !== bookmarkId);

            if (filteredBookmarks.length !== bookmarks.length) {
              if (filteredBookmarks.length === 0) {
                delete newBookmarksByPrefix[prefix];
              } else {
                newBookmarksByPrefix[prefix] = filteredBookmarks;
              }
              break;
            }
          }

          return { bookmarksByPrefix: newBookmarksByPrefix };
        });
      },

      getBookmarksForTable: (tableName) => {
        const prefix = extractTablePrefix(tableName);
        return get().bookmarksByPrefix[prefix] || [];
      },

      getBookmarkById: (bookmarkId) => {
        const state = get();
        for (const bookmarks of Object.values(state.bookmarksByPrefix)) {
          const found = bookmarks.find((b) => b.id === bookmarkId);
          if (found) return found;
        }
        return undefined;
      },
    }),
    {
      name: 'dynomite-bookmarks',
      // Persist everything (bookmarks are small and important)
    }
  )
);
