"use client";

import { usePathname } from "next/navigation";
import Header from "./Header";
import Footer from "./Footer";
import FloatingMessenger from "./FloatingMessenger";
import type { SubcategoryOptionRow } from "@/lib/supabase/subcategoryTree";

// Storefront header/footer/messenger — hidden on /admin (the panel has its own chrome).
export default function StorefrontChrome({
  children,
  catalogs = [],
  subcategoryOptions = [],
}: {
  children: React.ReactNode;
  catalogs?: string[];
  subcategoryOptions?: SubcategoryOptionRow[];
}) {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return <>{children}</>;
  return (
    <>
      <Header catalogs={catalogs} subcategoryOptions={subcategoryOptions} />
      {children}
      <Footer />
      <FloatingMessenger />
    </>
  );
}
