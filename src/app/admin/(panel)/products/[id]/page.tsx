import { notFound } from "next/navigation";
import { getProductFull, listCatalogs, listOptionsByCatalog, listProducts, listSnippets, listSpecs, listSubcategoryOptions } from "../../../actions";
import ProductEditor from "./ProductEditor";

export const dynamic = "force-dynamic";

export default async function ProductEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isNew = id === "new";

  // Options are scoped to the product's catalog, so the product must resolve first.
  const product = isNew ? null : await getProductFull(id);
  if (!isNew && !product) notFound();

  const [options, specs, subcategoryOptions, allProducts, catalogs, snippets] = await Promise.all([
    listOptionsByCatalog((product?.catalog as string) ?? ""),
    listSpecs(),
    listSubcategoryOptions(),
    listProducts(),
    listCatalogs(),
    listSnippets(),
  ]);

  return (
    <ProductEditor
      product={product}
      options={options}
      specs={specs}
      subcategoryOptions={subcategoryOptions}
      allProducts={allProducts}
      catalogs={catalogs}
      snippets={snippets}
    />
  );
}
