import { memo, useState } from "react";
import { Badge, ZoomImg } from "../../ui";
import { estellaColorParts } from "@/lib/estella/colors";
import type { OfferPhoto } from "./folderImportActions";
import type { Row } from "./estellaTypes";

// One staged-offer table row. memo'd so search-typing / checkbox toggles on the
// 500-row list only re-render the rows that actually changed.
const OfferRow = memo(function OfferRow({
  r,
  checked,
  onToggle,
  onUploadPhotos,
  onDeletePhoto,
  photos,
  busy,
}: {
  r: Row;
  checked: boolean;
  onToggle: (id: string) => void;
  onUploadPhotos: (offerId: string, imported: boolean, files: File[]) => void;
  onDeletePhoto: (offerId: string, imageId: string) => void;
  photos: OfferPhoto[];
  busy: boolean;
}) {
  const parts = r.color_code ? estellaColorParts(r.color_code) : [];
  const [showPhotos, setShowPhotos] = useState(false);
  return (
    <tr className="border-b border-gray-100">
      <td className="p-3">
        <input type="checkbox" className="h-4 w-4 accent-opora-brown" checked={checked} onChange={() => onToggle(r.offer_id)} />
      </td>
      <td className="p-3">{r.name}</td>
      <td className="p-3 text-gray-600">
        <span className="inline-flex items-center gap-1.5">
          {r.model}
          <ParamsDots params={r.params} />
        </span>
      </td>
      <td className="p-3 font-mono text-xs text-gray-500">{r.offer_id}</td>
      <td className="p-3">{r.price ?? "—"}</td>
      <td className="p-3">{r.quantity ?? "—"}</td>
      <td className="p-3">
        {parts.length ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-4 w-4 overflow-hidden rounded-full border border-gray-300">
              {parts.map((c, i) => (
                <span key={i} className="h-full flex-1" style={{ background: c.hex }} />
              ))}
            </span>
            {parts.map((c) => c.name).join(" / ")}
          </span>
        ) : (
          <span className="text-gray-400">{r.color_code ?? "—"}</span>
        )}
      </td>
      <td className="p-3">
        <span className="inline-flex gap-1">
          <Badge tone={r.available ? "ok" : "off"}>{r.available ? "Наявний" : "Немає"}</Badge>
          {r.imported && <Badge tone="neutral">Додано</Badge>}
        </span>
      </td>
      <td className="p-3">
        <div className="flex flex-col gap-1.5">
          {photos.length > 0 && (
            <button
              type="button"
              onClick={() => setShowPhotos((v) => !v)}
              className="self-start text-xs text-gray-500 underline hover:text-gray-800"
            >
              {showPhotos ? "Сховати фото" : `Фото (${photos.length})`}
            </button>
          )}
          {showPhotos && photos.length > 0 && (
            <span className="flex flex-wrap gap-1">
              {photos.map((p) => (
                <span key={p.imageId} className="relative">
                  <ZoomImg src={p.url} className="h-10 w-10 rounded object-cover" />
                  <button
                    type="button"
                    onClick={() => onDeletePhoto(r.offer_id, p.imageId)}
                    className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-red-600 text-[10px] leading-none text-white"
                    aria-label="Видалити фото"
                  >
                    ×
                  </button>
                </span>
              ))}
            </span>
          )}
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={busy}
            onChange={(e) => {
              // Snapshot to an array BEFORE resetting the input — clearing value empties the live
              // FileList, and the uploader reads files after an await (promote), so a live list is lost.
              const files = e.target.files ? Array.from(e.target.files) : [];
              if (files.length) onUploadPhotos(r.offer_id, r.imported, files);
              e.target.value = "";
            }}
            title="Завантажити фото лише для цього рядка"
            className="w-40 text-xs"
          />
          <span className="text-[10px] text-gray-400">лише цей рядок</span>
        </div>
      </td>
    </tr>
  );
});

export default OfferRow;

// Three dots with the offer's specs (param name → value) in a CSS tooltip on hover.
// ponytail: pure group-hover, no dependencies and no state; empty params → we render nothing.
function ParamsDots({ params }: { params: Record<string, string> | null }) {
  const entries = Object.entries(params ?? {}).filter(([, v]) => String(v ?? "").trim());
  if (!entries.length) return null;
  return (
    <span className="group relative inline-flex">
      <button type="button" className="px-1 text-gray-400 hover:text-gray-700" aria-label="Характеристики">
        ⋯
      </button>
      <span className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-max max-w-xs rounded-lg border border-gray-200 bg-white p-2 text-xs shadow-lg group-hover:block">
        {entries.map(([k, v]) => (
          <span key={k} className="flex justify-between gap-3 py-0.5">
            <span className="text-gray-500">{k}</span>
            <span className="font-medium text-gray-800">{v}</span>
          </span>
        ))}
      </span>
    </span>
  );
}
