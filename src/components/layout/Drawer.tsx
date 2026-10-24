"use client";

import { useEffect, useRef } from "react";
import { CloseIcon, CartIcon } from "../ui/Icons";

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onCartClick?: () => void;
  children: React.ReactNode;
  position?: "left" | "right";
  // An accessible panel name for screen readers (Меню / Фільтри / Сортування / Кошик).
  label?: string;
}

// The interactive elements between which we keep the focus while the panel is open.
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Drawer({ isOpen, onClose, onCartClick, children, position = "left", label = "Панель" }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // onClose may be a new function every time (an inline arrow) — we keep it in a ref,
  // so the effect below depends only on isOpen and doesn't restart on every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const sideClasses =
    position === "right"
      ? isOpen
        ? "right-0 translate-x-0"
        : "right-0 translate-x-full"
      : isOpen
        ? "left-0 translate-x-0"
        : "left-0 -translate-x-full";

  // The scroll lock + focus management only while the panel is open.
  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    // Focus inside: the first interactive element, otherwise the panel itself.
    (panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;

      // Focus trap: Tab must not leave the panel.
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "unset";
      // We return the focus to where the panel was opened from.
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/20 z-40 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        // While closed — the panel is off-screen; we take it out of the tab order and away from AT.
        inert={!isOpen}
        className={`
        fixed top-0 h-[100svh]
        bg-opora-white z-50 flex flex-col
        transform transition-transform duration-300 ease-in-out
        w-[85%] md:w-[400px]
        focus:outline-none
        ${sideClasses}
      `}>
        {/* A SINGLE HEADER FOR EVERY STATE */}
        <div className={`flex items-center px-6 py-6 border-b border-opora-brown/10 bg-opora-white ${position === "left" ? "justify-start" : "justify-end"}`}>
          {onCartClick && <button
            onClick={onCartClick}
            aria-label="Відкрити кошик"
            className="p-2 -ml-2 text-opora-brown hover:opacity-70 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-opora-brown focus-visible:ring-offset-2"
          >
            <CartIcon className="w-6 h-6" />
          </button>}

          <button
            onClick={onClose}
            aria-label="Закрити"
            className={`p-2 text-opora-brown hover:opacity-70 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-opora-brown focus-visible:ring-offset-2 ${position === "left" ? "-ml-2" : "-mr-2"}`}
          >
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        {/* The changing content (Меню, Фільтри, Сортування) */}
        <div className="flex-1 overflow-y-auto sm:overflow-hidden px-3 py-5">
          {children}
        </div>
      </div>
    </>
  );
}
