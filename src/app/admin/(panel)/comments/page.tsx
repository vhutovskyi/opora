import { listComments, listProducts } from "../../actions";
import CommentsManager from "./CommentsManager";

export const dynamic = "force-dynamic";

export default async function CommentsPage() {
  const [comments, products] = await Promise.all([listComments(), listProducts()]);
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-opora-brown">Коментарі</h1>
      <CommentsManager comments={comments as never[]} products={products.map((p) => p.model)} />
    </div>
  );
}
