/** 近距离实拍当前全模秦卒（几何拼装，非扫描高模），供判断拟真度 */
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const out = join(root, 'docs', 'screenshots')
const origin = process.env.CAPTURE_URL ?? 'http://127.0.0.1:5175'

await mkdir(out, { recursive: true })

const browser = await chromium.launch({
  channel: process.env.CAPTURE_CHANNEL ?? 'chrome',
  headless: process.env.CAPTURE_HEADLESS === '1',
  args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-gl=angle'],
})

const page = await browser.newPage({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1.25,
})

await page.goto(`${origin}/`, { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForFunction(() => window.__santiSim, { timeout: 30000 })
await page.evaluate(() => {
  const s = window.__santiSim.getState()
  if (!s.muted) s.toggleMute()
})
await page.getByRole('button', { name: '擊鼓入陣' }).click({ timeout: 20000, force: true })
await page.locator('canvas').waitFor()
await page.evaluate(async () => {
  await document.fonts.ready
})
await page.waitForTimeout(5200)
await page.evaluate(() => window.__santiSim.getState().inject())
await page.waitForFunction(() => window.__santiSim.getState().status === 'READY', { timeout: 15000 })
await page.waitForTimeout(400)

const soldier = await page.evaluate(() => {
  const st = window.__santiSim.getState()
  st.select(null)
  const row = st.netlist.gates.filter((g) => g.zone === 'A' && g.type === 'INPUT')
  const g = row[Math.floor(row.length / 2)] ?? st.netlist.gates.find((x) => x.type === 'INPUT')
  const ui = document.querySelector('.pointer-events-none.fixed.inset-0.z-20')
  if (ui instanceof HTMLElement) ui.style.visibility = 'hidden'
  return { id: g.id, x: g.pos[0], z: g.pos[1], label: g.label }
})

await page.waitForFunction(() => typeof window.__santiLook === 'function', { timeout: 10000 })

const shots = [
  {
    file: 'soldier-front.png',
    x: soldier.x, y: 1.45, z: soldier.z - 2.15,
    tx: soldier.x, ty: 1.12, tz: soldier.z,
  },
  {
    file: 'soldier-three-quarter.png',
    x: soldier.x + 1.45, y: 1.52, z: soldier.z - 1.85,
    tx: soldier.x, ty: 1.18, tz: soldier.z,
  },
  {
    file: 'soldier-head.png',
    x: soldier.x + 0.28, y: 1.78, z: soldier.z - 0.72,
    tx: soldier.x, ty: 1.58, tz: soldier.z,
  },
]

for (const s of shots) {
  await page.evaluate((c) => {
    window.__santiLook(c)
  }, s)
  await page.waitForTimeout(300)
  const cam = await page.evaluate(() => window.__santiCamPos)
  console.log(s.file, cam)
  await page.screenshot({ path: join(out, s.file) })
}

await browser.close()
console.log('saved', soldier, out)
