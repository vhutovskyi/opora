import type { Metadata } from "next";
import { getCompareVariants } from "@/lib/supabase";
import { parseCompareIds } from "@/lib/compare";
import CompareClient from "./CompareClient";

// The list is in the URL (?ids=<variant ids>), so the same page works for its owner and for anyone
// the link was sent to. Every list is a different URL — not something to index.
export const metadata: Metadata = {
  title: "Порівняння товарів",
  robots: { index: false, follow: true },
};

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { ids } = await searchParams;
  const requestedIds = parseCompareIds(typeof ids === "string" ? ids : undefined);
  const variants = await getCompareVariants(requestedIds);

  return <CompareClient requestedIds={requestedIds} variants={variants} />;
}
