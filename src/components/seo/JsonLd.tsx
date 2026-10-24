// Renders the structured data block (JSON-LD) for search engines.
// A Server Component — no "use client".
export default function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify escapes the data safely; <script> isn't parsed as HTML.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
