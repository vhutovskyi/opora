import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
  id: string;
  productId: string;
  title: string;
  sku: string;
  price: number;
  image: string;
  quantity: number;
  options: { name: string; value: string }[];
}

interface CartState {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  syncPrices: (prices: Record<string, number>) => void;
  // UI: the open state of the side cart (managed globally so that
  // any component — CartToast, for instance — can open the cart)
  isCartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  // Computed values
  getTotalPrice: () => number;
  getTotalItems: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      isCartOpen: false,
      openCart: () => set({ isCartOpen: true }),
      closeCart: () => set({ isCartOpen: false }),

      addItem: (newItem) => {
        set((state) => {
          // Check if the exact item (including variation) is already in the cart
          const existingItem = state.items.find((item) => item.id === newItem.id);

          if (existingItem) {
            // If it exists, update the quantity — and take the newer price: the line may have been added
            // (and persisted) before a discount was set, and the page just offered the current one.
            return {
              items: state.items.map((item) =>
                item.id === newItem.id
                  ? { ...item, price: newItem.price, quantity: item.quantity + newItem.quantity }
                  : item
              ),
            };
          }

          // If it's a new item, add it to the array
          return { items: [...state.items, newItem] };
        });
      },

      removeItem: (id) => {
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        }));
      },

      updateQuantity: (id, quantity) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, quantity: Math.max(1, quantity) } : item
          ),
        }));
      },

      clearCart: () => set({ items: [] }),

      // Current prices from /api/cart/prices (variant id → sale-aware price). Lines missing from the
      // map keep their price; the state is untouched when nothing changed, so subscribers don't re-render.
      syncPrices: (prices) => {
        set((state) => {
          const changed = state.items.some((item) => prices[item.id] != null && prices[item.id] !== item.price);
          if (!changed) return state;
          return { items: state.items.map((item) => (prices[item.id] != null ? { ...item, price: prices[item.id] } : item)) };
        });
      },

      getTotalPrice: () => {
        return get().items.reduce((total, item) => total + item.price * item.quantity, 0);
      },

      getTotalItems: () => {
        return get().items.reduce((total, item) => total + item.quantity, 0);
      },
    }),
    {
      name: 'opora-cart-storage', // The key used in localStorage
      // We persist only the items — the UI flags (isCartOpen) are not persisted,
      // otherwise the cart would open by itself after a page reload.
      partialize: (state) => ({ items: state.items }),
    }
  )
);
