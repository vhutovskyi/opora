import { listProducts } from "../../actions";
import { Tabs } from "../../ui";
import ImportPanel from "../import/ImportPanel";
import TablesPanel from "../tables/TablesPanel";
import MattressesPanel from "../mattresses/MattressesPanel";
import EstellaClient from "../estella/EstellaClient";
import ImageDedupClient from "../image-dedup/ImageDedupClient";
import OptionSortOrderClient from "./OptionSortOrderClient";

export const dynamic = "force-dynamic";

export default async function DevPage() {
  const products = await listProducts();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-opora-brown">Розробка</h1>
      <Tabs
        tabs={[
          { key: "import", label: "Імпорт CSV", content: <ImportPanel /> },
          { key: "tables", label: "Столи Romax", content: <TablesPanel /> },
          { key: "mattresses", label: "Матраци", content: <MattressesPanel /> },
          {
            key: "estella",
            label: "Estella",
            content: (
              <div>
                <h2 className="mb-2 text-lg font-semibold text-opora-brown">Estella</h2>
                <p className="mb-4 text-sm text-gray-500">
                  Завантажте <b>estella_all.xml</b> (усі товари) та <b>estella_DATE.xml</b> (наявні). Файли обробляються у
                  браузері й зберігаються у проміжну таблицю. Потім додайте потрібні товари в базу.
                </p>
                <EstellaClient />
              </div>
            ),
          },
          {
            key: "dedup",
            label: "Дублікати фото",
            content: (
              <div>
                <h2 className="mb-2 text-lg font-semibold text-opora-brown">Дублікати фото</h2>
                <p className="mb-4 max-w-3xl text-sm text-gray-500">
                  Варіації, що відрізняються лише <b>Розміром</b> чи <b>Відстанню між ламелями</b>, мають виглядати
                  однаково — тільки <b>Матеріал</b> і <b>Колір</b> впливають на фото. Цей інструмент об&apos;єднує
                  однакові фото в один запис, прив&apos;язує його до всіх варіацій групи та видаляє зайві копії з R2.
                  Безпечно запускати повторно.
                </p>
                <ImageDedupClient products={products.map((p) => ({ id: p.id, model: p.model }))} />
              </div>
            ),
          },
          {
            key: "option-sort",
            label: "Порядок фільтрів",
            content: (
              <div>
                <h2 className="mb-2 text-lg font-semibold text-opora-brown">Порядок опцій у фільтрах</h2>
                <p className="mb-4 text-sm text-gray-500">
                  Відредагуйте порядок відображення варіантів у фільтрах (Розмір, Матеріал, тощо) або введіть номер позиції безпосередньо.
                </p>
                <OptionSortOrderClient />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
