// Test de fumée : node tests/smoke.mjs (serveur sur http://localhost:8124)
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:8124/';
const shots = process.env.SHOTS;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 820, height: 1180 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const ok = (cond, msg) => { if (!cond) throw new Error('ÉCHEC : ' + msg); console.log('✓', msg); };
const snap = async (name) => { if (shots) { mkdirSync(shots, { recursive: true }); await page.screenshot({ path: `${shots}/${name}.png` }); } };

await page.goto(BASE);
await page.waitForSelector('.tile');
ok(await page.isVisible('#sample-banner'), 'bannière EXEMPLE visible');
await snap('home');

await page.goto(BASE + '#/normal/preflight');
await page.waitForSelector('.checklist li');
await page.click('.checklist li >> nth=0');
ok(await page.locator('.checklist li.done').count() === 1, 'item coché au toucher');
await page.click('#study');
ok(await page.locator('.checklist.study').count() > 0, 'mode révision actif');
await snap('normal');

await page.goto(BASE + '#/abn');
await page.waitForSelector('#procs li');
ok(await page.locator('#procs li').count() === 4, '4 procédures listées');
await page.click('.chip[data-cat="Électrique"]');
ok(await page.locator('#procs li').count() === 1, 'filtre catégorie');
await page.goto(BASE + '#/abn/engine-fire');
await page.waitForSelector('.memory');
ok(await page.locator('.memory li').count() === 3, 'memory items affichés');
await snap('abnormal');

await page.goto(BASE + '#/quiz/engines');
await page.waitForSelector('.choice');
await page.click('.choice >> nth=0');
ok(await page.locator('.choice.right').count() === 1, 'quiz corrige la réponse');
await page.click('#next');
await page.click('.choice >> nth=0');
await page.click('#next');
await page.waitForSelector('.score');
ok(true, 'quiz arrive au score');

await page.goto(BASE + '#/drill/memory');
await page.waitForSelector('#card');
await page.click('#card');
await page.click('[data-g="1"]');
ok((await page.textContent('main')).includes('Carte 2'), 'flashcard suivante');

await page.goto(BASE + '#/search/fire');
await page.waitForSelector('.list');
ok((await page.textContent('main')).includes('Engine fire'), 'recherche');

await page.goto(BASE + '#/lim');
await page.waitForSelector('.limits');
await snap('limits');

await page.goto(BASE + '#/settings');
await page.setInputFiles('#file', { name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
  limitations: { _meta: { source: 'test' }, groups: [{ title: 'G', items: [{ label: 'X', value: '42' }] }] },
})) });
await page.waitForSelector('#msg:has-text("✓ Pack importé")');
ok(true, 'import de pack');
await page.goto(BASE + '#/lim');
await page.waitForSelector('.limits');
ok((await page.textContent('main')).includes('42'), 'pack importé utilisé');

// Cockpit : sans images (schéma), puis avec un pack d'images (réel si PACK=…, sinon factice).
await page.goto(BASE + '#/cockpit/overhead');
await page.waitForSelector('.ck-stage.noimg');
await page.click('.ck-hs[data-id="bleed"], .ck-hs[data-id="gen1"]');
ok((await page.textContent('#panel')).includes('GEN 1'), 'cockpit : explorer affiche le nom');
await page.click('#sysgo');
await page.waitForSelector('h1:has-text("panneau overhead")');
ok(true, 'cockpit : la commande ouvre la description de son système');
await page.click('a:has-text("Retour au cockpit")');
await page.waitForSelector('.ck-hs.sel[data-id="gen1"]');
ok(true, 'cockpit : retour sur la commande depuis le système');

const pngPx = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const views = JSON.parse(readFileSync(new URL('../content/cockpit.json', import.meta.url))).views;
const pack = process.env.PACK
  ? readFileSync(process.env.PACK)
  : Buffer.from(JSON.stringify({ images: Object.fromEntries(views.map((v) => [v.image, pngPx])) }));
await page.goto(BASE + '#/settings');
await page.setInputFiles('#file', { name: 'c.json', mimeType: 'application/json', buffer: pack });
await page.waitForSelector('#msg:has-text("image(s) cockpit")');
await page.goto(BASE + '#/lim');
await page.waitForSelector('.limits');
ok((await page.textContent('main')).includes('42'), 'import images : le pack de contenu précédent est conservé');

await page.goto(BASE + '#/cockpit/overview');
await page.waitForSelector('.ck-stage img');
await snap('cockpit-overview');
await page.click('.ck-hs[data-id="v-ovh"]');
await page.waitForSelector('.ck-hs[data-id="gen1"]');
ok(true, 'cockpit : navigation depuis la vue d\'ensemble');

await page.click('.chip[data-mode="find"]');
await page.waitForSelector('.ck-prompt');
const target = (await page.textContent('.ck-prompt strong')).trim();
const h = views.find((v) => v.id === 'overhead').hotspots.find((x) => x.label === target);
const box = await page.locator('#stage').boundingBox();
await page.mouse.click(box.x + (h.x + h.w / 2) / 100 * box.width, box.y + (h.y + h.h / 2) / 100 * box.height);
ok((await page.textContent('#panel')).includes('✓ Exact'), 'cockpit : « Trouve » accepte un toucher dans la zone');
await page.click('#next');
const box2 = await page.locator('#stage').boundingBox();
ok(Math.abs(box2.y - box.y) < 1, 'cockpit : l\'image ne bouge pas entre deux questions');
await page.mouse.click(box2.x + 30, box2.y + 30); // coin vide de l'overhead
ok((await page.textContent('#panel')).includes('✗ Non'), 'cockpit : « Trouve » refuse un toucher hors zone');
await snap('cockpit-find');

await page.click('.chip[data-mode="name"]');
await page.waitForSelector('.ck-hs.ask');
const asked = await page.getAttribute('.ck-hs.ask', 'aria-label');
await page.click(`.choice:text-is("${asked}")`);
ok((await page.textContent('#panel')).includes('✓ Exact'), 'cockpit : « Identifie » corrige la réponse');
await snap('cockpit-name');

await page.setViewportSize({ width: 375, height: 800 });
await page.goto(BASE + '#/abn/engine-fire');
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
ok(!overflow, 'pas de défilement horizontal sur téléphone');

ok(errors.length === 0, 'aucune erreur console' + (errors.length ? ' : ' + errors.join(' | ') : ''));
await browser.close();
