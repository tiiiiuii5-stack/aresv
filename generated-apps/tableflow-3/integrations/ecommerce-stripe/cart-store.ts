// Integration module: Ecommerce-Stripe
import { create } from "zustand";

export type CartItem = { productId: string; name: string; quantity: number; unitAmount: number };

export const useCartStore = create<{
  items: CartItem[];
  addItem: (item: CartItem) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
}>((set) => ({
  items: [],
  addItem: (item) => set((state) => ({ items: mergeItem(state.items, item) })),
  updateQuantity: (productId, quantity) =>
    set((state) => ({ items: state.items.map((item) => (item.productId === productId ? { ...item, quantity } : item)).filter((item) => item.quantity > 0) })),
  clear: () => set({ items: [] }),
}));

function mergeItem(items: CartItem[], next: CartItem) {
  const existing = items.find((item) => item.productId === next.productId);
  if (!existing) return [...items, next];
  return items.map((item) => (item.productId === next.productId ? { ...item, quantity: item.quantity + next.quantity } : item));
}
