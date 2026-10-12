// Test de fumée : node tests/smoke.mjs (serveur sur http://localhost:8124)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

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

await page.setViewportSize({ width: 375, height: 800 });
await page.goto(BASE + '#/abn/engine-fire');
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
ok(!overflow, 'pas de défilement horizontal sur téléphone');

ok(errors.length === 0, 'aucune erreur console' + (errors.length ? ' : ' + errors.join(' | ') : ''));
await browser.close();
