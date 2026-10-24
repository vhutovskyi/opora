// A popup message about adding to the cart
"use client";

import { useCartStore } from "@/store/cartStore";
import { Option, hexColor } from "./types";

interface CartToastProps {
  toast: { message: string; options: Option[] } | null;
  onClose: () => void;
}

export default function CartToast({ toast, onClose }: CartToastProps) {
  const openCart = useCartStore((state) => state.openCart);

  return (
    <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-200 transition-all duration-300 ${
      toast ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-2 pointer-events-none'
    }`}>
      <div
        onClick={() => { openCart(); onClose(); }}
        role="button"
        tabIndex={0}
        aria-label="Відкрити кошик"
        className="flex items-center gap-3 bg-opora-brown text-white pl-6 pr-4 py-3 rounded-full shadow-lg text-sm font-medium whitespace-nowrap cursor-pointer"
      >
        <span>{toast?.message}</span>
        {toast?.options && toast.options.length > 0 && (
          <div className="flex items-center gap-1.5">
            {toast.options.map((opt, i) => (
              <span
                key={i}
                className="w-4 h-4 rounded-full border border-white/40 shrink-0"
                style={{ backgroundColor: hexColor(opt.value) }}
                title={opt.name}
              />
            ))}
          </div>
        )}
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="opacity-70 hover:opacity-100 transition-opacity" aria-label="Закрити">
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 1L13 13M1 13L13 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
