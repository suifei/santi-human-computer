import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'

const origin = process.env.CAPTURE_URL ?? 'http://127.0.0.1:5175'
const out = process.env.QA_OUT ?? join(process.env.TEMP || '/tmp', 'santi-qa')
await mkdir(out, { recursive: true })

const errors = []
const browser = await chromium.launch({
  channel: process.env.CAPTURE_CHANNEL ?? 'chrome',
  headless: process.env.CAPTURE_HEADLESS !== '0',
  args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-gl=angle'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
page.on('pageerror', (err) => errors.push('pageerror ' + err.message))
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push('console ' + msg.text())
})

await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.getByRole('button', { name: '擊鼓入陣' }).click({ timeout: 25000, force: true })
await page.locator('canvas').waitFor()
await page.waitForTimeout(8000)
await page.evaluate(async () => {
  const s = window.__santiSim?.getState()
  if (s && !s.muted) s.toggleMute()
})
await page.screenshot({ path: join(out, '01-overview.png') })
console.log('saved 01-overview')

await page.waitForFunction(() => typeof window.__santiLook === 'function', { timeout: 15000 })

const looks = [
  { file: '02-sky-birds.png', x: 8, y: 22, z: 28, tx: 0, ty: 16, tz: 0 },
  { file: '03-tents-trees.png', x: -28, y: 6, z: -18, tx: -42, ty: 1.4, tz: -28 },
  { file: '04-drum.png', x: 18.4, y: 3.85, z: 21.6, tx: 25, ty: 2.45, tz: 16 },
  { file: '05-command.png', x: 16.4, y: 3.35, z: -15.2, tx: 24.4, ty: 2.55, tz: -16.9 },
  { file: '06-command-faces.png', x: 19.4, y: 3.15, z: -16.95, tx: 25, ty: 2.55, tz: -16.9 },
  { file: '07-soldiers-flags.png', x: -8, y: 3.2, z: 12, tx: -12, ty: 1.1, tz: 8 },
]
for (const s of looks) {
  await page.evaluate((c) => window.__santiLook(c), s)
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(out, s.file) })
  console.log('saved', s.file)
}

await page.keyboard.press('4')
await page.waitForTimeout(1400)
await page.screenshot({ path: join(out, '08-drum-hotkey.png') })
console.log('saved 08-drum-hotkey')
await page.keyboard.press('6')
await page.waitForTimeout(1400)
await page.screenshot({ path: join(out, '08-command-hotkey.png') })
console.log('saved 08-command-hotkey')

const probe = await page.evaluate(() => {
  const canvas = document.querySelector('canvas')
  const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl')
  return {
    canvas: !!canvas,
    lost: gl ? gl.isContextLost() : true,
    soldiers: window.__santiSim?.getState()?.netlist?.stats?.total ?? 0,
    status: window.__santiSim?.getState()?.status,
  }
})
console.log('probe', JSON.stringify(probe))

for (const who of ['', 'vn', 'emperor']) {
  const q = who ? `?who=${who}` : ''
  const tag = who || 'qin'
  await page.goto(`${origin}/asset${q}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('canvas', { timeout: 20000 })
  await page.waitForTimeout(2200)
  await page.keyboard.press('2')
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(out, `09-asset-${tag}.png`) })
  console.log('saved', `09-asset-${tag}`)
}

await page.goto(`${origin}/asset`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('canvas', { timeout: 20000 })
await page.waitForTimeout(1800)
await page.screenshot({ path: join(out, '10-asset-qin-return.png') })
console.log('saved 10-asset-qin-return')

await browser.close()
console.log('errors', errors.length ? errors.slice(0, 12) : 'none')
console.log('out', out)
