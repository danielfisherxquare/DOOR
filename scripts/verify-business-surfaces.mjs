import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const baseUrl = process.env.ARCSPRO_BASE_URL || 'http://127.0.0.1:8088'
const username = process.env.ARCSPRO_DEMO_USERNAME || 'east.ops'
const password = process.env.ARCSPRO_DEMO_PASSWORD || 'ArcSproDemo@123'
const raceName = process.env.ARCSPRO_DEMO_RACE || '上海国际马拉松'
const evidenceDir = resolve(
  process.env.ARCSPRO_EVIDENCE_DIR || 'output/remediation-acceptance-20260711/business-surfaces',
)

await mkdir(evidenceDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const report = {
  baseUrl,
  raceName,
  context: null,
  surfaces: {},
  consoleErrors: [],
  pageErrors: [],
  failedRequests: [],
  resourceFailures: [],
}

let activeSurface = 'bootstrap'

page.on('console', (message) => {
  if (message.type() !== 'error') return
  report.consoleErrors.push({ surface: activeSurface, text: message.text(), url: page.url() })
})

page.on('pageerror', (error) => {
  report.pageErrors.push({ surface: activeSurface, message: error.message, url: page.url() })
})

page.on('response', (response) => {
  if (response.status() < 400) return
  const failure = {
    surface: activeSurface,
    method: response.request().method(),
    status: response.status(),
    url: response.url(),
  }
  report.resourceFailures.push(failure)
  if (response.url().includes('/api/')) report.failedRequests.push(failure)
})

async function openSurface({ key, path, heading, settleMs = 500 }) {
  activeSurface = key
  const context = report.context
  const url = new URL(`${baseUrl}${path}`)
  url.searchParams.set('orgId', context.orgId)
  if (context.raceId) url.searchParams.set('raceId', context.raceId)

  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.getByRole('heading', { name: heading, exact: true }).first().waitFor({ timeout: 30_000 })
  await page.waitForTimeout(settleMs)

  const bodyText = await page.locator('body').innerText()
  assert.doesNotMatch(bodyText, /ACCESS DENIED|权限不足/)
  report.surfaces[key] = {
    url: page.url(),
    heading,
    apiFailures: report.failedRequests.filter((item) => item.surface === key),
  }
  await page.screenshot({ path: resolve(evidenceDir, `${key}.png`), fullPage: true })
}

try {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.locator('#username').fill(username)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForURL(/\/workspaces(?:\?|$)/, { timeout: 15_000 })
  await page.waitForFunction(() => document.querySelectorAll('select')[0]?.options.length > 1)

  await page.locator('select').nth(1).selectOption({ label: raceName })
  await page.getByRole('button', { name: /进入工作区/ }).click()
  await page.waitForURL(/\/launcher(?:\?|$)/, { timeout: 15_000 })
  await page.getByRole('button', { name: /应用层/ }).click()
  await page.waitForURL(/\/app(?:\/|\?|$)/, { timeout: 15_000 })

  const session = await page.evaluate(() => {
    const raw = window.localStorage.getItem('workspace-session')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.state?.session || parsed?.session || parsed
  })
  assert.ok(session?.orgId, 'workspace session should include orgId')
  assert.ok(session?.raceId, 'workspace session should include raceId')
  report.context = { orgId: String(session.orgId), raceId: String(session.raceId) }

  await openSurface({
    key: 'clothing',
    path: '/app/events/clothing',
    heading: '服装物资',
  })
  const clothingTotals = (await page.locator('.clothing-card-total').allTextContents())
    .map((value) => Number(value))
    .filter(Number.isFinite)
  assert.equal(clothingTotals.reduce((sum, value) => sum + value, 0), 6)
  assert.equal(clothingTotals.filter((value) => value > 0).length, 3)
  report.surfaces.clothing.totalInventoryFromCards = 6
  report.surfaces.clothing.nonEmptyInventoryCards = 3

  await openSurface({ key: 'reimbursements', path: '/app/reimbursements', heading: '我的报销' })
  await openSurface({ key: 'credential-center', path: '/app/credential-center', heading: '证件中心' })
  await openSurface({ key: 'credential-requests', path: '/app/credential/requests', heading: '申请与建单' })
  await openSurface({ key: 'credential-review', path: '/app/credential/review', heading: '审核中心' })
  await openSurface({ key: 'inventory', path: '/app/inventory', heading: '仓储作业台' })
  await openSurface({ key: 'three-studio', path: '/app/3d-studio', heading: '空间工作台' })
  await openSurface({ key: 'terrain-model', path: '/app/terrain-model', heading: '轨迹地形模型' })
  await openSurface({ key: 'map', path: '/app/map', heading: 'GIS 地图', settleMs: 2_500 })

  assert.deepEqual(report.failedRequests, [])
  assert.deepEqual(report.consoleErrors, [])
  report.ok = true
} catch (error) {
  report.ok = false
  report.error = error instanceof Error ? error.stack : String(error)
  report.failureUrl = page.url()
  report.failureBody = await page.locator('body').innerText().catch(() => '')
  await page.screenshot({ path: resolve(evidenceDir, 'failure.png'), fullPage: true }).catch(() => {})
  throw error
} finally {
  await writeFile(resolve(evidenceDir, 'result.json'), `${JSON.stringify(report, null, 2)}\n`)
  await browser.close()
}

console.log(JSON.stringify(report, null, 2))
