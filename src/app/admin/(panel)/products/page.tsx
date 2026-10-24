import Link from "next/link";
import { listProducts } from "../../actions";
import { Button } from "../../ui";
import ProductsTable from "./ProductsTable";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const products = await listProducts();
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-opora-brown">Товари ({products.length})</h1>
        <Link href="/admin/products/new">
          <Button>+ Новий товар</Button>
        </Link>
      </div>
      <ProductsTable products={products} />
    </div>
  );
}
