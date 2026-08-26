/** 按用户构图重拍三张 README 图：演算场指令卡、原理整页、阵图整页 */
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const out = join(root, 'docs', 'screenshots')
const origin = process.env.CAPTURE_URL ?? 'http://127.0.0.1:4173'

await mkdir(out, { recursive: true })

const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-webgl'],
})

async function waitFonts(page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await document.fonts.load('400 64px ShuowenSeal')
    await document.fonts.load('400 32px Qiji')
  })
  await page.waitForTimeout(400)
}

/** 滚完整页，让 whileInView / GSAP 落到终态 */
async function revealPage(page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y < height; y += 420) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y)
    await page.waitForTimeout(120)
  }
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(500)
}

/** 拆掉 ScrollTrigger pin，避免整页截图像被拉长 */
async function unpin(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.pin-spacer').forEach((spacer) => {
      const pinned = spacer.firstElementChild
      if (!pinned) return
      spacer.parentNode?.insertBefore(pinned, spacer)
      const el = pinned
      el.style.removeProperty('position')
      el.style.removeProperty('top')
      el.style.removeProperty('left')
      el.style.removeProperty('width')
      el.style.removeProperty('margin')
      el.style.removeProperty('z-index')
      spacer.remove()
    })
  })
}

const page = await browser.newPage({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
})

await page.goto(`${origin}/`, { waitUntil: 'networkidle', timeout: 60000 })
await page.getByRole('button', { name: '擊鼓入陣' }).click({ timeout: 20000, force: true })
await page.getByText('演算场', { exact: true }).waitFor({ timeout: 15000 })
await page.waitForTimeout(5000)
await page.locator('canvas').waitFor()
await waitFonts(page)

await page.evaluate(() => window.__santiSim?.getState().select(600))
await page.waitForTimeout(120)
await page.evaluate(() => window.__santiSim?.getState().setPreset('input'))
await page.waitForTimeout(1600)
await page.screenshot({ path: join(out, '01-yard.png') })

const long = await browser.newPage({
  viewport: { width: 1400, height: 900 },
  deviceScaleFactor: 1,
})

await long.goto(`${origin}/principle`, { waitUntil: 'networkidle', timeout: 60000 })
await waitFonts(long)
await long.waitForTimeout(800)
await revealPage(long)
await unpin(long)
await long.evaluate(() => window.scrollTo(0, 0))
await long.waitForTimeout(400)
await long.screenshot({ path: join(out, '02-principle.png'), fullPage: true })

await long.goto(`${origin}/formation`, { waitUntil: 'networkidle', timeout: 60000 })
await waitFonts(long)
await long.waitForTimeout(800)
await revealPage(long)
const zone = long.getByLabel(/输入手·甲/)
if (await zone.count()) await zone.first().click()
await long.waitForTimeout(400)
await long.evaluate(() => window.scrollTo(0, 0))
await long.waitForTimeout(300)
await long.screenshot({ path: join(out, '03-formation.png'), fullPage: true })

await browser.close()
console.log('saved', out)
