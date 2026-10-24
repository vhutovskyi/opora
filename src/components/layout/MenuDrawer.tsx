"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Phone, Mail, MapPin, Clock } from "lucide-react";
import Drawer from "./Drawer";
import { STORE } from "@/lib/site";
import { buildSubcategoryTrees, type SubcategoryNode, type SubcategoryOptionRow } from "@/lib/supabase/subcategoryTree";
import { catalogHref, subRef } from "@/lib/utils";

// One tree node with its own expansion state — recursive, so nesting of
// any depth expands the same way as the first level.
function AccordionNode({
  node,
  catalog,
  onClose,
}: {
  node: SubcategoryNode;
  catalog: string;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = node.children.length > 0;
  const panelId = `menu-node-${node.id}`;

  return (
    <li>
      <div className="flex items-stretch">
        {/* Category Groups (Матеріал, Розмір, ...) are a filter heading, not a navigable page — they render inert here. */}
        {node.is_group ? (
          <span className="flex-1 py-2.5 text-sm text-opora-brown/70">{node.name}</span>
        ) : (
          <Link
            href={catalogHref(catalog, subRef(node))}
            onClick={onClose}
            className="flex-1 py-2.5 text-sm hover:text-opora-brown transition-colors"
          >
            {node.name}
          </Link>
        )}
        {hasChildren && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            aria-controls={panelId}
            aria-label={`Підкатегорії: ${node.name}`}
            className="pl-4 pr-1 text-opora-brown/40 hover:text-opora-brown transition-colors"
          >
            <ChevronRight
              className={`w-3.5 h-3.5 transition-transform duration-200 motion-reduce:transition-none ${expanded ? "rotate-90" : ""}`}
            />
          </button>
        )}
      </div>
      {hasChildren && (
        <div
          id={panelId}
          className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:duration-0 ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
        >
          <div className="overflow-hidden">
            <ul className="ml-3 border-l border-opora-brown/10 pl-3">
              {node.children.map((child) => (
                <AccordionNode key={child.id} node={child} catalog={catalog} onClose={onClose} />
              ))}
            </ul>
          </div>
        </div>
      )}
    </li>
  );
}

export default function MenuDrawer({
  isOpen,
  onClose,
  catalogs = [],
  subcategoryOptions = [],
}: {
  isOpen: boolean;
  onClose: () => void;
  catalogs?: string[];
  subcategoryOptions?: SubcategoryOptionRow[];
}) {
  const treeByCatalog = useMemo(() => buildSubcategoryTrees(subcategoryOptions), [subcategoryOptions]);

  // One expanded catalog at a time — an accordion, not an always visible long list.
  const [openCatalog, setOpenCatalog] = useState<string | null>(null);

  return (
    <Drawer isOpen={isOpen} onClose={onClose} position="left" label="Меню">
      <div className="flex flex-col h-full -mx-3">

        {/* The main navigation — pinned at the top */}
        <nav className="shrink-0 px-5 pb-4 border-b border-opora-brown/10">
          <ul className="flex items-center gap-6 text-sm uppercase tracking-wide font-medium">
            <li>
              <Link href="/" onClick={onClose} className="hover:opacity-60 transition-opacity">
                Головна
              </Link>
            </li>
            <li>
              <Link href="/catalog" onClick={onClose} className="hover:opacity-60 transition-opacity">
                Каталог
              </Link>
            </li>
          </ul>
        </nav>

        {/* Catalogs — an accordion: the row leads to the catalog, the chevron expands the subcategories */}
        {catalogs.length > 0 && (
          <div className="flex-1 min-h-0 overflow-y-auto px-5">
            <ul>
              {catalogs.map((cat) => {
                const roots = treeByCatalog.get(cat) ?? [];
                const expanded = openCatalog === cat;
                const panelId = `menu-subs-${cat}`;
                return (
                  <li key={cat} className="border-b border-opora-brown/10 last:border-0">
                    <div className="flex items-stretch">
                      <Link
                        href={catalogHref(cat)}
                        onClick={onClose}
                        className="flex-1 py-4 text-base uppercase tracking-wide font-medium hover:opacity-60 active:opacity-50 transition-opacity"
                      >
                        {cat}
                      </Link>
                      {roots.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setOpenCatalog(expanded ? null : cat)}
                          aria-expanded={expanded}
                          aria-controls={panelId}
                          aria-label={`Підкатегорії: ${cat}`}
                          className="pl-4 pr-1 -mr-1 text-opora-brown/40 hover:text-opora-brown transition-colors"
                        >
                          <ChevronRight
                            className={`w-4 h-4 transition-transform duration-200 motion-reduce:transition-none ${expanded ? "rotate-90" : ""}`}
                          />
                        </button>
                      )}
                    </div>
                    {roots.length > 0 && (
                      <div
                        id={panelId}
                        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:duration-0 ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                      >
                        <div className="overflow-hidden">
                          <ul className="pb-4 text-opora-brown/70">
                            {roots.map((root) => (
                              <AccordionNode key={root.id} node={root} catalog={cat} onClose={onClose} />
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Contacts + address — pinned at the bottom */}
        <div className="shrink-0 px-5 pt-5 border-t border-opora-brown/10">
          <ul className="space-y-3 text-sm">
            <li>
              <a
                href={`tel:+${STORE.phoneRaw}`}
                className="flex items-center gap-3 font-medium hover:opacity-60 transition-opacity"
              >
                <Phone className="w-4 h-4 text-opora-brown/40 shrink-0" strokeWidth={1.5} />
                {STORE.phoneDisplay}
              </a>
            </li>
            <li>
              <a
                href={`mailto:${STORE.email}`}
                className="flex items-center gap-3 text-opora-brown/70 hover:text-opora-brown transition-colors"
              >
                <Mail className="w-4 h-4 text-opora-brown/40 shrink-0" strokeWidth={1.5} />
                {STORE.email}
              </a>
            </li>
            <li className="flex items-center gap-3 text-opora-brown/70">
              <MapPin className="w-4 h-4 text-opora-brown/40 shrink-0" strokeWidth={1.5} />
              {STORE.addressLine}, {STORE.city}
            </li>
            <li className="flex items-center gap-3 text-opora-brown/70">
              <Clock className="w-4 h-4 text-opora-brown/40 shrink-0" strokeWidth={1.5} />
              {STORE.hours}
            </li>
          </ul>
          <p className="mt-5 pb-1 text-xs text-opora-brown/40">© 2026 OPORA. Всі права захищені.</p>
        </div>
      </div>
    </Drawer>
  );
}
