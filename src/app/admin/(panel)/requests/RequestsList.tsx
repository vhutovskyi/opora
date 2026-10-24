"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "../../ui";
import { deleteRequest, updateRequestProgress } from "../../actions";

type OrderItem = { title?: string; sku?: string; quantity?: number; price?: number };
type Req = {
  id: string;
  name: string | null;
  phone_number: string | null;
  order_number: string | null;
  delivery: string | null;
  delivery_city: string | null;
  delivery_warehouse: string | null;
  orders: OrderItem[] | null;
  progress: string | null;
  created_at: string | null;
};

const STAGES = ["Новий", "Опрацьовується", "Відправлено", "Завершено", "Скасовано"];

export default function RequestsList({ requests }: { requests: Req[] }) {
  const router = useRouter();
  const [, start] = useTransition();

  return (
    <div className="space-y-3">
      {requests.map((r) => (
        <Card key={r.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-medium">
                №{r.order_number} · {r.name}
              </div>
              <div className="text-sm text-gray-600">{r.phone_number}</div>
            </div>
            <div className="flex items-center gap-2">
              <select
                defaultValue={r.progress || "Новий"}
                onChange={(e) =>
                  start(async () => {
                    await updateRequestProgress(r.id, e.target.value);
                    router.refresh();
                  })
                }
                className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
              >
                {STAGES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <Button
                variant="danger"
                onClick={() =>
                  confirm("Видалити заявку?") &&
                  start(async () => {
                    await deleteRequest(r.id);
                    router.refresh();
                  })
                }
              >
                ×
              </Button>
            </div>
          </div>
          {(r.delivery || r.delivery_city) && (
            <div className="mt-1 text-xs text-gray-500">
              🚚 {r.delivery} {r.delivery_city} {r.delivery_warehouse}
            </div>
          )}
          {r.orders && r.orders.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-sm text-gray-700">
              {r.orders.map((o, i) => (
                <li key={i}>
                  {o.title} {o.sku ? `[${o.sku}]` : ""} — {o.quantity ?? 1} × {o.price} ₴
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
      {requests.length === 0 && <p className="text-sm text-gray-400">Немає заявок.</p>}
    </div>
  );
}
