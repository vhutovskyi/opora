// Compares what ProductCard sees from the OLD (full) and the NEW (thin) catalog query.
// node scripts/check-catalog-payload.mjs (reads .env / .env.local)
import assert from 'node:assert';
import fs from 'node:fs';
const env={}; for (const f of ['.env','.env.local']) { try { for (const l of fs.readFileSync(f,'utf8').split('\n')) { const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m) env[m[1]]=m[2].replace(/^["']|["']$/g,''); } } catch {} }
const url=env.NEXT_PUBLIC_SUPABASE_URL, key=env.SUPABASE_SERVICE_ROLE_KEY;
const get=async p=>{const t=Date.now();const r=await fetch(`${url}/rest/v1/${p}`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});const txt=await r.text();return {txt,ms:Date.now()-t,status:r.status};};

const NON=["розмір","відстань між ламелями"];
const isVis=n=>!NON.includes((n.split(":")[0]||"").trim().toLowerCase());
const groupKey=ns=>ns.filter(isVis).map(n=>n.trim().toLowerCase()).sort().join("|");
const bySort=(a,b)=>(a.sort_order||0)-(b.sort_order||0);

// --- OLD projection (as it was in git HEAD) ---
const OLD=`id,model,min_price,catalog,created_at,variants(id,price,sort_order,photos,photos_compressed,variant_images(sort_order,images(url,url_compressed)),variant_options(options(name,value)),variant_specs(value,specs(name,filterable)))`;
const oldRes = await get(`products?select=${encodeURIComponent(OLD)}&visible=eq.true`);
const oldProducts = JSON.parse(oldRes.txt).map(p=>({
  id:p.id, name:p.model,
  variations:(p.variants||[]).slice().sort(bySort).map(v=>{
    const linked=(v.variant_options||[]).map(o=>o.options).filter(Boolean);
    const imgs=(v.variant_images||[]).filter(r=>r.images).slice().sort(bySort);
    return {id:v.id, allHexes:linked.map(o=>({hex:o.value||"",name:o.name||""})),
      images:(imgs.length?imgs.map(r=>r.images.url_compressed||r.images.url):(v.photos||[]).map((o,i)=>(v.photos_compressed||[])[i]||o)).slice(0,2)};
  })})).filter(p=>p.variations.length>0);

// --- NEW projection (src/lib/supabase/catalog.ts fetchCatalogBase) ---
const NEW=`id,model,min_price,created_at,variants(id,sort_order,variant_images(sort_order,images(url,url_compressed)),variant_options(options(name,value)))`;
const newRes = await get(`products?select=${encodeURIComponent(NEW)}&visible=eq.true&variants.variant_images.order=sort_order.asc&variants.variant_images.limit=2`);
const newProducts = JSON.parse(newRes.txt).map(p=>{
  const seen=new Set(); const variations=[];
  for (const v of (p.variants||[]).slice().sort(bySort)) {
    const linked=(v.variant_options||[]).map(o=>o.options).filter(Boolean);
    const names=linked.map(o=>o.name||"").filter(Boolean);
    const look=groupKey(names);
    if (seen.has(look)) continue; seen.add(look);
    variations.push({id:v.id, allHexes:linked.map(o=>({hex:o.value||"",name:o.name||""})),
      images:(v.variant_images||[]).filter(r=>r.images).map(r=>r.images.url_compressed||r.images.url)});
  }
  return {id:p.id, name:p.model, variations};
}).filter(p=>p.variations.length>0);

// --- ProductCard derivation (swatches + photos of the active variant) ---
const isHex=v=>/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test((v||"").trim());
const card=(p, selected=[])=>{
  const matches=v=>selected.length>0 && (v.allHexes||[]).some(h=>selected.includes(h.name));
  const variations = selected.length? [...p.variations].sort((a,b)=>Number(matches(b))-Number(matches(a))) : p.variations;
  const hexesOf=v=>(v.allHexes||[]).filter(h=>isHex(h.hex));
  const seen=new Set(), colorVars=[];
  for (const v of variations) { const h=hexesOf(v); if(!h.length) continue; const k=h.map(x=>x.hex).join("|"); if(seen.has(k)) continue; seen.add(k); colorVars.push(v); }
  const swatches=colorVars.slice(0,4);
  const active = variations.find(matches) ?? swatches[0] ?? variations[0];
  return { swatchHexes: swatches.map(v=>hexesOf(v).map(h=>h.hex).join("|")), plusN: Math.max(0,colorVars.length-4),
           activeImages: active?.images ?? [] };
};

assert.deepStrictEqual(newProducts.map(p=>p.id).sort(), oldProducts.map(p=>p.id).sort(), 'той самий набір товарів');
const filters=[[], ["Матеріал: Масив"], ["Матеріал: Щит"], ["Розмір: 160х200"], ["Фурнітура: Push to open"]];
let checked=0;
for (const p of oldProducts) {
  const np = newProducts.find(x=>x.id===p.id);
  for (const f of filters) { assert.deepStrictEqual(card(np,f), card(p,f), `${p.name} @ [${f}]`); checked++; }
}
console.log(`OK: ${checked} перевірок картки (${oldProducts.length} товарів × ${filters.length} фільтрів) — рендер ідентичний`);
console.log(`payload: ${(oldRes.txt.length/1e6).toFixed(2)}МБ/${oldRes.ms}ms → ${(newRes.txt.length/1e6).toFixed(2)}МБ/${newRes.ms}ms`);
const cached = JSON.stringify(newProducts);
console.log(`у кеш іде: ${(cached.length/1e6).toFixed(2)}МБ (ліміт unstable_cache 2МБ), варіацій ${newProducts.reduce((s,p)=>s+p.variations.length,0)} замість ${oldProducts.reduce((s,p)=>s+p.variations.length,0)}`);
