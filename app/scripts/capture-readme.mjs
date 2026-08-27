/** 重拍 README 演算场图：全景军令、俯瞰、程序档 CPU、程序近景 */
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
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
})

await page.goto(`${origin}/`, { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForFunction(() => window.__santiSim, { timeout: 30000 })
await page.evaluate(() => {
  const s = window.__santiSim.getState()
  if (!s.muted) s.toggleMute()
})
await page.getByRole('button', { name: '擊鼓入陣' }).click({ timeout: 20000, force: true })
await page.getByText('演算场', { exact: true }).waitFor({ timeout: 15000 })
await page.locator('canvas').waitFor()
await page.evaluate(async () => {
  await document.fonts.ready
  try { await document.fonts.load('400 64px ShuowenSeal') } catch {}
  try { await document.fonts.load('400 32px Qiji') } catch {}
})
await page.waitForTimeout(4200)

await page.evaluate(() => window.__santiSim.getState().inject())
await page.waitForFunction(() => window.__santiSim.getState().status === 'READY', { timeout: 15000 })
await page.waitForTimeout(800)
await page.evaluate(() => window.__santiSim.getState().setPreset('overview'))
await page.waitForTimeout(1600)
await page.mouse.move(1580, 20)
await page.screenshot({ path: join(out, '01-yard.png') })

await page.evaluate(() => window.__santiSim.getState().setPreset('top'))
await page.waitForTimeout(1600)
await page.mouse.move(1580, 20)
await page.screenshot({ path: join(out, '01-yard-top.png') })

await page.evaluate(() => window.__santiSim.getState().setMode('program'))
await page.waitForFunction(() => window.__santiSim.getState().netlist.stats.total === 2266, { timeout: 20000 })
await page.waitForTimeout(2400)
await page.evaluate(() => window.__santiSim.getState().setPreset('overview'))
await page.waitForTimeout(1500)
await page.mouse.move(800, 430)
await page.mouse.wheel(0, -320)
await page.waitForTimeout(800)
await page.mouse.move(1580, 20)
await page.screenshot({ path: join(out, '04-program.png') })

await page.evaluate(() => window.__santiSim.getState().setPreset('input'))
await page.waitForTimeout(1500)
await page.mouse.move(1580, 20)
await page.screenshot({ path: join(out, '05-program-input.png') })

await browser.close()
console.log('saved', out)
