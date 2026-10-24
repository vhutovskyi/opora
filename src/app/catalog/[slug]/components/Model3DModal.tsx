// Viewing a product in 3D / AR. Loaded only after a click (the library is ~300KB).
"use client";

import { useEffect, useState } from "react";
import { Dialog } from "radix-ui";
import type { Model3D } from "@/lib/models3d";

// <model-viewer> is a web component, not a React element. We render it as an ordinary tag
// through a cast, so as not to patch the global JSX namespace for the sake of one place.
// Boolean attributes are passed as an empty string: the component checks for mere presence.
const ModelViewer = "model-viewer" as unknown as React.FC<Record<string, unknown>>;

export default function Model3DModal({
  model,
  title,
  onClose,
}: {
  model: Model3D;
  title: string;
  onClose: () => void;
}) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    import("@google/model-viewer")
      .then(() => alive && setReady(true))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 flex h-[85vh] w-[94vw] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-opora-white p-4 text-opora-brown shadow-xl focus:outline-none sm:p-6"
        >
          <div className="mb-3 flex items-start justify-between gap-4">
            <Dialog.Title className="text-lg font-medium tracking-wide sm:text-xl">{title} — 3D</Dialog.Title>
            <Dialog.Close aria-label="Закрити" className="rounded p-1 text-2xl leading-none hover:opacity-70">
              ×
            </Dialog.Close>
          </div>

          {/* Furniture is mostly light, so against an almost white background the model blended in. A warm
              "studio" backdrop: lighter behind the product, darker at the edges — the silhouette reads,
              while <model-viewer> itself stays transparent so the gradient is visible. */}
          <div
            className="relative min-h-0 flex-1 overflow-hidden rounded-lg"
            style={{
              background:
                "radial-gradient(115% 85% at 50% 30%, #F0E9DF 0%, #DED4C7 40%, #B2A492 100%)",
            }}
          >
            {failed ? (
              <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-gray-500">
                Не вдалося завантажити 3D-перегляд. Спробуйте оновити сторінку.
              </p>
            ) : !ready ? (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
                Завантаження 3D…
              </p>
            ) : (
              <ModelViewer
                src={model.glb}
                ios-src={model.usdz}
                alt={`${title} — 3D-модель`}
                camera-controls=""
                touch-action="pan-y"
                auto-rotate=""
                ar={true}
                // webxr (Android Chrome) → scene-viewer (Android) → quick-look (iOS Safari)
                ar-modes="webxr scene-viewer quick-look"
                // a contact shadow "puts" the product on a plane, otherwise it hangs in mid-air
                shadow-intensity="1.4"
                shadow-softness="0.75"
                exposure="1.05"
                environment-image="neutral"
                loading="eager"
                style={{ width: "100%", height: "100%", backgroundColor: "transparent" }}
              >
                {/* The AR button is shown by the component itself, only where AR is supported */}
                <button
                  slot="ar-button"
                  className="absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-opora-brown px-5 py-2.5 text-sm font-medium text-white shadow-lg hover:opacity-90"
                >
                  Подивитися у своїй кімнаті
                </button>
              </ModelViewer>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
