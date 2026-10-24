"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Checkbox, Field, Input, ZoomImg } from "../../ui";
import { deleteBanner, saveBanner } from "../../actions";

type Banner = {
  id: string;
  name: string | null;
  type: string | null;
  image: string | null;
  sort_order: number | null;
  active: boolean | null;
  col_span: number | null;
  title: string | null;
  subtitle: string | null;
};

const TYPES = ["Слайдер", "Каталог", "Категорія"];

export default function BannersManager({ banners }: { banners: Banner[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const empty = { name: "", type: "Слайдер", image: "", sort_order: 0, active: true, col_span: 1, title: "", subtitle: "" };
  const [draft, setDraft] = useState<typeof empty & { id?: string }>(empty);
  const [uploading, setUploading] = useState(false);

  function save() {
    start(async () => {
      await saveBanner({
        id: draft.id,
        name: draft.name,
        type: draft.type,
        image: draft.image,
        sort_order: Number(draft.sort_order) || 0,
        active: draft.active,
        col_span: Number(draft.col_span) || 1,
        title: draft.title || null,
        subtitle: draft.subtitle || null,
      });
      setDraft(empty);
      router.refresh();
    });
  }
  function remove(id: string) {
    if (!confirm("Видалити банер?")) return;
    start(async () => {
      await deleteBanner(id);
      router.refresh();
    });
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/banners/media", { method: "POST", body: fd });
    const json = (await res.json()) as { url?: string };
    setUploading(false);
    if (json.url) setDraft((d) => ({ ...d, image: json.url! }));
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="space-y-3">
        <h2 className="font-semibold">{draft.id ? "Редагувати банер" : "Новий банер"}</h2>
        <Field label="Назва">
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        <Field label="Тип">
          <select
            value={draft.type}
            onChange={(e) => setDraft({ ...draft, type: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            {TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        {/* Fields specific to the banner type. Width is only needed by categories (the catalog grid). */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Порядок">
            <Input type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })} />
          </Field>
          {draft.type === "Категорія" && (
            <Field label="Ширина (1–4)">
              <Input type="number" min={1} max={4} value={draft.col_span} onChange={(e) => setDraft({ ...draft, col_span: Number(e.target.value) })} />
            </Field>
          )}
        </div>
        {draft.type === "Слайдер" && (
          <>
            <Field label="Заголовок слайду">
              <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </Field>
            <Field label="Підзаголовок слайду">
              <Input value={draft.subtitle} onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })} />
            </Field>
          </>
        )}
        <Checkbox label="Активний" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
        <Field label="Зображення">
          <input type="file" accept="image/*" onChange={(e) => upload(e.target.files?.[0])} className="text-xs" />
        </Field>
        {uploading && <span className="text-xs text-gray-500">Завантаження...</span>}
        {draft.image && <ZoomImg src={draft.image} className="h-24 rounded object-cover" />}
        <div className="flex gap-2">
          <Button onClick={save} disabled={!draft.image}>
            Зберегти
          </Button>
          {draft.id && (
            <Button variant="ghost" onClick={() => setDraft(empty)}>
              Скасувати
            </Button>
          )}
        </div>
      </Card>

      <div className="space-y-3">
        {banners.map((b) => (
          <Card key={b.id} className="flex items-center gap-3">
            {b.image && <ZoomImg src={b.image} className="h-14 w-20 shrink-0 rounded object-cover" />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{b.name || "—"}</div>
              <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                <Badge tone="neutral">{b.type}</Badge>
                {b.active ? <Badge tone="ok">активний</Badge> : <Badge tone="off">вимкнено</Badge>}
              </div>
            </div>
            <Button
              variant="ghost"
              onClick={() =>
                setDraft({
                  id: b.id,
                  name: b.name ?? "",
                  type: b.type ?? "Слайдер",
                  image: b.image ?? "",
                  sort_order: b.sort_order ?? 0,
                  active: b.active ?? true,
                  col_span: b.col_span ?? 1,
                  title: b.title ?? "",
                  subtitle: b.subtitle ?? "",
                })
              }
            >
              Ред.
            </Button>
            <Button variant="danger" onClick={() => remove(b.id)}>
              ×
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
