import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { stageOffers, markAvailability } from "@/lib/estella/stagingService";
import { promoteOffers } from "@/lib/estella/promoteService";

// Staging-table row shape sent from the browser parser.
type Offer = {
  offer_id: string;
  name: string;
  model: string;
  price: number | null;
  quantity: number | null;
  vendor: string | null;
  color_code: string | null;
  params: Record<string, string>;
};

// PostgREST .or() splits on commas, so strip them (plus wildcards) from user search.
const cleanSearch = (v: string) => v.replace(/[,()%]/g, "").trim();
const searchOr = (s: string) => `name.ilike.%${s}%,model.ilike.%${s}%,offer_id.ilike.%${s}%`;

// ── GET: cursor-paginated, filterable, searchable list ────────────────────────
export async function GET(request: NextRequest) {
  try {
    const db = supabaseAdmin();
    const url = request.nextUrl.searchParams;
    const filter = url.get("filter") ?? "all"; // all | available | unavailable
    const search = cleanSearch(url.get("search") ?? "");
    const cursor = url.get("cursor") ?? "";
    const limit = Math.min(Number(url.get("limit")) || 50, 200);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let list: any = db
      .from("estella_offers")
      .select("offer_id, name, model, price, quantity, color_code, available, imported, params")
      .order("offer_id", { ascending: true })
      .limit(limit + 1);
    if (filter === "available") list = list.eq("available", true);
    if (filter === "unavailable") list = list.eq("available", false);
    if (search) list = list.or(searchOr(search));
    if (cursor) list = list.gt("offer_id", cursor);

    const { data, error } = await list;
    if (error) throw error;

    const rows = (data ?? []) as { offer_id: string }[];
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1].offer_id : null;

    // Tab counts only on the first page (respect the active search).
    const counts = cursor ? undefined : await tabCounts(db, search);

    return NextResponse.json({ items, nextCursor, counts });
  } catch (error) {
    console.error("Estella list error:", error);
    return NextResponse.json({ error: (error as Error).message || "List failed" }, { status: 500 });
  }
}

async function tabCounts(db: ReturnType<typeof supabaseAdmin>, search: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const head = (): any => {
    const q = db.from("estella_offers").select("*", { count: "exact", head: true });
    return search ? q.or(searchOr(search)) : q;
  };
  const [all, available, unavailable] = await Promise.all([
    head(),
    head().eq("available", true),
    head().eq("available", false),
  ]);
  return {
    all: all.count ?? 0,
    available: available.count ?? 0,
    unavailable: unavailable.count ?? 0,
  };
}

// ── POST: stage | availability | promote ─────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const db = supabaseAdmin();
    const body = (await request.json()) as {
      action?: string;
      offers?: unknown[];
      reset?: boolean;
      scope?: string;
      ids?: string[];
    };
    const action = body.action;

    if (action === "stage") {
      const offers = (body.offers ?? []) as Offer[];
      if (body.reset) await db.from("estella_offers").delete().neq("offer_id", "");
      if (offers.length) {
        const { error } = await db.from("estella_offers").upsert(
          offers.map((o) => ({
            offer_id: o.offer_id,
            name: o.name,
            model: o.model,
            price: o.price,
            quantity: o.quantity,
            vendor: o.vendor,
            color_code: o.color_code,
            params: o.params ?? {},
          })),
          { onConflict: "offer_id" }
        );
        if (error) throw error;
      }
      return NextResponse.json({ staged: offers.length });
    }

    if (action === "availability") {
      const offers = (body.offers ?? []) as { offer_id: string; price: number | null; quantity: number | null }[];
      if (body.reset) await db.from("estella_offers").update({ available: false }).neq("offer_id", "");
      // Group by identical price+quantity so each distinct combo is one bulk update.
      const groups = new Map<string, { price: number | null; quantity: number | null; ids: string[] }>();
      for (const o of offers) {
        const k = `${o.price}|${o.quantity}`;
        if (!groups.has(k)) groups.set(k, { price: o.price, quantity: o.quantity, ids: [] });
        groups.get(k)!.ids.push(o.offer_id);
      }
      for (const g of groups.values()) {
        const { error } = await db
          .from("estella_offers")
          .update({ available: true, price: g.price, quantity: g.quantity })
          .in("offer_id", g.ids);
        if (error) throw error;
      }
      return NextResponse.json({ marked: offers.length });
    }

    if (action === "promote") {
      const result = await promoteOffers(db, body.scope as string, (body.ids ?? []) as string[]);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Estella action error:", error);
    return NextResponse.json({ error: (error as Error).message || "Action failed" }, { status: 500 });
  }
}
