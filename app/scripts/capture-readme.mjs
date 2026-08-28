/**
 * README / GitHub 首页高质量截图：热键 1–6 机位 + 程序档。
 * 需先 vite（默认 5175）。无头黑屏时设 CAPTURE_HEADLESS=0。
 */
import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'docs', 'screenshots');
const BASE = process.env.SANTI_URL ?? 'http://127.0.0.1:5175';
const HEADLESS = process.env.CAPTURE_HEADLESS !== '0';

const PRESETS = [
  { key: 'overview', file: '01-yard.png',     title: '1 全景' },
  { key: 'top',      file: '01-yard-top.png', title: '2 俯瞰' },
  { key: 'input',    file: '02-input.png',    title: '3 注入列' },
  { key: 'drum',     file: '03-drum.png',     title: '4 鼓台' },
  { key: 'output',   file: '05-output.png',   title: '5 輸出端' },
  { key: 'command',  file: '06-command.png',  title: '6 監軍台' },
];

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: process.env.CAPTURE_CHANNEL ?? 'chrome',
  headless: HEADLESS,
  args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-gl=angle'],
});

const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 2,
});
page.setDefaultTimeout(90_000);

async function settle(ms = 1800) {
  await page.waitForTimeout(ms);
}

async function shot(file) {
  await page.screenshot({
    path: join(OUT, file),
    type: 'png',
  });
  console.log('wrote', file);
}

async function sim(fn, arg) {
  return page.evaluate(fn, arg);
}

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: '擊鼓入陣' }).waitFor({ timeout: 45_000 });
await settle(400);
await shot('00-loading.png');

await page.getByRole('button', { name: '擊鼓入陣' }).click({ force: true });
await page.locator('canvas').waitFor({ timeout: 30_000 });
await settle(7000);

await page.waitForFunction(() => {
  const hook = window.__santiSim;
  return !!(hook && hook.getState && hook.getState().introDone);
}, { timeout: 20_000 });

await sim(() => {
  const s = window.__santiSim.getState();
  if (!s.muted) s.toggleMute();
});
await sim(() => window.__santiSim.getState().inject());
await settle(2000);

const probe = await sim(() => {
  const canvas = document.querySelector('canvas');
  const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
  return {
    canvas: !!canvas,
    lost: gl ? gl.isContextLost() : true,
    soldiers: window.__santiSim?.getState()?.netlist?.stats?.total ?? 0,
    status: window.__santiSim?.getState()?.status,
  };
});
console.log('probe', JSON.stringify(probe));
if (!probe.canvas || probe.lost) {
  await browser.close();
  throw new Error(`WebGL missing/lost (headless=${HEADLESS}). Retry with CAPTURE_HEADLESS=0`);
}

for (const p of PRESETS) {
  console.log('preset', p.title);
  await sim((key) => window.__santiSim.getState().setPreset(key), p.key);
  await settle(1800);
  await shot(p.file);
}

await sim(() => window.__santiSim.getState().setMode('program'));
await settle(5000);
await sim(() => window.__santiSim.getState().inject());
await settle(2000);
await sim(() => window.__santiSim.getState().setPreset('overview'));
await settle(1800);
await shot('04-program.png');

await sim(() => window.__santiSim.getState().setPreset('input'));
await settle(1800);
await shot('05-program-input.png');

await page.goto(`${BASE}/principle`, { waitUntil: 'domcontentloaded' });
await sim(async () => {
  try { await document.fonts.load('400 80px ShuowenSeal'); } catch {}
  try { await document.fonts.load('400 24px Qiji'); } catch {}
  try { await document.fonts.ready; } catch {}
});
await settle(1500);

const inputBtn = page.getByRole('button', { name: /輸入/ });
if (await inputBtn.count()) {
  await inputBtn.first().click();
  await settle(800);
}

const socialPage = await browser.newPage({
  viewport: { width: 1280, height: 640 },
  deviceScaleFactor: 1,
});
const yard = await readFile(join(OUT, '01-yard.png'));
const b64 = yard.toString('base64');
await socialPage.setContent(
  `<html><body style="margin:0;overflow:hidden;background:#17100B">`
  + `<img src="data:image/png;base64,${b64}" style="width:1280px;height:auto;display:block" alt="" />`
  + `</body></html>`,
);
await socialPage.waitForTimeout(200);
await socialPage.screenshot({
  path: join(OUT, 'social-preview.png'),
  type: 'png',
  clip: { x: 0, y: 0, width: 1280, height: 640 },
});
console.log('wrote social-preview.png');
await socialPage.close();

await browser.close();
console.log('done →', OUT);
