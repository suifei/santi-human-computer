import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'

const origin = process.env.CAPTURE_URL ?? 'http://127.0.0.1:5175'
const out = process.env.QA_OUT ?? join(process.env.TEMP || '/tmp', 'santi-qa-64')
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
await page.waitForTimeout(7000)
await page.evaluate(() => {
  const s = window.__santiSim?.getState()
  if (s && !s.muted) s.toggleMute()
})
await page.waitForFunction(() => typeof window.__santiLook === 'function', { timeout: 15000 })

await page.keyboard.press('2')
await page.waitForTimeout(1600)
await page.screenshot({ path: join(out, 'hotkey-2-top.png') })
console.log('saved hotkey-2-top')

await page.keyboard.press('6')
await page.waitForTimeout(1600)
await page.screenshot({ path: join(out, 'hotkey-6-command.png') })
console.log('saved hotkey-6-command')

await page.evaluate((c) => window.__santiLook(c), {
  x: 18.2, y: 2.85, z: -16.4, tx: 23.2, ty: 1.15, tz: -16.9,
})
await page.waitForTimeout(500)
await page.screenshot({ path: join(out, 'hotkey-6-stairs.png') })
console.log('saved hotkey-6-stairs')

await page.evaluate((c) => window.__santiLook(c), {
  x: 19.4, y: 3.15, z: -16.95, tx: 25, ty: 2.55, tz: -16.9,
})
await page.waitForTimeout(500)
await page.screenshot({ path: join(out, 'hotkey-6-faces.png') })
console.log('saved hotkey-6-faces')

await page.keyboard.press('4')
await page.waitForTimeout(1600)
await page.screenshot({ path: join(out, 'hotkey-4-drum.png') })
console.log('saved hotkey-4-drum')

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
await browser.close()
console.log('errors', errors.length ? errors.slice(0, 8) : 'none')
console.log('out', out)
