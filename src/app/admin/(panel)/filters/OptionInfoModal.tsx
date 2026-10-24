"use client";

import { useState } from "react";
import { Dialog } from "radix-ui";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button, Textarea } from "../../ui";

export default function OptionInfoModal({
  groupKey,
  initialInfo,
  onClose,
  onSave,
}: {
  groupKey: string;
  initialInfo: string | null;
  onClose: () => void;
  onSave: (info: string) => Promise<void>;
}) {
  const [text, setText] = useState(initialInfo ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(text);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[92vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-opora-white p-6 text-opora-brown shadow-xl focus:outline-none"
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <Dialog.Title className="text-xl font-medium tracking-wide">Інфо: {groupKey}</Dialog.Title>
            <Dialog.Close aria-label="Закрити" className="rounded p-1 text-2xl leading-none hover:opacity-70">
              ×
            </Dialog.Close>
          </div>

          <div className="space-y-4">
            <Textarea
              rows={10}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Markdown-текст (напр. **жирний**, [посилання](url), списки)"
            />
            <div>
              <span className="mb-1 block text-xs font-medium text-gray-600">Прев&apos;ю</span>
              <div className="rounded-lg border border-gray-200 p-3 text-sm leading-relaxed [&_li]:my-1 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
                {text.trim() ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                ) : (
                  <p className="text-gray-400">Порожньо.</p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Скасувати
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Збереження..." : "Зберегти"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
