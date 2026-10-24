// Product 3D models for 3D/AR viewing.
//
// The source is the supplier's 3ds Max files (FBX/OBJ), converted to GLB (web/Android)
// + USDZ (iOS AR Quick Look) by a Blender script: the meshes are unpacked from the hierarchy, the extra
// helpers removed, the geometry centred on X/Y and put on the floor (Z=0) —
// that is the point AR viewers anchor to.
//
// Both formats live on R2, under the models/ prefix (~26MB for 24 items). <model-viewer>
// pulls the .glb with a FETCH (cross-origin), and the managed r2.dev domain by itself does not
// send Access-Control-Allow-Origin — so the bucket needs a CORS policy with the
// prod domain (both www and apex — both really serve the site) and localhost:3000
// for development; without it the browser silently blocks the model from loading.
// .usdz is read only by iOS Quick Look — by NAVIGATING to the file, not by fetching it, so it needs
// no CORS, but the same policy does no harm.
// The token from .env has no PutBucketCors permission — the policy was set by hand in the
// Cloudflare dashboard (R2 → bucket → Settings → CORS Policy).
// Uploading the files: scripts/upload-models3d.mjs.
//
// ponytail: a static map instead of a DB column — a model is added by a developer together with
// the file. If there get to be many of them, or non-developers start uploading them —
// move it to products.model_url + an admin uploader.
//
// The key is products.slug (what productRef returns), the value is the base file name.
const MODEL_BY_SLUG: Record<string, string> = {
  Ammi: "Ammi",
  Venecia: "Venecia",
  VeneciaLux: "VeneciaLux",
  Duet: "Duet",
  DuetPlus: "DuetPlus",
  Diana: "Diana",
  Nota: "Nota",
  NotaPlus: "NotaPlus",
  NotaBene: "NotaBene",
  Renata: "Renata",
  RenataLux: "RenataLux",
  Selena: "Selena",
  SelenaAuri: "SelenaAuri",
  Tytan: "Tytan",
  Atlas: "Atlas",
  // "Односпальне" are separate products with the same design but a width of 80–90 instead of
  // 120–180. The supplier gave no 3D for them, so they are narrowed down from the double model by
  // 700mm (160 → 90) with a piecewise-linear map along the width axis: the legs and posts are
  // moved inward rigidly, only the slats and the mattress get shorter.
  VeneciaOne: "VeneciaOne",
  VeneciaLuxOne: "VeneciaLuxOne",
  DianaOne: "DianaOne",
  RenataOne: "RenataOne",
  RenataLuxOne: "RenataLuxOne",
  // "Комод+тумба" comes as one file for two items — split along the largest gap
  // along Y (the narrower part is the nightstand, the wider one the chest of drawers).
  Vega: "Vega",
  VegaTumba: "VegaTumba",
  Tessa: "Tessa",
  // the slug of "Комод Тесса" in the DB is KomodVega (looks like a typo), hence this key, while the file
  // is named after the product: if the slug is ever fixed, only the key changes.
  KomodVega: "KomodTessa",
};

// Both are empty if the R2 domain isn't configured — then model3dFor returns null
// (the "3D" button simply isn't rendered) instead of a broken link.
export type Model3D = { glb: string; usdz: string };

// The model for a product by its ref (slug) — null if there is no model.
// r2Domain — process.env.R2_PUBLIC_DOMAIN; read on the SERVER (in catalog/[slug]/page.tsx)
// and passed as a prop, so as not to introduce a duplicate variable with the NEXT_PUBLIC_ prefix.
export function model3dFor(ref: string | null | undefined, r2Domain?: string | null): Model3D | null {
  const base = ref ? MODEL_BY_SLUG[ref] : undefined;
  const domain = (r2Domain || "").replace(/\/$/, "");
  if (!base || !domain) return null;
  return { glb: `${domain}/models/${base}.glb`, usdz: `${domain}/models/${base}.usdz` };
}
