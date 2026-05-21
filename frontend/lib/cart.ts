export type CartItem = {
  exerciseId: string;
  name: string;
  muscleGroup: string;
  imageUrl?: string | null;
  sets: number;
  reps: number;
  weight?: number | null;
  restSeconds?: number;
  restLimitSeconds?: number;
};

const KEY = "cart_exercises";

export function readCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeCart(items: CartItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function addToCart(item: CartItem) {
  const cart = readCart();
  const exists = cart.some((x) => x.exerciseId === item.exerciseId);
  if (exists) return;
  cart.push({ restSeconds: 30, restLimitSeconds: 45, ...item });
  writeCart(cart);
}

export function removeFromCart(exerciseId: string) {
  const cart = readCart().filter((x) => x.exerciseId !== exerciseId);
  writeCart(cart);
}

export function clearCart() {
  writeCart([]);
}
