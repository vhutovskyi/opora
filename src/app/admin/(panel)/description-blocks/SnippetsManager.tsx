"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Input } from "../../ui";
import LongDescriptionBuilder from "../products/[id]/LongDescriptionBuilder";
import { deleteSnippet, saveSnippet } from "../../actions";
import type { LongDescriptionBlock, LongDescriptionSnippet } from "@/lib/longDescription/types";

// One shared block in edit mode. Uses the same builder as a product does.
function SnippetCard({ snippet, onDone }: { snippet: LongDescriptionSnippet; onDone: () => void }) {
  const [name, setName] = useState(snippet.name);
  const [blocks, setBlocks] = useState<LongDescriptionBlock[]>(snippet.blocks);
  const [saving, start] = useTransition();

  return (
    <Card className="space-y-3">
      <Field label="Назва (лише для адмінки)">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="напр. Кольори Естелла" />
      </Field>
      <LongDescriptionBuilder blocks={blocks} onChange={setBlocks} />
      <div className="flex gap-2">
        <Button
          disabled={saving || !name.trim()}
          onClick={() => start(async () => {
            await saveSnippet({ id: snippet.id || undefined, name: name.trim(), blocks });
            onDone();
          })}
        >
          {saving ? "Збереження..." : "Зберегти"}
        </Button>
        {snippet.id && (
          <Button
            variant="danger"
            disabled={saving}
            onClick={() => start(async () => {
              // Products referencing a deleted block simply stop showing it.
              if (!confirm(`Видалити «${snippet.name}»? Він зникне з усіх товарів, що його використовують.`)) return;
              await deleteSnippet(snippet.id);
              onDone();
            })}
          >
            Видалити
          </Button>
        )}
        <Button variant="ghost" disabled={saving} onClick={onDone}>
          Скасувати
        </Button>
      </div>
    </Card>
  );
}

export default function SnippetsManager({ initial }: { initial: LongDescriptionSnippet[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<LongDescriptionSnippet | null>(null);

  const done = () => {
    setEditing(null);
    router.refresh();
  };

  if (editing) return <SnippetCard snippet={editing} onDone={done} />;

  return (
    <div className="space-y-3">
      {initial.map((s) => (
        <Card key={s.id} className="flex items-center justify-between">
          <div>
            <p className="font-medium text-opora-brown">{s.name}</p>
            <p className="text-xs text-gray-500">{s.blocks.length} блок(ів)</p>
          </div>
          <Button variant="ghost" onClick={() => setEditing(s)}>
            Редагувати
          </Button>
        </Card>
      ))}
      {!initial.length && <p className="text-sm text-gray-500">Спільних блоків ще немає.</p>}
      <Button onClick={() => setEditing({ id: "", name: "", blocks: [] })}>+ Новий спільний блок</Button>
    </div>
  );
}
