"use client";

import { Button, Card } from "../../ui";
import { ProductFolderCard } from "./ProductFolderCard";
import type { UiProduct, SubcategoryOption } from "./folderImportTypes";

// Batch mode: one collapsed row, expands into a ProductFolderCard for editing.
export function BatchProductRow({
  product,
  isOpen,
  onToggle,
  catalogs,
  subcategoryOptions,
  busy,
  onChange,
  onCommit,
}: {
  product: UiProduct;
  isOpen: boolean;
  onToggle: () => void;
  catalogs: string[];
  subcategoryOptions: SubcategoryOption[];
  busy: boolean;
  onChange: (p: Partial<UiProduct>) => void;
  onCommit: () => void;
}) {
  const photoCount = product.variants.reduce((n, v) => n + v.files.length, 0);

  return (
    <Card className={product.done ? "opacity-60" : ""}>
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 text-left">
        <span className="text-gray-400">{isOpen ? "▾" : "▸"}</span>
        <span className="flex-1 font-medium">{product.productName}</span>
        <span className="text-xs text-gray-500">
          {product.variants.length} варіац. · {photoCount} фото
        </span>
        {product.attachedTo && <span className="text-xs text-opora-brown">🔗 XML</span>}
        {product.catalog && <span className="text-xs text-opora-brown">{product.catalog}</span>}
        {product.done && <span className="text-xs text-green-600">✓ імпортовано</span>}
      </button>
      {isOpen && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <ProductFolderCard
            embedded
            product={product}
            catalogs={catalogs}
            subcategoryOptions={subcategoryOptions}
            busy={busy}
            onChange={onChange}
            footer={
              <div className="flex gap-2">
                <Button
                  onClick={onCommit}
                  disabled={busy || product.done || product.variants.filter((v) => v.included).length === 0 || (!product.attachedTo && !product.catalog.trim())}
                >
                  {product.done ? "Імпортовано" : "Створити цей товар"}
                </Button>
                {product.done && (
                  <Button variant="ghost" onClick={() => onChange({ done: false })} disabled={busy}>
                    Імпортувати ще раз
                  </Button>
                )}
              </div>
            }
          />
        </div>
      )}
    </Card>
  );
}
