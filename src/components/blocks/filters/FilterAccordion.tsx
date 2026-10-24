"use client";

import { useState } from "react";

export function FilterAccordion({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-opora-brown/10 pb-4 last:border-0">
      <button onClick={() => setIsOpen(!isOpen)} className="flex items-center gap-3 font-bold w-full text-left hover:opacity-70 transition-opacity">
        <span className="text-xl font-light w-4 text-center leading-none">{isOpen ? '−' : '+'}</span> {title}
      </button>
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? "max-h-125 opacity-100 mt-4" : "max-h-0 opacity-0"}`}>
        <div className="space-y-3 ml-7">{children}</div>
      </div>
    </div>
  );
}
