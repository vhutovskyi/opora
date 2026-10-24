"use client";

import React from "react";
import { useSearchParams } from "next/navigation";

// Lean Tailwind admin UI kit (no external deps). ponytail: just enough primitives.

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

// Thumbnail that opens a fullscreen overlay on click. ponytail: state-only, no lib.
export function ZoomImg({ src, className, alt = "" }: { src: string; className?: string; alt?: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={cx("cursor-zoom-in", className)} onClick={() => setOpen(true)} />
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="max-h-full max-w-full cursor-zoom-out object-contain" />
        </div>
      )}
    </>
  );
}

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-opora-brown text-white hover:opacity-90",
    ghost: "bg-transparent border border-gray-300 text-gray-700 hover:bg-gray-50",
    danger: "bg-red-500 text-white hover:bg-red-600",
  }[variant];
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50",
        styles,
        className
      )}
      {...props}
    />
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-opora-brown",
        props.className
      )}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx(
        "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-opora-brown",
        props.className
      )}
    />
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      {children}
    </label>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("rounded-xl border border-gray-200 bg-white p-5 shadow-sm", className)}>{children}</div>;
}

export function Badge({ tone = "neutral", children }: { tone?: "ok" | "off" | "neutral"; children: React.ReactNode }) {
  const t = { ok: "bg-green-100 text-green-700", off: "bg-gray-100 text-gray-500", neutral: "bg-blue-100 text-blue-700" }[tone];
  return <span className={cx("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", t)}>{children}</span>;
}

// Sub-tabs within one nav item. Seeded from `?tab=` so dashboard cards can deep-link, but switching
// is local state + history.replaceState — router.push would re-run the (force-dynamic) server page,
// which is what made switching feel laggy.
// A tab mounts on first open and stays mounted afterwards (hidden via `hidden`):
// going back doesn't refetch the data, but Estella doesn't pull its list until it is opened either.
export function Tabs({
  tabs,
  paramKey = "tab",
}: {
  tabs: { key: string; label: string; content: React.ReactNode }[];
  paramKey?: string;
}) {
  const params = useSearchParams();
  const initial = tabs.find((t) => t.key === params.get(paramKey))?.key ?? tabs[0].key;
  const [active, setActive] = React.useState(initial);
  const [seen, setSeen] = React.useState<string[]>([initial]);

  function select(key: string) {
    setActive(key);
    setSeen((s) => (s.includes(key) ? s : [...s, key]));
    const url = new URL(window.location.href);
    url.searchParams.set(paramKey, key);
    window.history.replaceState(null, "", url);
  }

  return (
    <div>
      <div className="mb-5 flex gap-1 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => select(t.key)}
            className={cx(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium",
              t.key === active
                ? "border-opora-brown text-opora-brown"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs
        .filter((t) => seen.includes(t.key))
        .map((t) => (
          <div key={t.key} hidden={t.key !== active}>
            {t.content}
          </div>
        ))}
    </div>
  );
}

export function Checkbox({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
      <input type="checkbox" {...props} className="h-4 w-4 accent-opora-brown" />
      {label}
    </label>
  );
}
