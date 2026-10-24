"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "../ui";

const NAV = [
  { href: "/admin", label: "Огляд" },
  { href: "/admin/products", label: "Товари" },
  { href: "/admin/marketing", label: "Банери та Фільтри" },
  { href: "/admin/comments", label: "Коментарі" },
  { href: "/admin/requests", label: "Заявки" },
  { href: "/admin/catalogs", label: "Каталоги" },
  { href: "/admin/description-blocks", label: "Спільні блоки" },
  { href: "/admin/posts", label: "Статті" },
  { href: "/admin/dev", label: "Розробка", divider: true },
];

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Close the drawer on navigation so a route change doesn't leave it open.
  useEffect(() => setOpen(false), [pathname]);

  async function logout() {
    await supabaseBrowser().auth.signOut();
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 text-gray-900 md:flex-row">
      {/* Mobile header with a hamburger */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white p-4 md:hidden">
        <div className="text-lg font-semibold text-opora-brown">OPORA Admin</div>
        <Button variant="ghost" onClick={() => setOpen(true)} aria-label="Меню">
          ☰
        </Button>
      </div>

      {/* Dimming behind the slide-out menu (mobile only) */}
      {open && <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setOpen(false)} />}

      <aside
        // On desktop — a sticky full-height column: the tab list scrolls inside,
        // while "На сайт"/"Вийти" stay in view. md:bottom-auto cancels the bottom:0 from inset-y-0.
        className={`fixed inset-y-0 left-0 z-40 w-64 flex-col border-r border-gray-200 bg-white p-4 md:sticky md:bottom-auto md:z-auto md:flex md:h-screen md:w-56 ${
          open ? "flex" : "hidden"
        }`}
      >
        <div className="mb-6 text-lg font-semibold text-opora-brown">OPORA Admin</div>
        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {NAV.map((item) => {
            const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2 text-sm ${item.divider ? "mt-3 border-t border-gray-100 pt-4" : ""} ${
                  active ? "bg-opora-brown text-white" : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Link href="/" className="mt-4 shrink-0">
          <Button variant="ghost" className="w-full">
            На сайт
          </Button>
        </Link>
        <Button variant="ghost" onClick={logout} className="mt-2 shrink-0">
          Вийти
        </Button>
      </aside>
      <main className="flex-1 overflow-x-hidden p-4 md:p-6">{children}</main>
    </div>
  );
}
