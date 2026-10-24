import { listCatalogs, listSubcategoryOptions } from "../../actions";
import CatalogsManager from "./CatalogsManager";

export const dynamic = "force-dynamic";

export default async function SubcategoriesPage() {
  const [catalogs, options] = await Promise.all([listCatalogs(), listSubcategoryOptions()]);
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-opora-brown">Каталоги та підкатегорії</h1>
      <CatalogsManager initialCatalogs={catalogs} initialOptions={options} />
    </div>
  );
}
