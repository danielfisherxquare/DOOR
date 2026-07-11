import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const baseUrl = process.env.ARCSPRO_BASE_URL || 'http://127.0.0.1:8088'
const username = process.env.ARCSPRO_DEMO_USERNAME || 'east.ops'
const password = process.env.ARCSPRO_DEMO_PASSWORD || 'ArcSproDemo@123'
const raceName = process.env.ARCSPRO_DEMO_RACE || '上海国际马拉松'
const runId = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
const credentialPersonName = `验收制证-${runId}`
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
  credentialLifecycle: null,
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

  await page.locator('label').filter({ hasText: '创建方式' }).locator('select').selectOption('admin_direct')
  await page.locator('label').filter({ hasText: '证件类别' }).locator('select').selectOption({ label: '赛事执行（需审核）' })
  await page.getByLabel('姓名', { exact: true }).fill(credentialPersonName)
  await page.getByLabel('单位名称', { exact: true }).fill('ArcSpro 验收组')
  await page.getByLabel('职务', { exact: true }).fill('终点执行主管')
  await page.getByText('终点核心区', { exact: true }).waitFor()

  const createResponsePromise = page.waitForResponse((response) => (
    response.request().method() === 'POST'
    && /\/api\/app\/credentials\/requests\/\d+$/.test(response.url())
  ))
  await page.getByRole('button', { name: '提交请求', exact: true }).click()
  const createResponse = await createResponsePromise
  assert.equal(createResponse.status(), 201)
  const createdRequest = (await createResponse.json()).data
  assert.equal(createdRequest.status, 'submitted')
  await page.getByText('请求已提交，申请池已刷新', { exact: true }).waitFor()
  const createdRow = page.getByRole('row').filter({ hasText: credentialPersonName })
  await createdRow.getByText('待审核', { exact: true }).waitFor()
  await page.screenshot({ path: resolve(evidenceDir, 'credential-01-request-submitted.png'), fullPage: true })

  await openSurface({ key: 'credential-review', path: '/app/credential/review', heading: '审核中心' })
  const reviewRow = page.getByRole('row').filter({ hasText: credentialPersonName })
  await reviewRow.getByRole('button', { name: '去审核', exact: true }).click()
  await page.getByText(`审核 ${credentialPersonName}`, { exact: true }).waitFor()
  assert.equal(
    await page.locator('label').filter({ hasText: '最终证件类别' }).locator('select').inputValue(),
    String(createdRequest.categoryId),
  )

  const reviewResponsePromise = page.waitForResponse((response) => (
    response.request().method() === 'POST'
    && new RegExp(`/api/app/credentials/requests/\\d+/${createdRequest.id}/review$`).test(response.url())
  ))
  await page.getByRole('button', { name: '确认审核结果', exact: true }).click()
  const reviewResponse = await reviewResponsePromise
  assert.equal(reviewResponse.status(), 200)
  const reviewedRequest = (await reviewResponse.json()).data
  assert.equal(reviewedRequest.status, 'generated')
  assert.ok(reviewedRequest.credentialId)
  assert.equal(reviewedRequest.credentialStatus, 'generated')
  await page.getByText('审核完成，列表已刷新', { exact: true }).waitFor()
  await page.getByRole('button', { name: '全部请求', exact: true }).click()
  const generatedRow = page.getByRole('row').filter({ hasText: credentialPersonName })
  await generatedRow.getByText('已生成', { exact: true }).waitFor()
  await page.screenshot({ path: resolve(evidenceDir, 'credential-02-generated.png'), fullPage: true })

  await openSurface({ key: 'credential-issue', path: '/app/credential/issue', heading: '领取管理' })
  await page.getByPlaceholder('搜索姓名 / 编号 / 岗位').fill(credentialPersonName)
  const issueRow = page.getByRole('row').filter({ hasText: credentialPersonName })
  await issueRow.getByRole('button', { name: '去发放', exact: true }).click()
  assert.equal(await page.getByLabel('领取人姓名', { exact: true }).inputValue(), credentialPersonName)

  const issueResponsePromise = page.waitForResponse((response) => (
    response.request().method() === 'POST'
    && new RegExp(`/api/app/credentials/credentials/\\d+/${reviewedRequest.credentialId}/issue$`).test(response.url())
  ))
  await page.getByRole('button', { name: '确认发放', exact: true }).click()
  const issueResponse = await issueResponsePromise
  assert.equal(issueResponse.status(), 200)
  await page.getByText('证件发放完成', { exact: true }).waitFor()
  await issueRow.getByText('已领取', { exact: true }).waitFor()
  await page.screenshot({ path: resolve(evidenceDir, 'credential-03-issued.png'), fullPage: true })
  report.credentialLifecycle = {
    personName: credentialPersonName,
    requestId: createdRequest.id,
    credentialId: reviewedRequest.credentialId,
    requestStatus: reviewedRequest.status,
    credentialStatus: 'issued',
  }

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
