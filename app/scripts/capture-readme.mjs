/** 从正在跑的预览里截真实画面，写入 docs/screenshots/ */
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const out = join(root, 'docs', 'screenshots')
const origin = process.env.CAPTURE_URL ?? 'http://127.0.0.1:3000'

await mkdir(out, { recursive: true })

const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-webgl'],
})
const page = await browser.newPage({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
})

await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.getByRole('button', { name: '擊鼓入陣' }).click({ timeout: 20000, force: true })
await page.getByText('演算场', { exact: true }).waitFor({ timeout: 15000 })
await page.waitForTimeout(4800)
await page.locator('canvas').waitFor()
await page.getByRole('button', { name: '注入方阵' }).click({ force: true })
await page.waitForTimeout(1200)
await page.getByRole('button', { name: '注入列' }).click()
await page.waitForTimeout(1600)
await page.screenshot({ path: join(out, '01-yard.png') })
await page.getByRole('button', { name: '俯瞰布阵' }).click()
await page.waitForTimeout(1600)
await page.screenshot({ path: join(out, '01-yard-top.png') })

await page.goto(`${origin}/principle`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1800)
await page.screenshot({ path: join(out, '02-principle.png') })

await page.goto(`${origin}/formation`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1800)
await page.screenshot({ path: join(out, '03-formation.png') })

await browser.close()
console.log('saved', out)
