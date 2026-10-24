"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { tableSpans } from "@/lib/longDescription/tableSpans";
import type { LongDescriptionBlock } from "@/lib/longDescription/types";

// A product's long description: the admin composes it from blocks, these components draw them.
// The same renderer is used by the preview in the admin panel — one source of styles.
// ponytail: react-markdown is already in the project (ProductAccordions), so **bold** and
// [links](url) work without new fields and without raw HTML — hence no sanitizing is needed.

const LINK = "text-amber-800 underline hover:text-opora-brown";

// Internal links are written RELATIVELY ("/posts/shchyt-chy-masyv") — then the same
// text works both on localhost and on prod. Those we open in the same tab through
// next/link (client-side navigation), external ones — in a new one.
function Anchor({ href, children }: { href?: string; children?: React.ReactNode }) {
  const internal = !!href?.startsWith("/");
  if (internal) {
    return (
      <Link href={href!} className={LINK}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={LINK} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

// Inline text: without a <p> wrapper, for table cells and captions.
function Inline({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <>{children}</>,
        a: Anchor,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

// Block text: paragraphs, lists, links.
function Prose({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div
      className={`leading-relaxed text-stone-700 [&_li]:my-1 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: Anchor,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function Callout({ heading, text, tone }: { heading?: string; text: string; tone?: "neutral" | "green" }) {
  const skin =
    tone === "green"
      ? "border-l-4 border-lime-500 bg-lime-50"
      : "border-l-4 border-opora-brown bg-stone-50";
  return (
    <div className={`rounded-xl p-5 ${skin}`}>
      {heading && <h3 className="mb-2 text-lg font-semibold text-opora-brown">{heading}</h3>}
      <Prose text={text} />
    </div>
  );
}

function Table({ title, headerRow, rows }: { title?: string; headerRow?: string[]; rows: string[][] }) {
  return (
    <div className="space-y-3">
      {title && <h3 className="text-lg font-semibold text-opora-brown">{title}</h3>}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          {headerRow?.length ? (
            <thead>
              <tr>
                {headerRow.map((cell, i) => (
                  <th
                    key={i}
                    className="border border-stone-300 bg-stone-100 px-3 py-2 text-left font-semibold text-stone-800"
                  >
                    <Inline text={cell} />
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {tableSpans(rows).map((row, i) => (
              <tr key={i} className="even:bg-stone-50">
                {row
                  .filter((cell) => cell.show)
                  .map((cell, j) => (
                    <td
                      key={j}
                      rowSpan={cell.rowSpan}
                      colSpan={cell.colSpan}
                      className="border border-stone-300 px-3 py-2 text-stone-700"
                    >
                      <Inline text={cell.text} />
                    </td>
                  ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Figure({
  url,
  caption,
  position = "below",
  className = "",
  width,
}: {
  url: string;
  caption?: string;
  position?: "below" | "above" | "overlay";
  className?: string;
  // The width in % of the container; a smaller photo is centred.
  width?: number;
}) {
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={caption ?? ""} className={`w-full rounded-lg ${className}`} loading="lazy" />
  );
  const size = width ? { maxWidth: `${width}%` } : undefined;
  if (caption && position === "overlay") {
    return (
      <figure className="relative mx-auto overflow-hidden rounded-lg" style={size}>
        {img}
        {/* max-w so that a long name ("101 Темний горіх") doesn't stick out of the narrow swatch */}
        <figcaption className="absolute left-1.5 top-1.5 max-w-[calc(100%-0.75rem)] rounded bg-white/90 px-1.5 py-0.5 text-[11px] font-medium leading-tight text-stone-800">
          <Inline text={caption} />
        </figcaption>
      </figure>
    );
  }
  const cap = caption ? (
    <figcaption className="text-center text-sm italic text-stone-500">
      <Inline text={caption} />
    </figcaption>
  ) : null;
  return (
    <figure className="mx-auto space-y-2" style={size}>
      {position === "above" && cap}
      {img}
      {position === "below" && cap}
    </figure>
  );
}

function ImageText({
  images,
  text,
  layout,
}: {
  images: { url: string; caption?: string; width?: number }[];
  text?: string;
  layout: "left" | "right" | "stacked";
}) {
  const pics = (
    <div className={images.length > 1 ? "grid grid-cols-1 gap-4 sm:grid-cols-2" : ""}>
      {images.map((img, i) => (
        <Figure key={i} url={img.url} caption={img.caption} width={img.width} />
      ))}
    </div>
  );
  const body = text?.trim() ? <Prose text={text} /> : null;

  if (layout === "stacked" || !body) {
    return (
      <div className="space-y-4">
        {pics}
        {body}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-2">
      {layout === "left" ? (
        <>
          {pics}
          {body}
        </>
      ) : (
        <>
          <div className="md:order-2">{pics}</div>
          <div className="md:order-1">{body}</div>
        </>
      )}
    </div>
  );
}

function ColorSwatches({
  title,
  intro,
  swatches,
}: {
  title?: string;
  intro?: string;
  swatches: { code?: string; name: string; imageUrl: string }[];
}) {
  return (
    <div className="space-y-4">
      {title && <h3 className="text-lg font-semibold text-opora-brown">{title}</h3>}
      {intro?.trim() && <Prose text={intro} />}
      {/* The swatches are small — 8 per row on desktop, as in the Estella catalog. */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {swatches.map((s, i) => (
          <Figure
            key={i}
            url={s.imageUrl}
            caption={s.code ? `${s.code} ${s.name}` : s.name}
            position="overlay"
            className="aspect-square object-cover"
          />
        ))}
      </div>
    </div>
  );
}

const COLS: Record<number, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
};

function Gallery({
  title,
  items,
  cols = 3,
  captionPosition = "below",
}: {
  title?: string;
  items: { imageUrl: string; caption?: string }[];
  cols?: 2 | 3 | 4;
  captionPosition?: "below" | "above" | "overlay";
}) {
  return (
    <div className="space-y-4">
      {title && <h3 className="text-lg font-semibold text-opora-brown">{title}</h3>}
      <div className={`grid grid-cols-1 gap-4 ${COLS[cols]}`}>
        {items.map((item, i) => (
          <Figure key={i} url={item.imageUrl} caption={item.caption} position={captionPosition} />
        ))}
      </div>
    </div>
  );
}

function Block({ block }: { block: LongDescriptionBlock }) {
  switch (block.type) {
    case "heading":
      return <h2 className="text-2xl font-semibold text-opora-brown">{block.text}</h2>;
    case "paragraph":
      return <Prose text={block.text} />;
    case "callout":
      return <Callout heading={block.heading} text={block.text} tone={block.tone} />;
    case "table":
      return <Table title={block.title} headerRow={block.headerRow} rows={block.rows} />;
    case "imageText":
      return <ImageText images={block.images} text={block.text} layout={block.layout} />;
    case "colorSwatches":
      return <ColorSwatches title={block.title} intro={block.intro} swatches={block.swatches} />;
    case "gallery":
      return (
        <Gallery
          title={block.title}
          items={block.items}
          cols={block.cols}
          captionPosition={block.captionPosition}
        />
      );
    case "columns":
      return (
        <div className={`grid grid-cols-1 gap-8 ${COLS[Math.min(block.columns.length, 4)] ?? "sm:grid-cols-2"}`}>
          {block.columns.map((col, i) => (
            <div key={i} className="space-y-6">
              {col.map((child, j) => (
                <Block key={j} block={child} />
              ))}
            </div>
          ))}
        </div>
      );
    // Shared blocks are expanded on the read side (resolveSnippets). If a reference
    // isn't expanded (e.g. the block was deleted) — we simply draw nothing.
    case "snippet":
      return null;
  }
}

export default function LongDescriptionRenderer({ blocks }: { blocks: LongDescriptionBlock[] | null }) {
  if (!blocks?.length) return null;
  return (
    // The same container as the main grid of the product page and "Відгуки".
    <section className="mx-auto mt-8 w-full max-w-400 space-y-8 px-4 pt-8 lg:px-8">
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </section>
  );
}
