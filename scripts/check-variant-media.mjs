// Checks the media "lookup" on the product page: hovering an option prefetches the photos,
// a click shows exactly what api/products/variant/[id] returned, and re-picking an already
// loaded option makes no new request.
// Run: npm run dev, then node scripts/check-variant-media.mjs http://localhost:3000/catalog/<id>
// Drives the installed Chrome over CDP — no new dependencies.
import assert from 'node:assert';
import { spawn } from 'node:child_process';

const target = process.argv[2];
assert(target, 'вкажи URL сторінки товару');

const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--remote-debugging-port=9222', '--user-data-dir=/tmp/cdp-profile', '--no-first-run', 'about:blank'],
  { stdio: 'ignore' }
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const done = (code) => { chrome.kill(); process.exit(code); };

let targets;
for (let i = 0; i < 40; i++) {
  try {
    targets = await (await fetch('http://localhost:9222/json/list')).json();
    if (targets.some((t) => t.type === 'page')) break;
  } catch {}
  await sleep(250);
}
const page = targets?.find((t) => t.type === 'page');
assert(page, 'Chrome не піднявся на 9222');

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (pending.has(m.id)) pending.get(m.id)(m);
});
const send = (method, params = {}) =>
  new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => {
  const { result } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.result?.subtype === 'error') throw new Error(result.result.description);
  return result.result.value;
};

await send('Page.enable');
await send('Page.navigate', { url: target });
await sleep(4000);

const out = await evaluate(`(async () => {
  const firstPhoto = () => {
    const img = [...document.querySelectorAll('img')].find(i => (i.getAttribute('src') || '').includes('images-compressed'));
    return img ? decodeURIComponent(img.getAttribute('src')) : null;
  };
  const colors = (pressed) => [...document.querySelectorAll('button[aria-pressed="' + pressed + '"][title]')]
    .filter(b => b.title.startsWith('Колір'));

  // Log the media requests and their responses.
  const calls = [];
  const bodies = [];
  const orig = window.fetch;
  window.fetch = (...a) => {
    const p = orig(...a);
    if (String(a[0]).includes('/api/products/variant/')) {
      calls.push(String(a[0]));
      p.then(r => r.clone().json()).then(j => bodies.push(j)).catch(() => {});
    }
    return p;
  };

  const before = firstPhoto();
  const selected = colors('true')[0];
  const next = colors('false')[0];
  if (!next) return { error: 'на сторінці лише один колір — потрібен товар з кількома' };

  // 1) Hovering (without a click) must prefetch the media.
  const hoverLabel = next.title;
  next.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  next.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  for (let i = 0; i < 80 && bodies.length === 0; i++) await new Promise(r => setTimeout(r, 100));
  const callsAfterHover = calls.length;
  const hovered = bodies[0] || null;

  // 2) A click — there must be no new request, the gallery shows exactly what arrived.
  next.click();
  await new Promise(r => setTimeout(r, 700));
  const callsAfterClick = calls.length;
  const photoAfterClick = firstPhoto();

  // 3) Back to the initial option — its media came as a prop, there must be no request.
  let backOk = null;
  if (selected) {
    selected.click();
    await new Promise(r => setTimeout(r, 700));
    backOk = { calls: calls.length, photo: firstPhoto() };
  }
  return { before, hoverLabel, callsAfterHover, callsAfterClick, hovered, photoAfterClick, backOk };
})()`);

try {
  assert(!out.error, out.error);
  assert.strictEqual(out.callsAfterHover, 1, `наведення мало дати рівно 1 запит медіа, а дало ${out.callsAfterHover}`);
  assert(out.hovered, 'відповідь медіа не розпарсилась');
  assert.strictEqual(out.callsAfterClick, 1, `клік по вже наведеній опції зробив ще запит (${out.callsAfterClick} всього)`);

  const expected = out.hovered.imagesCompressed[0] || out.hovered.images[0];
  assert(expected, `лукап віддав варіацію без фото: ${JSON.stringify(out.hovered).slice(0, 200)}`);
  assert(
    out.photoAfterClick?.includes(expected),
    `галерея показує не те, що віддав лукап:\n  очікував …${expected.slice(-70)}\n  показано …${String(out.photoAfterClick).slice(-70)}`
  );

  if (out.backOk) {
    assert.strictEqual(out.backOk.calls, 1, 'повернення на початкову опцію зробило зайвий запит (медіа мало прийти пропом)');
    assert.strictEqual(out.backOk.photo, out.before, 'повернення на початкову опцію не відновило її фото');
  }

  console.log(`OK: наведення «${out.hoverLabel}» → 1 запит медіа; клік — 0 нових; галерея = відповідь лукапа`);
  console.log('OK: повернення на початкову опцію — 0 запитів, фото відновлено (медіа прийшло пропом)');
  console.log(`   фото: …${String(out.before).slice(-58)}\n      →  …${String(out.photoAfterClick).slice(-58)}`);
  done(0);
} catch (e) {
  console.error(e.message);
  done(1);
}
