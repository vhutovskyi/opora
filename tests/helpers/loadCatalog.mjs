// Bundles the REAL src/lib/supabase/catalog.ts with esbuild (the app's TS + "@/" alias can't run in
// plain Node), swapping two modules: ./client → supabaseStub.mjs (fixture rows instead of Supabase)
// and next/cache → a passthrough unstable_cache, so every call sees the current test's fixture.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const stubs = {
  name: "opora-test-stubs",
  setup(b) {
    b.onResolve({ filter: /(^|\/)client$/ }, (args) =>
      args.importer.includes(join("src", "lib", "supabase")) || args.path === "@/lib/supabase/client"
        ? { path: join(root, "tests/helpers/supabaseStub.mjs") }
        : undefined
    );
    b.onResolve({ filter: /^next\/cache$/ }, () => ({ path: "next-cache", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: "export const unstable_cache = (fn) => fn;",
      loader: "js",
    }));
  },
};

export async function loadModule(entry, name) {
  // Inside the repo, so the external packages (clsx, tailwind-merge…) resolve from node_modules.
  const outfile = join(root, "node_modules/.cache/opora-tests", `${name}.mjs`);
  await build({
    entryPoints: [join(root, entry)],
    bundle: true,
    format: "esm",
    platform: "node",
    packages: "external",
    alias: { "@": join(root, "src") },
    plugins: [stubs],
    outfile,
    logLevel: "error",
  });
  return import(outfile);
}

export const loadCatalog = () => loadModule("src/lib/supabase/catalog.ts", "catalog");

export function setDb(db) {
  globalThis.__oporaDb = db;
}
