/** 点验页实拍秦卒静模 */
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
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1.25,
})

page.on('pageerror', (err) => console.error('pageerror', err.message))
page.on('console', (msg) => {
  if (msg.type() === 'error') console.error('console', msg.text())
})

await page.goto(`${origin}/asset`, { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForSelector('canvas', { timeout: 20000 })
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(2500)

const shots = [
  { file: 'qin-three-quarter.png', key: '2' },
  { file: 'qin-front.png', key: '1' },
  { file: 'qin-head.png', key: '5' },
  { file: 'qin-side.png', key: '3' },
  { file: 'qin-back.png', key: '4' },
  { file: 'qin-perspective.png', key: '6' },
  { file: 'qin-right-face.png', key: '7' },
]

for (const s of shots) {
  await page.keyboard.press(s.key)
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(out, s.file) })
  console.log('saved', s.file)
}

await browser.close()
