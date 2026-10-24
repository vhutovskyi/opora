import {
  listBanners,
  listCatalogs,
  listOptionFilters,
  listOptionGroupInfo,
  listOptions,
  listProducts,
  listSpecs,
  listTopProducts,
} from "../../actions";
import { Tabs } from "../../ui";
import BannersManager from "../banners/BannersManager";
import FiltersManager from "../filters/FiltersManager";

export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  const [banners, optionFilters, options, optionGroupInfo, specs, products, top, catalogs] = await Promise.all([
    listBanners(),
    listOptionFilters(),
    listOptions(),
    listOptionGroupInfo(),
    listSpecs(),
    listProducts(),
    listTopProducts(),
    listCatalogs(),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-opora-brown">Банери та Фільтри</h1>
      <Tabs
        tabs={[
          { key: "banners", label: "Банери", content: <BannersManager banners={banners as never[]} /> },
          {
            key: "filters",
            label: "Фільтри та Топ",
            content: (
              <FiltersManager
                optionFilters={optionFilters}
                options={options}
                optionGroupInfo={optionGroupInfo}
                specs={specs}
                products={products.map((p) => ({ id: p.id, model: p.model }))}
                topIds={top.map((t) => t.product_id)}
                catalogs={catalogs.map((c) => c.name)}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
