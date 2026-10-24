"use client";

import { useRef, useState } from "react";
import { Button, Checkbox, Field, Input, Textarea } from "../../../ui";
import LongDescriptionRenderer from "@/components/longDescription/LongDescriptionRenderer";
import { resolveSnippets, type LongDescriptionBlock, type LongDescriptionSnippet } from "@/lib/longDescription/types";

// Long description builder: the admin composes the page out of ready-made blocks.
// The preview is drawn by the same LongDescriptionRenderer as the product page uses.
// Used both for products and for shared blocks (/admin/description-blocks).

type BlockType = LongDescriptionBlock["type"];

const BLOCK_LABELS: Record<BlockType, string> = {
  heading: "Заголовок",
  paragraph: "Текст",
  callout: "Виділений блок",
  table: "Таблиця",
  imageText: "Зображення + текст",
  colorSwatches: "Кольори (зразки)",
  gallery: "Галерея фото",
  columns: "Колонки",
  snippet: "Спільний блок",
};

// Columns and shared blocks don't nest into one another — we don't offer them inside a column.
const NESTED_TYPES = (Object.keys(BLOCK_LABELS) as BlockType[]).filter(
  (t) => t !== "columns" && t !== "snippet"
);

const MD_HINT = "Можна **жирний** і [посилання](https://...)";

function blankBlock(type: BlockType): LongDescriptionBlock {
  switch (type) {
    case "heading":
      return { type, text: "" };
    case "paragraph":
      return { type, text: "" };
    case "callout":
      return { type, heading: "", text: "", tone: "neutral" };
    case "table":
      return { type, title: "", rows: [["", ""]] };
    case "imageText":
      return { type, images: [], text: "", layout: "left" };
    case "colorSwatches":
      return { type, title: "", intro: "", swatches: [] };
    case "gallery":
      return { type, title: "", items: [], cols: 3, captionPosition: "below" };
    case "columns":
      return { type, columns: [[], []] };
    case "snippet":
      return { type, snippetId: "" };
  }
}

// Uploading one image to R2 through the existing content-image route.
function ImageUpload({ url, onChange }: { url: string; onChange: (url: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/products/media/content-image", { method: "POST", body });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error || "Помилка завантаження");
      onChange(json.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка завантаження");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shrink-0 space-y-1">
      <div className="flex items-center gap-2">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-14 w-14 rounded border border-gray-200 object-cover" />
        ) : (
          <div className="h-14 w-14 rounded border border-dashed border-gray-300" />
        )}
        <label className="cursor-pointer rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
          {busy ? "Завантаження..." : url ? "Замінити" : "Завантажити"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function TableEditor({
  block,
  onChange,
}: {
  block: Extract<LongDescriptionBlock, { type: "table" }>;
  onChange: (b: LongDescriptionBlock) => void;
}) {
  const cols = Math.max(block.headerRow?.length ?? 0, ...block.rows.map((r) => r.length), 1);
  const hasHeader = !!block.headerRow;

  const addColumn = () =>
    onChange({
      ...block,
      headerRow: block.headerRow ? [...block.headerRow, ""] : undefined,
      rows: block.rows.map((r) => [...r, ""]),
    });

  return (
    <div className="space-y-2">
      <Field label="Назва таблиці">
        <Input value={block.title ?? ""} onChange={(e) => onChange({ ...block, title: e.target.value })} />
      </Field>
      <Checkbox
        label="Перший рядок — заголовки"
        checked={hasHeader}
        onChange={(e) =>
          onChange({ ...block, headerRow: e.target.checked ? Array.from({ length: cols }, () => "") : undefined })
        }
      />
      <div className="space-y-1 overflow-x-auto">
        <div className="flex gap-1">
          {Array.from({ length: cols }, (_, c) => (
            <button
              key={c}
              type="button"
              onClick={() =>
                onChange({
                  ...block,
                  headerRow: block.headerRow?.filter((_, i) => i !== c),
                  rows: block.rows.map((r) => r.filter((_, i) => i !== c)),
                })
              }
              className="w-40 rounded border border-gray-200 text-xs text-gray-400 hover:bg-red-50 hover:text-red-600"
              title="Видалити колонку"
            >
              × колонка {c + 1}
            </button>
          ))}
        </div>
        {hasHeader && (
          <div className="flex gap-1">
            {Array.from({ length: cols }, (_, c) => (
              <input
                key={c}
                value={block.headerRow?.[c] ?? ""}
                placeholder={`Заголовок ${c + 1}`}
                onChange={(e) =>
                  onChange({
                    ...block,
                    headerRow: Array.from({ length: cols }, (_, i) =>
                      i === c ? e.target.value : (block.headerRow?.[i] ?? "")
                    ),
                  })
                }
                className="w-40 rounded border border-gray-300 bg-gray-50 px-2 py-1 text-sm font-medium"
              />
            ))}
          </div>
        )}
        {block.rows.map((row, r) => (
          <div key={r} className="flex items-center gap-1">
            {Array.from({ length: cols }, (_, c) => (
              <input
                key={c}
                value={row[c] ?? ""}
                onChange={(e) =>
                  onChange({
                    ...block,
                    rows: block.rows.map((rr, i) =>
                      i === r ? Array.from({ length: cols }, (_, j) => (j === c ? e.target.value : (rr[j] ?? ""))) : rr
                    ),
                  })
                }
                className="w-40 rounded border border-gray-300 px-2 py-1 text-sm"
              />
            ))}
            <Button
              variant="ghost"
              onClick={() => onChange({ ...block, rows: block.rows.filter((_, i) => i !== r) })}
              aria-label="Видалити рядок"
            >
              ×
            </Button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button
          variant="ghost"
          onClick={() => onChange({ ...block, rows: [...block.rows, Array.from({ length: cols }, () => "")] })}
        >
          + Рядок
        </Button>
        <Button variant="ghost" onClick={addColumn}>
          + Колонка
        </Button>
      </div>
      <p className="text-xs text-gray-500">{MD_HINT} — напр. ~~14 690~~ **11 017 грн**</p>
      <p className="text-xs text-gray-500">
        Об&apos;єднати клітинки: <code>&lt;</code> — злити з клітинкою ліворуч, <code>^</code> — з клітинкою зверху.
      </p>
    </div>
  );
}

function BlockFields({
  block,
  onChange,
  snippets,
}: {
  block: LongDescriptionBlock;
  onChange: (b: LongDescriptionBlock) => void;
  snippets: LongDescriptionSnippet[];
}) {
  switch (block.type) {
    case "heading":
      return (
        <Field label="Текст заголовка">
          <Input value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} />
        </Field>
      );

    case "paragraph":
      return (
        <Field label={`Текст — ${MD_HINT}`}>
          <Textarea rows={5} value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} />
        </Field>
      );

    case "callout":
      return (
        <>
          <Field label="Заголовок (необов'язково)">
            <Input value={block.heading ?? ""} onChange={(e) => onChange({ ...block, heading: e.target.value })} />
          </Field>
          <Field label="Колір">
            <select
              value={block.tone ?? "neutral"}
              onChange={(e) => onChange({ ...block, tone: e.target.value as "neutral" | "green" })}
              className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="neutral">Бежевий</option>
              <option value="green">Зелений</option>
            </select>
          </Field>
          <Field label={`Текст — ${MD_HINT}`}>
            <Textarea rows={5} value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} />
          </Field>
        </>
      );

    case "table":
      return <TableEditor block={block} onChange={onChange} />;

    case "imageText":
      return (
        <>
          <Field label="Розташування">
            <select
              value={block.layout}
              onChange={(e) => onChange({ ...block, layout: e.target.value as typeof block.layout })}
              className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="left">Фото ліворуч</option>
              <option value="right">Фото праворуч</option>
              <option value="stacked">Фото над текстом</option>
            </select>
          </Field>
          <Field label={`Текст — ${MD_HINT}`}>
            <Textarea rows={4} value={block.text ?? ""} onChange={(e) => onChange({ ...block, text: e.target.value })} />
          </Field>
          <div className="space-y-2">
            <span className="text-xs font-medium text-gray-600">Зображення</span>
            {block.images.map((img, i) => (
              <div key={i} className="flex flex-wrap items-start gap-2 rounded-lg border border-gray-100 p-2">
                <ImageUpload
                  url={img.url}
                  onChange={(url) =>
                    onChange({ ...block, images: block.images.map((x, j) => (j === i ? { ...x, url } : x)) })
                  }
                />
                <Input
                  placeholder="Підпис"
                  className="min-w-0 flex-1"
                  value={img.caption ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...block,
                      images: block.images.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)),
                    })
                  }
                />
                <Input
                  type="number"
                  min={5}
                  max={100}
                  placeholder="%"
                  title="Ширина фото у % (порожньо = на всю ширину)"
                  className="w-16 shrink-0"
                  value={img.width ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...block,
                      images: block.images.map((x, j) =>
                        j === i ? { ...x, width: e.target.value ? Number(e.target.value) : undefined } : x
                      ),
                    })
                  }
                />
                <Button
                  variant="ghost"
                  onClick={() => onChange({ ...block, images: block.images.filter((_, j) => j !== i) })}
                  aria-label="Видалити зображення"
                >
                  ×
                </Button>
              </div>
            ))}
            <Button variant="ghost" onClick={() => onChange({ ...block, images: [...block.images, { url: "" }] })}>
              + Зображення
            </Button>
          </div>
        </>
      );

    case "colorSwatches":
      return (
        <>
          <Field label="Назва">
            <Input value={block.title ?? ""} onChange={(e) => onChange({ ...block, title: e.target.value })} />
          </Field>
          <Field label={`Опис (необов'язково) — ${MD_HINT}`}>
            <Textarea rows={3} value={block.intro ?? ""} onChange={(e) => onChange({ ...block, intro: e.target.value })} />
          </Field>
          <div className="space-y-2">
            <span className="text-xs font-medium text-gray-600">Зразки</span>
            {block.swatches.map((s, i) => (
              <div key={i} className="flex flex-wrap items-start gap-2 rounded-lg border border-gray-100 p-2">
                <ImageUpload
                  url={s.imageUrl}
                  onChange={(imageUrl) =>
                    onChange({ ...block, swatches: block.swatches.map((x, j) => (j === i ? { ...x, imageUrl } : x)) })
                  }
                />
                <Input
                  placeholder="Код"
                  className="w-24 shrink-0"
                  value={s.code ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...block,
                      swatches: block.swatches.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)),
                    })
                  }
                />
                <Input
                  placeholder="Назва"
                  className="min-w-0 flex-1"
                  value={s.name}
                  onChange={(e) =>
                    onChange({
                      ...block,
                      swatches: block.swatches.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                    })
                  }
                />
                <Button
                  variant="ghost"
                  onClick={() => onChange({ ...block, swatches: block.swatches.filter((_, j) => j !== i) })}
                  aria-label="Видалити зразок"
                >
                  ×
                </Button>
              </div>
            ))}
            <Button
              variant="ghost"
              onClick={() => onChange({ ...block, swatches: [...block.swatches, { name: "", imageUrl: "" }] })}
            >
              + Зразок
            </Button>
          </div>
        </>
      );

    case "gallery":
      return (
        <>
          <Field label="Назва">
            <Input value={block.title ?? ""} onChange={(e) => onChange({ ...block, title: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Фото в ряд">
              <select
                value={block.cols ?? 3}
                onChange={(e) => onChange({ ...block, cols: Number(e.target.value) as 2 | 3 | 4 })}
                className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm"
              >
                {[2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Підпис">
              <select
                value={block.captionPosition ?? "below"}
                onChange={(e) =>
                  onChange({ ...block, captionPosition: e.target.value as "below" | "above" | "overlay" })
                }
                className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm"
              >
                <option value="below">Під фото</option>
                <option value="above">Над фото</option>
                <option value="overlay">Поверх фото</option>
              </select>
            </Field>
          </div>
          <div className="space-y-2">
            <span className="text-xs font-medium text-gray-600">Фото</span>
            {block.items.map((item, i) => (
              <div key={i} className="flex flex-wrap items-start gap-2 rounded-lg border border-gray-100 p-2">
                <ImageUpload
                  url={item.imageUrl}
                  onChange={(imageUrl) =>
                    onChange({ ...block, items: block.items.map((x, j) => (j === i ? { ...x, imageUrl } : x)) })
                  }
                />
                <Input
                  placeholder="Підпис"
                  className="min-w-0 flex-1"
                  value={item.caption ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...block,
                      items: block.items.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)),
                    })
                  }
                />
                <Button
                  variant="ghost"
                  onClick={() => onChange({ ...block, items: block.items.filter((_, j) => j !== i) })}
                  aria-label="Видалити фото"
                >
                  ×
                </Button>
              </div>
            ))}
            <Button variant="ghost" onClick={() => onChange({ ...block, items: [...block.items, { imageUrl: "" }] })}>
              + Фото
            </Button>
          </div>
        </>
      );

    case "columns":
      return (
        <div className="space-y-3">
          {/* Columns are edited side by side only when the builder panel is wide — hence a
              container query (@container on the panel) rather than a window breakpoint. */}
          <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2">
            {block.columns.map((col, i) => (
              <div key={i} className="rounded-lg bg-gray-50 p-2">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-600">Колонка {i + 1}</span>
                  <Button
                    variant="ghost"
                    onClick={() => onChange({ ...block, columns: block.columns.filter((_, j) => j !== i) })}
                    aria-label="Видалити колонку"
                  >
                    ×
                  </Button>
                </div>
                <BlockList
                  blocks={col}
                  onChange={(next) =>
                    onChange({ ...block, columns: block.columns.map((c, j) => (j === i ? next : c)) })
                  }
                  snippets={snippets}
                  nested
                />
              </div>
            ))}
          </div>
          <Button variant="ghost" onClick={() => onChange({ ...block, columns: [...block.columns, []] })}>
            + Колонка
          </Button>
        </div>
      );

    case "snippet":
      return (
        <Field label="Який спільний блок підставити">
          <select
            value={block.snippetId}
            onChange={(e) => onChange({ ...block, snippetId: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm"
          >
            <option value="">— оберіть блок —</option>
            {snippets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      );
  }
}

function BlockList({
  blocks,
  onChange,
  snippets,
  nested = false,
}: {
  blocks: LongDescriptionBlock[];
  onChange: (blocks: LongDescriptionBlock[]) => void;
  snippets: LongDescriptionSnippet[];
  nested?: boolean;
}) {
  const types = nested ? NESTED_TYPES : (Object.keys(BLOCK_LABELS) as BlockType[]);
  const [adding, setAdding] = useState<BlockType>("paragraph");

  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => (
        <div key={i} className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-opora-brown">
              {i + 1}. {BLOCK_LABELS[block.type]}
            </span>
            <div className="flex gap-1">
              <Button variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Вище">
                ↑
              </Button>
              <Button variant="ghost" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} aria-label="Нижче">
                ↓
              </Button>
              <Button
                variant="danger"
                onClick={() => onChange(blocks.filter((_, j) => j !== i))}
                aria-label="Видалити блок"
              >
                ×
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <BlockFields
              block={block}
              snippets={snippets}
              onChange={(b) => onChange(blocks.map((x, j) => (j === i ? b : x)))}
            />
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={adding}
          onChange={(e) => setAdding(e.target.value as BlockType)}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-2 text-sm"
        >
          {types.map((t) => (
            <option key={t} value={t}>
              {BLOCK_LABELS[t]}
            </option>
          ))}
        </select>
        <Button variant="ghost" onClick={() => onChange([...blocks, blankBlock(adding)])}>
          + Додати блок
        </Button>
      </div>
    </div>
  );
}

// The builder occupies a narrow column (30%), so all of its fields are shrunk with one
// class — without touching every component of the ui kit.
const COMPACT =
  "[&_input]:px-2 [&_input]:py-1 [&_input]:text-xs [&_textarea]:px-2 [&_textarea]:py-1 [&_textarea]:text-xs " +
  "[&_select]:py-1 [&_select]:text-xs [&_button]:px-2 [&_button]:py-1 [&_button]:text-xs [&_label]:text-xs";

export default function LongDescriptionBuilder({
  blocks,
  onChange,
  snippets = [],
  footer,
}: {
  blocks: LongDescriptionBlock[];
  onChange: (blocks: LongDescriptionBlock[]) => void;
  snippets?: LongDescriptionSnippet[];
  // Buttons (e.g. "Зберегти") that have to be at hand inside the modal.
  footer?: React.ReactNode;
}) {
  // On desktop — one modal with two panels (30% builder / 70% result),
  // on mobile two separate ones: a "Конструктор" button and a "Результат" button.
  const [pane, setPane] = useState<"both" | "constructor" | "preview" | null>(null);
  // The builder width can be dragged with a splitter. ponytail: window listeners for the
  // duration of the drag, no library and no ResizeObserver.
  const [leftPct, setLeftPct] = useState(30);
  const rowRef = useRef<HTMLDivElement>(null);

  const startDrag = () => {
    const move = (e: MouseEvent) => {
      const box = rowRef.current?.getBoundingClientRect();
      if (!box) return;
      setLeftPct(Math.min(80, Math.max(15, ((e.clientX - box.left) / box.width) * 100)));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.userSelect = "";
    };
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // The preview shows the content of shared blocks exactly as the customer will see it.
  const resolved = resolveSnippets(blocks, new Map(snippets.map((s) => [s.id, s.blocks])));

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button className="hidden sm:inline-flex" onClick={() => setPane("both")}>
          Відкрити конструктор
        </Button>
        <Button className="sm:hidden" onClick={() => setPane("preview")}>
          Результат
        </Button>
        <Button variant="ghost" className="sm:hidden" onClick={() => setPane("constructor")}>
          Конструктор
        </Button>
        <span className="text-xs text-gray-500">{blocks.length} блок(ів)</span>
      </div>

      {pane && (
        <div className="fixed inset-0 z-50 flex bg-black/40 p-2 sm:p-6">
          <div className="flex min-h-0 w-full flex-col overflow-hidden rounded-xl bg-gray-50 shadow-xl">
            <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-2">
              <span className="text-sm font-semibold text-opora-brown">
                {pane === "preview" ? "Результат" : "Детальний опис"}
              </span>
              <div className="flex gap-2">
                {footer}
                <Button variant="ghost" onClick={() => setPane(null)}>
                  Закрити
                </Button>
              </div>
            </div>
            <div ref={rowRef} className="flex min-h-0 flex-1">
              {pane !== "preview" && (
                <div
                  className={`@container min-w-0 overflow-y-auto p-3 ${pane === "both" ? "shrink-0" : "flex-1"} ${COMPACT}`}
                  style={pane === "both" ? { width: `${leftPct}%` } : undefined}
                >
                  <BlockList blocks={blocks} onChange={onChange} snippets={snippets} />
                </div>
              )}
              {pane === "both" && (
                <div
                  onMouseDown={startDrag}
                  className="w-1.5 shrink-0 cursor-col-resize bg-gray-200 transition hover:bg-opora-brown"
                  title="Потягніть, щоб змінити ширину"
                />
              )}
              {pane !== "constructor" && (
                <div className="min-w-0 flex-1 overflow-y-auto bg-white">
                  {blocks.length ? (
                    <LongDescriptionRenderer blocks={resolved} />
                  ) : (
                    <p className="p-6 text-sm text-gray-500">Блоків ще немає.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
