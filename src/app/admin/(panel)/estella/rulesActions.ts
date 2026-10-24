"use server";

import { supabaseAdmin } from "@/lib/supabase";
import type { CatalogRule, EstellaCatalog } from "@/lib/estella/catalogRules";

const db = () => supabaseAdmin();

export async function listCatalogRules(): Promise<CatalogRule[]> {
  const { data, error } = await db().from("estella_catalog_rules").select("*").order("catalog");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    catalog: r.catalog as EstellaCatalog,
    nameMatch: (r.name_match as string | null) ?? null,
    optionRules: r.option_rules as CatalogRule["optionRules"],
    splitRule: r.split_rule as CatalogRule["splitRule"],
  }));
}

export async function getCatalogRule(catalog: string): Promise<CatalogRule | null> {
  const { data, error } = await db().from("estella_catalog_rules").select("*").eq("catalog", catalog).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id as string,
    catalog: data.catalog as EstellaCatalog,
    nameMatch: (data.name_match as string | null) ?? null,
    optionRules: data.option_rules as CatalogRule["optionRules"],
    splitRule: data.split_rule as CatalogRule["splitRule"],
  };
}

export async function saveCatalogRule(rule: Omit<CatalogRule, "id"> & { id?: string }): Promise<CatalogRule> {
  const { data, error } = await db()
    .from("estella_catalog_rules")
    .upsert(
      {
        // Omit id for new catalogs so the DB mints the uuid; conflict resolves on `catalog` anyway.
        ...(rule.id ? { id: rule.id } : {}),
        catalog: rule.catalog,
        name_match: rule.nameMatch ?? null,
        option_rules: rule.optionRules,
        split_rule: rule.splitRule,
      },
      { onConflict: "catalog" }
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return {
    id: data.id as string,
    catalog: data.catalog as EstellaCatalog,
    nameMatch: (data.name_match as string | null) ?? null,
    optionRules: data.option_rules as CatalogRule["optionRules"],
    splitRule: data.split_rule as CatalogRule["splitRule"],
  };
}
