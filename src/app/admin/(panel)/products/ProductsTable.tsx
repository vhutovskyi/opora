"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteProduct } from "../../actions";
import { Badge, Button, Card, Input } from "../../ui";
import { productRef } from "@/lib/utils";

type Row = {
  id: string;
  slug: string | null;
  model: string;
  catalog: string;
  min_price: number;
  manufacturer: string;
  visible: boolean;
  variantCount: number;
};

export default function ProductsTable({ products }: { products: Row[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState<Row | null>(null);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const visible = q ? products.filter((p) => p.model.toLowerCase().includes(q)) : products;

  function confirmDelete() {
    if (!confirming) return;
    const { id } = confirming;
    start(async () => {
      await deleteProduct(id);
      setConfirming(null);
      router.refresh();
    });
  }

  return (
    <Card className="overflow-x-auto p-0">
      <div className="p-3">
        <Input value={query} placeholder="Пошук за назвою…" onChange={(e) => setQuery(e.target.value)} />
      </div>
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="p-3">Модель</th>
            <th className="p-3">Каталог</th>
            <th className="p-3">Ціна</th>
            <th className="p-3">Варіацій</th>
            <th className="p-3">Статус</th>
            <th className="p-3"></th>
          </tr>
        </thead>
        <tbody>
          {visible.map((p) => (
            <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="p-3 font-medium">{p.model}</td>
              <td className="p-3 text-gray-600">{p.catalog}</td>
              <td className="p-3">{p.min_price} ₴</td>
              <td className="p-3">{p.variantCount}</td>
              <td className="p-3">{p.visible ? <Badge tone="ok">Показується</Badge> : <Badge tone="off">Прихований</Badge>}</td>
              <td className="p-3 text-right">
                <div className="flex justify-end gap-2">
                  <Link href={`/admin/products/${productRef(p)}`}>
                    <Button variant="ghost">Редагувати</Button>
                  </Link>
                  <Button variant="danger" disabled={pending} onClick={() => setConfirming(p)}>
                    Видалити
                  </Button>
                </div>
              </td>
            </tr>
          ))}
          {visible.length === 0 && (
            <tr>
              <td colSpan={6} className="p-6 text-center text-gray-400">
                {q ? "Нічого не знайдено." : "Немає товарів. Імпортуйте CSV або створіть новий."}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="max-w-sm space-y-4">
            <p className="text-sm">
              Видалити товар «<b>{confirming.model}</b>» разом з {confirming.variantCount} варіаціями?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={pending} onClick={() => setConfirming(null)}>
                Скасувати
              </Button>
              <Button variant="danger" disabled={pending} onClick={confirmDelete}>
                {pending && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                )}
                {pending ? "Видалення…" : "Видалити"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </Card>
  );
}
