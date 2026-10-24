// Checks: packed(cache) < 2MB and unpack(packed) === the old ProductDetail.
// node scripts/check-product-payload.mjs (reads .env / .env.local)
import assert from 'node:assert';
import fs from 'node:fs';
const env={}; for (const f of ['.env','.env.local']) { try { for (const l of fs.readFileSync(f,'utf8').split('\n')) { const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m) env[m[1]]=m[2].replace(/^["']|["']$/g,''); } } catch {} }
const url=env.NEXT_PUBLIC_SUPABASE_URL, key=env.SUPABASE_SERVICE_ROLE_KEY;
const get=async p=>{const t=Date.now();const r=await fetch(`${url}/rest/v1/${p}`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});return {t:await r.text(),ms:Date.now()-t};};

const bySort=(a,b)=>(a.sort_order||0)-(b.sort_order||0);
const visibleSorted=rows=>(rows||[]).filter(v=>v.visible!==false).sort(bySort);
const variantOptions=v=>((v.variant_options||[]).map(o=>o.options).filter(Boolean)).sort((a,b)=>(a.name||"").localeCompare(b.name||"","uk"));
const specs=v=>(v.variant_specs||[]).slice().sort((a,b)=>(a.legacy_num||0)-(b.legacy_num||0)).map(s=>({name:s.specs?.name||"Невідомо",value:String(s.value||"")}));
const vImages=v=>{const rows=(v.variant_images||[]).filter(r=>r.images).slice().sort(bySort);
  return {images:rows.map(r=>r.images.url), imagesCompressed:rows.map(r=>r.images.url_compressed||r.images.url)};};

const V="id,name,sku,price,in_stock,visible,sort_order,variant_images(sort_order,images(url,url_compressed)),variant_options(options(name,value)),variant_specs(value,legacy_num,specs(name))";
const A=`product_accessories!product_id(id,sort_order,max_qty,accessory:accessory_product_id(id,slug,model,min_price,combo_axis,variants(${V})))`;

const oldVariant=v=>({id:v.id,name:v.name||"",sku:v.sku||"",price:Number(v.price||0),inStock:!!v.in_stock,...vImages(v),
  options:variantOptions(v).map(o=>({name:o.name||"",value:o.value||""})),specifications:specs(v)});
const accLinks=p=>(p.product_accessories||[]).slice().sort(bySort).filter(a=>a.accessory);
const accLink=(a,mapVariant)=>({id:a.id,product:{id:a.accessory.id,slug:a.accessory.slug,model:a.accessory.model||"",
  minPrice:Number(a.accessory.min_price||0),comboAxis:a.accessory.combo_axis,
  variants:visibleSorted(a.accessory.variants).map(mapVariant)},maxQty:Math.max(1,a.max_qty||1)});
const comboSets=rows=>rows.map(c=>{const r=(c.accessory_combo_images||[]).filter(x=>x.images).slice().sort(bySort);
  return {imageGroupKey:c.image_group_key,comboKey:c.combo_key,images:r.map(x=>x.images.url),
    imagesCompressed:r.map(x=>x.images.url_compressed||x.images.url)};});
const oldDetail=(p,combo)=>({variants:visibleSorted(p.variants).map(oldVariant),
  accessories:accLinks(p).map(a=>accLink(a,oldVariant)),accessoryComboPhotos:comboSets(combo)});

const compressedUrl=u=>`${u.replace("/images/","/images-compressed/")}.webp`;
const derivable=(images,imagesCompressed)=>imagesCompressed.every((u,i)=>u===compressedUrl(images[i]));
const specPool=()=>{const sets=[],seen=new Map();return {sets,id:sp=>{const k=JSON.stringify(sp);let i=seen.get(k);if(i===undefined){i=sets.push(sp)-1;seen.set(k,i);}return i;}};};
const packVariant=(v,sp)=>{const o=oldVariant(v);const {imagesCompressed,specifications,...rest}=o;
  return {...rest,imagesCompressed:derivable(o.images,imagesCompressed)?null:imagesCompressed,specs:sp.id(specifications)};};
const packDetail=(p,combo)=>{const sp=specPool();return {specSets:sp.sets,
  variants:visibleSorted(p.variants).map(v=>packVariant(v,sp)),
  accessories:accLinks(p).map(a=>accLink(a,v=>packVariant(v,sp))),
  // Combo photos are packed the same way: Дует Плюс has 1000 sets (1.99MB) — without this the entry is 2.32MB.
  accessoryComboPhotos:comboSets(combo).map(c=>({...c,imagesCompressed:derivable(c.images,c.imagesCompressed)?null:c.imagesCompressed}))};};
const unpack=({specSets,variants,accessories,accessoryComboPhotos,...rest})=>{
  const uv=({specs,imagesCompressed,...v})=>({...v,imagesCompressed:imagesCompressed??v.images.map(compressedUrl),specifications:specSets[specs]});
  return {...rest,variants:variants.map(uv),accessories:accessories.map(a=>({...a,product:{...a.product,variants:a.product.variants.map(uv)}})),
    accessoryComboPhotos:accessoryComboPhotos.map(c=>({...c,imagesCompressed:c.imagesCompressed??c.images.map(compressedUrl)}))};};

const mb=n=>(n/1e6).toFixed(2);
let worst=0, worstModel='';
for (const {id,model} of JSON.parse((await get(`products?select=id,model&visible=eq.true`)).t)) {
  const sel=`id,slug,model,catalog,description,long_description,seo_title,seo_description,assembly_video_url,assembly_pdf_url,min_price,visible,gallery_layout,variants(${V}),${A}`;
  const raw=await get(`products?select=${encodeURIComponent(sel)}&id=eq.${id}`);
  const p=JSON.parse(raw.t)[0];
  const combo=JSON.parse((await get(`accessory_combo_photos?select=image_group_key,combo_key,accessory_combo_images(sort_order,images(url,url_compressed))&product_id=eq.${id}`)).t);
  const packed=packDetail(p,combo);
  assert.deepStrictEqual(unpack(structuredClone(packed)), oldDetail(p,combo), `${model}: unpack ≠ старий формат`);
  const size=JSON.stringify(packed).length;
  assert.ok(size<2e6, `${model}: запис у кеші ${mb(size)}МБ — понад ліміт 2МБ, сторінка не кешуватиметься`);
  if (size>worst) { worst=size; worstModel=model; }
  if (raw.t.length>300000 || combo.length>100) console.log(`${model}: запит ${mb(raw.t.length)}МБ, у кеш ${mb(size)}МБ ✅ (варіацій ${packed.variants.length}, наборів характеристик ${packed.specSets.length}, комбо-фото ${combo.length})`);
}
console.log(`OK: unpack() бітово дорівнює старому ProductDetail для всіх товарів; найбільший запис у кеші ${mb(worst)}МБ — ${worstModel} (ліміт 2МБ)`);
