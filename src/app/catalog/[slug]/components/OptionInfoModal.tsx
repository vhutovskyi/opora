// Reading the markdown description of an option axis (e.g. "Матеріал"), set in the admin panel/filters.
"use client";

import { Dialog } from "radix-ui";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { woodComparison } from "@/lib/woodTextures";

// The "Матеріал" description ends with the claim that "the difference between them is purely in the
// appearance" — but it doesn't show that appearance. We add the supplier's texture photos:
// in solid wood the grain is continuous, in a panel the joints of short slats are visible.
function WoodComparison({ colorHex }: { colorHex: string | null }) {
  const wood = woodComparison(colorHex);
  const rows = [
    { label: "Масив", src: wood.masyv, note: "суцільна ламель на всю довжину" },
    { label: "Щит", src: wood.shchyt, note: "короткі рейки, склеєні між собою" },
  ];
  return (
    <div className="mt-5 border-t border-stone-200 pt-5">
      <p className="mb-3 text-sm font-medium">
        Різниця у вигляді
        {wood.colorName && (
          <span className="font-normal text-gray-500">
            {wood.exact ? ` — колір ${wood.colorName}` : ` — на прикладі кольору ${wood.colorName}`}
          </span>
        )}
      </p>
      <div className="flex flex-col gap-3">
        {rows.map((r) => (
          <figure key={r.label} className="m-0">
            {/* Static files from public/ — Cloudflare Images isn't needed here */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={r.src}
              alt={`${r.label} — текстура дерева`}
              width={1200}
              height={300}
              loading="lazy"
              className="block h-auto w-full rounded-md"
            />
            <figcaption className="mt-1 text-xs text-gray-500">
              <span className="font-medium text-opora-brown">{r.label}</span> — {r.note}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

export default function OptionInfoModal({
  groupKey,
  info,
  colorHex = null,
  onClose,
}: {
  groupKey: string;
  info: string;
  // the hex of the selected colour — to show the textures in exactly that shade
  colorHex?: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[92vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-opora-white p-6 text-opora-brown shadow-xl focus:outline-none"
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <Dialog.Title className="text-xl font-medium tracking-wide">{groupKey}</Dialog.Title>
            <Dialog.Close aria-label="Закрити" className="rounded p-1 text-2xl leading-none hover:opacity-70">
              ×
            </Dialog.Close>
          </div>
          <div className="text-sm leading-relaxed [&_li]:my-1 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{info}</ReactMarkdown>
            {groupKey === "Матеріал" && <WoodComparison colorHex={colorHex} />}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
