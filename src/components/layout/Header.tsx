"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { MenuIcon, CartIcon, OporaLogo } from "../ui/Icons";
import HeaderSearch from "./HeaderSearch";
import MenuDrawer from "./MenuDrawer";
import CartDrawer from "./CartDrawer";
import { useCartStore } from "@/store/cartStore";
import { buildSubcategoryTrees, type SubcategoryNode, type SubcategoryOptionRow } from "@/lib/supabase/subcategoryTree";
import { catalogHref, subRef } from "@/lib/utils";

// useSearchParams requires a Suspense boundary, otherwise Next renders the whole subtree on the client —
// so this small leaf is extracted separately instead of being called directly in Header (which sits on every page).
function SelectedCatalogWatcher({ onChange }: { onChange: (catalog: string | null) => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    onChange(pathname === "/catalog" ? searchParams.get("type") : null);
  }, [pathname, searchParams, onChange]);
  return null;
}

// The nested levels under a mega-menu column — recursive, so any depth is rendered.
function SubList({ nodes, catalog, depth }: { nodes: SubcategoryNode[]; catalog: string; depth: number }) {
  if (nodes.length === 0) return null;
  return (
    <ul className={depth > 0 ? "ml-3 border-l border-opora-brown/10 pl-3" : ""}>
      {nodes.map((node) => (
        <li key={node.id}>
          {/* Category Groups (Матеріал, Розмір, ...) are a filter heading, not a navigable page — they render inert here. */}
          {node.is_group ? (
            <span className="block py-1 text-sm whitespace-nowrap text-opora-brown/70">{node.name}</span>
          ) : (
            <Link
              href={catalogHref(catalog, subRef(node))}
              className="block py-1 text-sm whitespace-nowrap text-opora-brown/70 hover:text-opora-brown transition-colors"
            >
              {node.name}
            </Link>
          )}
          <SubList nodes={node.children} catalog={catalog} depth={depth + 1} />
        </li>
      ))}
    </ul>
  );
}

export default function Header({
  catalogs = [],
  subcategoryOptions = [],
}: {
  catalogs?: string[];
  subcategoryOptions?: SubcategoryOptionRow[];
}) {
  const pathname = usePathname();
  const [selectedCatalog, setSelectedCatalog] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // The subcategory tree per catalog (a Map isn't serializable across the RSC boundary,
  // so a flat list comes from the server and the tree is built here).
  const treeByCatalog = useMemo(() => buildSubcategoryTrees(subcategoryOptions), [subcategoryOptions]);

  // The cart hydrates from localStorage on the client only — we render the counter after mounting,
  // so the server HTML (0 items) matches the first client render.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [isVisible, setIsVisible] = useState(true);
  const [isAtTop, setIsAtTop] = useState(true);
  const lastScrollY = useRef(0);

  // Only the product page has a hero image the header can float over — everywhere else it stays solid.
  const isProductPage = pathname !== "/catalog" && pathname.startsWith("/catalog/");

  const getTotalItems = useCartStore((state) => state.getTotalItems);

  // The cart open state is global (so that CartToast can open it)
  const openCart = useCartStore((state) => state.openCart);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      // In the catalog the header appears only near the very top — otherwise, when scrolling up,
      // it covers the sticky filter sidebar. On the other pages — the usual behaviour
      // (shown when scrolling up).
      const isCatalog = pathname === "/catalog";
      const visible = isCatalog
        ? currentScrollY < 50
        : currentScrollY < lastScrollY.current || currentScrollY < 50;
      setIsVisible(visible);
      setIsAtTop(currentScrollY < 50);

      // We publish the real header offset so that the catalog's sticky sidebar can
      // follow it: header visible → 6rem clearance, hidden → 2rem.
      document.documentElement.style.setProperty("--header-offset", visible ? "6rem" : "2rem");

      lastScrollY.current = currentScrollY;
    };

    handleScroll(); // initialize the variable right away
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [pathname]);

  return (
    <>
      <Suspense fallback={null}>
        <SelectedCatalogWatcher onChange={setSelectedCatalog} />
      </Suspense>

      {/* backdrop-blur stays on at all times: backdrop-filter isn't animatable, so if it is switched
          on together with the background, the transition looks like a jump. Only the alpha changes smoothly.
          The fade-from-transparent only applies on the product page, which has a hero image to float over. */}
      <header
        className={`fixed top-0 left-0 w-full z-30 px-4 md:px-8 pt-6 flex flex-col text-opora-brown
          transition-all duration-300 ease-in-out
          ${isVisible ? "translate-y-0" : "-translate-y-full"}
          backdrop-blur-md
          ${isProductPage && isAtTop ? "bg-transparent shadow-none" : "bg-opora-softBeige shadow-md"}
        `}
      >
        {/* The top row: burger / logo / search + cart.
            Grid, not justify-between: the outer columns at 1fr = the logo ends up centred. */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center w-full pb-6">
          {/* The menu button (burger) */}
          <button
            onClick={() => setIsMenuOpen(true)}
            aria-label="Відкрити меню"
            className="hover:opacity-70 transition-opacity p-2 -ml-2 justify-self-start"
          >
            <MenuIcon className="w-6 h-6" />
          </button>

          {/* The logo */}
          <Link
            href="/"
            className="text-2xl md:text-3xl tracking-[0.2em] uppercase font-medium cursor-pointer"
          >
            <OporaLogo className="pointer-events-none" />
          </Link>

          <div className="flex items-center gap-1 -mr-2 justify-self-end">
            <HeaderSearch />
            <button
              onClick={openCart}
              aria-label="Відкрити кошик"
              className="hover:opacity-70 transition-opacity p-2 relative"
            >
              <CartIcon className="w-6 h-6" />
              {mounted && getTotalItems() > 0 && (
                <span className="absolute top-1 right-0 bg-red-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {getTotalItems()}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Catalogs — a horizontal row under the header; hover opens the mega menu (desktop).
            Every first-level branch is a column of its own, its subtree goes below it.
            No gap: the spacing lives in the padding of the links themselves, so between the catalogs there is no
            "dead" zone, which used to kill the mega menu hover (and wasn't clickable). */}
        {catalogs.length > 0 && (
          <nav className="hidden lg:flex items-center justify-center border-t border-opora-brown/10">
            {catalogs.map((cat) => {
              const roots = treeByCatalog.get(cat) ?? [];
              return (
                <div key={cat} className="group relative">
                  <Link
                    href={catalogHref(cat)}
                    className={`block px-4 py-4 text-sm uppercase tracking-wide hover:opacity-60 transition-opacity ${
                      selectedCatalog === cat ? "font-bold" : ""
                    }`}
                  >
                    {cat}
                  </Link>
                  {roots.length > 0 && (
                    // pt-* keeps the hover alive without a "hole" between the trigger and the panel
                    <div className="invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity duration-200 absolute left-1/2 -translate-x-1/2 top-full pt-1 z-40">
                      <div className="flex gap-10 bg-opora-white shadow-lg rounded-sm px-8 py-6">
                        {roots.map((root) => (
                          <div key={root.id} className="min-w-40">
                            {root.is_group ? (
                              <span className="block pb-2 text-sm font-semibold uppercase tracking-wide whitespace-nowrap">
                                {root.name}
                              </span>
                            ) : (
                              <Link
                                href={catalogHref(cat, subRef(root))}
                                className="block pb-2 text-sm font-semibold uppercase tracking-wide whitespace-nowrap hover:opacity-60 transition-opacity"
                              >
                                {root.name}
                              </Link>
                            )}
                            <SubList nodes={root.children} catalog={cat} depth={0} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        )}
      </header>

      <MenuDrawer isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} catalogs={catalogs} subcategoryOptions={subcategoryOptions} />
      <CartDrawer />
    </>
  );
}