import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MAX_COMPARE_ITEMS } from '@/lib/compare';

// Only the variant id goes to localStorage (everything else is fetched by /compare from the ids);
// the catalog is kept next to it so the "one catalog only" rule can be checked without a request.
export interface CompareItem {
  id: string; // variant id
  catalog: string;
}

// Why an add didn't happen — the button explains it to the customer.
export type CompareAddResult = 'added' | 'exists' | 'full' | 'other-catalog';

interface CompareState {
  items: CompareItem[];
  add: (item: CompareItem) => CompareAddResult;
  remove: (id: string) => void;
  // Starts the list over (another catalog / saving a list opened from a shared link).
  replace: (items: CompareItem[]) => void;
  clear: () => void;
}

export const useCompareStore = create<CompareState>()(
  persist(
    (set, get) => ({
      items: [],

      add: (item) => {
        const { items } = get();
        if (items.some((i) => i.id === item.id)) return 'exists';
        // Variants of different catalogs (a chair and a bed) have nothing in common to compare.
        if (items.length > 0 && items[0].catalog !== item.catalog) return 'other-catalog';
        if (items.length >= MAX_COMPARE_ITEMS) return 'full';
        set({ items: [...items, item] });
        return 'added';
      },

      remove: (id) => set((state) => ({ items: state.items.filter((i) => i.id !== id) })),

      replace: (items) => set({ items: items.slice(0, MAX_COMPARE_ITEMS) }),

      clear: () => set({ items: [] }),
    }),
    { name: 'opora-compare-storage' }
  )
);
