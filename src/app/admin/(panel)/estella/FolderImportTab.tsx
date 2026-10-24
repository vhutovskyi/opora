"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card, Input } from "../../ui";
import { parseProductFolder, parseBatchFolder, parseBedsFolder, type ProductParse } from "@/lib/estella/folderImport";
import { listSubcategoryOptions, listCatalogs } from "../../actions";
import { listEstellaOffers } from "./folderImportActions";
import { toUiProduct } from "./folderImportUiHelpers";
import { commitOneProduct, type CommitDeps } from "./folderImportCommit";
import { ProductFolderCard } from "./ProductFolderCard";
import { BatchProductRow } from "./BatchProductRow";
import type { UiProduct, SubcategoryOption, Mode } from "./folderImportTypes";

export default function FolderImportTab() {
  const [mode, setMode] = useState<Mode>("single");
  const [products, setProducts] = useState<UiProduct[]>([]);
  // Expansion keyed by array index, not productName — the name is editable, and keying
  // anything off it remounts the card (focus loss) / collapses the row on every keystroke.
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [bulkCatalog, setBulkCatalog] = useState("");
  const [subcategoryOptions, setSubcategoryOptions] = useState<SubcategoryOption[]>([]);
  const [catalogs, setCatalogs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadTaxonomy = () => {
    listSubcategoryOptions().then(setSubcategoryOptions);
    listCatalogs().then((cs) => setCatalogs(cs.map((c) => c.name)));
  };
  useEffect(loadTaxonomy, []);

  // React doesn't reliably render webkitdirectory/directory as JSX props — set them on the DOM node directly.
  useEffect(() => {
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute("webkitdirectory", "");
      fileInputRef.current.setAttribute("directory", "");
    }
  }, []);

  const addLog = (line: string) => setLog((prev) => [...prev, line]);
  const patchProduct = (index: number, p: Partial<UiProduct>) =>
    setProducts((prev) => prev.map((prod, i) => (i === index ? { ...prod, ...p } : prod)));

  async function handleFolderPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.currentTarget.files;
    if (!files || files.length === 0) return;
    setLog([]);
    addLog(`Читаю ${files.length} файлів…`);
    try {
      let parsed: ProductParse[];
      if (mode === "batch") {
        parsed = parseBatchFolder(files);
      } else if (mode === "beds") {
        parsed = parseBedsFolder(files);
      } else {
        const one = parseProductFolder(files);
        parsed = one ? [one] : [];
      }
      if (parsed.length === 0) {
        addLog("❌ Не знайдено зображень у папці.");
        return;
      }
      // Build UI products, then auto-attach each to an XML product with the SAME name (exact match) —
      // saves the manual search+click. The card still lets you search/change it if names differ.
      const ui = await Promise.all(
        parsed.map(async (p) => {
          const prod = toUiProduct(p);
          // Bed constructor: config folders (upgrades) are not imported at all — only the base bed's
          // photos (З постіллю / Каркас / З матрацом). The accessory photos are uploaded by the admin
          // by hand in the product editor. The default catalog is "Ліжка".
          if (mode === "beds") {
            prod.catalog = "Ліжка";
          }
          const offers = await listEstellaOffers(p.productName);
          if (offers.length) {
            prod.attachedTo = p.productName;
            prod.attachOffers = offers;
          }
          return prod;
        })
      );
      setProducts(ui);
      setExpanded(new Set());
      if (mode !== "single") {
        addLog(`Знайдено товарів: ${parsed.length}`);
      } else {
        addLog(
          `Товар: «${parsed[0].productName}», варіацій: ${parsed[0].variants.length}` +
            (parsed[0].unassignedFiles.length ? `, невизначених фото: ${parsed[0].unassignedFiles.length}` : "")
        );
      }
      const attached = ui.filter((p) => p.attachedTo).length;
      if (attached) addLog(`🔗 Авто-прив'язка за назвою: ${attached}/${ui.length}`);
    } catch (err) {
      addLog(`❌ ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // A read-only snapshot + the callbacks commitOneProduct needs. A cheap literal → no useMemo.
  const commitDeps: CommitDeps = { mode, catalogs, addLog, ensureTaxonomyLoaded: loadTaxonomy };

  // Single mode: commit the one product, then reset.
  async function handleCommitSingle() {
    if (products.length === 0) return;
    setBusy(true);
    try {
      await commitOneProduct(products[0], commitDeps);
      addLog("— Готово —");
      setProducts([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      addLog(`❌ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  // Batch mode: commit one product from the list (used per-row for retry).
  async function handleCommitOne(index: number) {
    setBusy(true);
    try {
      await commitOneProduct(products[index], commitDeps);
      patchProduct(index, { done: true });
    } catch (err) {
      addLog(`❌ [${products[index].productName}] ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  // Batch mode: commit every not-yet-done product SEQUENTIALLY. ponytail: sequential (not
  // Promise.all) so we don't stack batch concurrency on top of each product's 4-way photo pool.
  async function handleCommitAll() {
    setBusy(true);
    try {
      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        if (p.done) continue;
        if (!p.attachedTo && !p.catalog.trim()) {
          addLog(`⚠ [${p.productName}] пропущено: не вказано каталог і немає XML-прив'язки.`);
          continue;
        }
        try {
          await commitOneProduct(p, commitDeps);
          patchProduct(i, { done: true });
        } catch (err) {
          addLog(`❌ [${p.productName}] ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      addLog("— Готово —");
    } finally {
      setBusy(false);
    }
  }

  function toggleExpanded(index: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const pendingCount = products.filter((p) => !p.done).length;

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <div className="flex gap-2">
        <Button variant={mode === "single" ? "primary" : "ghost"} onClick={() => setMode("single")} disabled={busy}>
          Один товар
        </Button>
        <Button variant={mode === "batch" ? "primary" : "ghost"} onClick={() => setMode("batch")} disabled={busy}>
          Багато товарів (папка з підпапками)
        </Button>
        <Button variant={mode === "beds" ? "primary" : "ghost"} onClick={() => setMode("beds")} disabled={busy}>
          Ліжка (конструктор)
        </Button>
      </div>

      {/* Folder picker */}
      <Card>
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-gray-600">
              {mode === "beds"
                ? "Папка з ліжками (BEDS) — групуються в товари за базовою моделлю"
                : mode === "batch"
                  ? "Батьківська папка (кожна підпапка = окремий товар)"
                  : "Папка товару (назва папки = назва товару)"}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              disabled={busy}
              onChange={handleFolderPick}
              className="block w-full text-sm"
            />
          </label>
          {log.length > 0 && (
            <pre className="max-h-64 overflow-auto rounded-lg bg-gray-900 p-3 text-xs text-green-300">{log.join("\n")}</pre>
          )}
        </div>
      </Card>

      {/* Batch / beds: apply-catalog-to-all toolbar + commit-all */}
      {mode !== "single" && products.length > 0 && (
        <Card className="flex flex-wrap items-end gap-3">
          <div className="min-w-55 flex-1">
            <label className="text-xs font-medium text-gray-600">Каталог для всіх товарів</label>
            <Input
              list="folder-catalogs-all"
              value={bulkCatalog}
              onChange={(e) => setBulkCatalog(e.target.value)}
              placeholder="Ліжка, Тумби, Комоди…"
              className="mt-1 w-full text-sm"
            />
            <datalist id="folder-catalogs-all">
              {catalogs.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <Button
            variant="ghost"
            disabled={busy || !bulkCatalog.trim()}
            onClick={() =>
              setProducts((prev) => prev.map((p) => ({ ...p, catalog: bulkCatalog.trim(), subcategoryPath: [] })))
            }
          >
            Застосувати каталог до всіх
          </Button>
          <Button onClick={handleCommitAll} disabled={busy || pendingCount === 0}>
            Створити всі ({pendingCount})
          </Button>
        </Card>
      )}

      {/* Single mode: one expanded editor card. Kept mounted (hidden via CSS, not unmounted) so
          switching tabs doesn't lose in-progress state. */}
      <div className={mode === "single" ? "space-y-6" : "hidden"}>
        {products.map((product, i) => (
          <ProductFolderCard
            key={i}
            product={product}
            catalogs={catalogs}
            subcategoryOptions={subcategoryOptions}
            busy={busy}
            onChange={(p) => patchProduct(i, p)}
            footer={
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleCommitSingle}
                  disabled={busy || product.variants.filter((v) => v.included).length === 0 || (!product.attachedTo && !product.catalog.trim())}
                >
                  {product.attachedTo ? "Прив'язати" : "Створити товар"} ({product.variants.filter((v) => v.included).length})
                </Button>
                <Button variant="ghost" onClick={() => setProducts([])} disabled={busy}>
                  Скасувати
                </Button>
              </div>
            }
          />
        ))}
      </div>

      {/* Batch / beds mode: collapsed rows, expand to edit. Same "hidden, not unmounted" treatment. */}
      <div className={mode !== "single" ? "space-y-6" : "hidden"}>
        {products.map((product, i) => (
          <BatchProductRow
            key={i}
            product={product}
            isOpen={expanded.has(i)}
            onToggle={() => toggleExpanded(i)}
            catalogs={catalogs}
            subcategoryOptions={subcategoryOptions}
            busy={busy}
            onChange={(p) => patchProduct(i, p)}
            onCommit={() => handleCommitOne(i)}
          />
        ))}
      </div>
    </div>
  );
}
