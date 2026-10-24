"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Input, Textarea } from "../../ui";
import { deleteComment, saveComment } from "../../actions";

type C = {
  id: string;
  author_name: string | null;
  rating: number | null;
  text: string | null;
  product_ref: string | null;
  created_at: string | null;
};

export default function CommentsManager({ comments, products }: { comments: C[]; products: string[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const empty = { author_name: "", rating: 5, text: "", product_ref: "" };
  const [draft, setDraft] = useState<typeof empty>(empty);

  function add() {
    start(async () => {
      await saveComment(draft);
      setDraft(empty);
      router.refresh();
    });
  }
  function remove(id: string) {
    if (!confirm("Видалити коментар?")) return;
    start(async () => {
      await deleteComment(id);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="space-y-3">
        <h2 className="font-semibold">Новий коментар</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Ім'я">
            <Input value={draft.author_name} onChange={(e) => setDraft({ ...draft, author_name: e.target.value })} />
          </Field>
          <Field label="Рейтинг (1–5)">
            <Input type="number" min={1} max={5} value={draft.rating} onChange={(e) => setDraft({ ...draft, rating: Number(e.target.value) })} />
          </Field>
        </div>
        <Field label="Товар (модель)">
          <select
            value={draft.product_ref}
            onChange={(e) => setDraft({ ...draft, product_ref: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-opora-brown"
          >
            <option value="">— оберіть товар —</option>
            {products.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Текст">
          <Textarea rows={4} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
        </Field>
        <Button onClick={add} disabled={!draft.text}>
          Додати
        </Button>
      </Card>

      <div className="space-y-3">
        {comments.map((c) => (
          <Card key={c.id}>
            <div className="flex justify-between">
              <div className="text-sm font-medium">
                {c.author_name} · {c.rating}★
              </div>
              <Button variant="danger" onClick={() => remove(c.id)}>
                ×
              </Button>
            </div>
            <div className="text-xs text-gray-500">{c.product_ref}{c.created_at ? ` · ${c.created_at}` : ""}</div>
            <p className="mt-1 text-sm text-gray-700">{c.text}</p>
          </Card>
        ))}
        {comments.length === 0 && <p className="text-sm text-gray-400">Немає коментарів.</p>}
      </div>
    </div>
  );
}
