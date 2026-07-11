import assert from 'node:assert/strict'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import * as XLSX from 'xlsx'

const baseUrl = process.env.ARCSPRO_TEST_URL || process.env.URL || 'http://127.0.0.1:8088'
const username = process.env.ARCSPRO_TEST_USERNAME || 'east.ops'
const password = process.env.ARCSPRO_TEST_PASSWORD || 'ArcSproDemo@123'
const raceName = process.env.ARCSPRO_TEST_RACE || '上海国际马拉松'
const headless = process.env.HEADLESS !== 'false'
const runId = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
const projectName = `报销验收-${runId}`
const projectShortName = `报销${runId.slice(-6)}`
const evidenceDir = resolve(
  process.env.ARCSPRO_REIMBURSEMENT_EVIDENCE_DIR
    || 'output/remediation-acceptance-20260711/reimbursement',
)
const invoiceFixture = resolve('tests/reimbursement/fixtures/invoice-sample.jpg')
const paymentFixture = resolve('tests/reimbursement/fixtures/payment-receipt.png')

await mkdir(evidenceDir, { recursive: true })

const report = {
  baseUrl,
  raceName,
  projectName,
  context: null,
  steps: {},
  expectedExternalBlockers: [],
  expectedConsoleErrors: [],
  unexpectedApiFailures: [],
  unexpectedConsoleErrors: [],
  pageErrors: [],
  cleanup: null,
}

const browser = await chromium.launch({ headless })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.setDefaultTimeout(30_000)
page.setDefaultNavigationTimeout(30_000)

let activeStep = 'bootstrap'
let projectId = null

page.on('pageerror', (error) => {
  report.pageErrors.push({ step: activeStep, message: error.message, url: page.url() })
})

page.on('console', (message) => {
  if (message.type() !== 'error') return
  const entry = { step: activeStep, text: message.text(), url: page.url() }
  if (
    activeStep === 'recognize-without-key'
    && /识别失败|400 \(Bad Request\)/.test(entry.text)
  ) {
    report.expectedConsoleErrors.push(entry)
    return
  }
  report.unexpectedConsoleErrors.push(entry)
})

page.on('response', (response) => {
  if (response.status() < 400 || !response.url().includes('/api/')) return
  if (
    activeStep === 'recognize-without-key'
    && response.status() === 400
    && response.url().endsWith('/recognize')
  ) return
  report.unexpectedApiFailures.push({
    step: activeStep,
    method: response.request().method(),
    status: response.status(),
    url: response.url(),
  })
})

function workspaceUrl(path) {
  assert.ok(report.context?.orgId, 'workspace context should be available')
  const url = new URL(`${baseUrl}${path}`)
  url.searchParams.set('orgId', report.context.orgId)
  url.searchParams.set('raceId', report.context.raceId)
  return url.toString()
}

async function screenshot(name) {
  const target = resolve(evidenceDir, `${name}.png`)
  await page.screenshot({ path: target, fullPage: true })
  return target
}

async function chooseFile(buttonName, filePath) {
  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  const chooser = await chooserPromise
  await chooser.setFiles(filePath)
}

function waitForResponses(predicate, count) {
  return new Promise((resolveResponses, rejectResponses) => {
    const matches = []
    const timeout = setTimeout(() => {
      page.off('response', handleResponse)
      rejectResponses(new Error(`timed out waiting for ${count} matching responses; received ${matches.length}`))
    }, 30_000)
    const handleResponse = (response) => {
      if (!predicate(response)) return
      matches.push(response)
      if (matches.length < count) return
      clearTimeout(timeout)
      page.off('response', handleResponse)
      resolveResponses(matches)
    }
    page.on('response', handleResponse)
  })
}

async function createFixtureRecord(id) {
  return page.evaluate(async ({ targetProjectId, body }) => {
    const auth = JSON.parse(window.localStorage.getItem('auth-storage') || 'null')
    const workspace = JSON.parse(window.localStorage.getItem('workspace-session') || 'null')
    const token = auth?.state?.token
    const session = workspace?.state?.session || workspace?.session || workspace
    if (!token || !session?.orgId || !session?.raceId) {
      throw new Error('browser session is missing auth or workspace context')
    }

    const response = await fetch(`/api/app/reimbursements/projects/${targetProjectId}/records`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-ArcSpro-Scope-Type': session.scopeType,
        'X-ArcSpro-Org-Id': String(session.orgId),
        'X-ArcSpro-Race-Id': String(session.raceId),
      },
      body: JSON.stringify(body),
    })
    const payload = await response.json()
    return { status: response.status, payload }
  }, {
    targetProjectId: id,
    body: {
      payment_date: '2026-07-11',
      category: '赛事交通费',
      sub_category: '车辆调度',
      description: '报销验收交通费',
      income: 0,
      expense: 128.5,
      reporter: '验收操作员',
      has_invoice: true,
      invoice_code: 'TEST20260711',
      invoice_number: runId,
      company: 'ArcSpro 验收供应商',
      remarks: '由严格验收脚本注入，非 OCR 识别结果',
      unit_price: 128.5,
      unit: '次',
      quantity: 1,
    },
  })
}

async function deleteProjectFallback() {
  if (!projectId || page.isClosed()) return false
  return page.evaluate(async (targetProjectId) => {
    const auth = JSON.parse(window.localStorage.getItem('auth-storage') || 'null')
    const workspace = JSON.parse(window.localStorage.getItem('workspace-session') || 'null')
    const token = auth?.state?.token
    const session = workspace?.state?.session || workspace?.session || workspace
    if (!token || !session?.orgId || !session?.raceId) return false
    const response = await fetch(`/api/app/reimbursements/projects/${targetProjectId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-ArcSpro-Scope-Type': session.scopeType,
        'X-ArcSpro-Org-Id': String(session.orgId),
        'X-ArcSpro-Race-Id': String(session.raceId),
      },
    })
    return response.ok
  }, projectId).catch(() => false)
}

try {
  activeStep = 'login'
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.locator('#username').fill(username)
  await page.locator('#password').fill(password)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/workspaces(?:\?|$)/)
  await page.waitForFunction(() => document.querySelectorAll('select')[0]?.options.length > 1)
  await page.locator('select').nth(1).selectOption({ label: raceName })
  await page.getByRole('button', { name: /进入工作区/ }).click()
  await page.waitForURL(/\/launcher(?:\?|$)/)
  await page.getByRole('button', { name: /应用层/ }).click()
  await page.waitForURL(/\/app(?:\/|\?|$)/)

  const session = await page.evaluate(() => {
    const parsed = JSON.parse(window.localStorage.getItem('workspace-session') || 'null')
    return parsed?.state?.session || parsed?.session || parsed
  })
  assert.ok(session?.orgId, 'workspace session should include orgId')
  assert.ok(session?.raceId, 'workspace session should include raceId')
  report.context = { orgId: String(session.orgId), raceId: String(session.raceId) }
  report.steps.login = { ok: true }

  activeStep = 'create-project'
  await page.goto(workspaceUrl('/app/reimbursements'), { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: '我的报销', exact: true }).waitFor()
  await page.getByText('发票报销控制面', { exact: true }).waitFor()
  await page.getByText('需配置', { exact: false }).first().waitFor()

  const firstProjectButton = page.getByRole('button', { name: '创建第一个项目', exact: true })
  if (await firstProjectButton.isVisible().catch(() => false)) {
    await firstProjectButton.click()
  } else {
    await page.getByTitle('创建新项目').click()
  }

  await page.getByPlaceholder('例如：2026 上海差旅报销').fill(projectName)
  await page.getByPlaceholder('用于导出文件命名，可留空').fill(projectShortName)
  const createResponsePromise = page.waitForResponse((response) => (
    response.request().method() === 'POST'
    && /\/api\/app\/reimbursements\/projects$/.test(response.url())
  ))
  await page.getByRole('button', { name: '创建项目', exact: true }).click()
  const createResponse = await createResponsePromise
  assert.equal(createResponse.status(), 201)
  const createdProject = (await createResponse.json()).project
  projectId = createdProject.id
  assert.equal(createdProject.name, projectName)
  await assert.doesNotReject(async () => {
    await page.locator('.project-selector__select').waitFor()
    assert.equal(await page.locator('.project-selector__select').inputValue(), projectId)
  })
  report.steps.createProject = { ok: true, projectId }
  await screenshot('01-project-created')

  activeStep = 'import-invoice'
  const importResponsePromise = page.waitForResponse((response) => (
    response.request().method() === 'POST'
    && response.url().includes(`/api/app/reimbursements/projects/${projectId}/preview/import`)
  ))
  await chooseFile('导入发票', invoiceFixture)
  const importResponse = await importResponsePromise
  assert.equal(importResponse.status(), 200)
  const importPayload = await importResponse.json()
  assert.equal(importPayload.imported.length, 1)
  assert.equal(importPayload.duplicates.length, 0)
  await page.getByText(/已导入 1 个新文件/).waitFor()
  await page.getByRole('button', { name: '逐张识别 (1)', exact: true }).waitFor()
  report.steps.importInvoice = { ok: true, imported: 1 }
  await screenshot('02-invoice-imported')

  activeStep = 'deduplicate-import'
  const duplicateResponsePromise = page.waitForResponse((response) => (
    response.request().method() === 'POST'
    && response.url().includes(`/api/app/reimbursements/projects/${projectId}/preview/import`)
  ))
  await chooseFile('导入发票', invoiceFixture)
  const duplicateResponse = await duplicateResponsePromise
  assert.equal(duplicateResponse.status(), 200)
  const duplicatePayload = await duplicateResponse.json()
  assert.equal(duplicatePayload.imported.length, 0)
  assert.equal(duplicatePayload.duplicates.length, 1)
  await page.getByText(/跳过 1 个重复文件/).waitFor()
  report.steps.deduplicateImport = { ok: true, duplicates: 1 }

  activeStep = 'import-payment'
  const paymentResponsePromise = page.waitForResponse((response) => (
    response.request().method() === 'POST'
    && response.url().includes(`/api/app/reimbursements/projects/${projectId}/preview/import`)
  ))
  await chooseFile('导入付款凭证', paymentFixture)
  const paymentResponse = await paymentResponsePromise
  assert.equal(paymentResponse.status(), 200)
  const paymentPayload = await paymentResponse.json()
  assert.equal(paymentPayload.documentType, 'payment')
  assert.equal(paymentPayload.imported.length, 1)
  assert.equal(paymentPayload.duplicates.length, 0)
  await page.getByText(/已导入 1 个新文件/).waitFor()
  await page.getByRole('button', { name: '逐张识别 (2)', exact: true }).waitFor()
  report.steps.importPayment = { ok: true, imported: 1 }
  await screenshot('03-payment-imported')

  activeStep = 'recognize-without-key'
  const recognitionResponsesPromise = waitForResponses((response) => (
    response.request().method() === 'POST'
    && response.url().includes(`/api/app/reimbursements/projects/${projectId}/preview/`)
    && response.url().endsWith('/recognize')
  ), 2)
  await page.getByRole('button', { name: '逐张识别 (2)', exact: true }).click()
  const recognitionResponses = await recognitionResponsesPromise
  const recognitionPayloads = await Promise.all(recognitionResponses.map(async (response) => {
    assert.equal(response.status(), 400)
    return response.json()
  }))
  assert.deepEqual(recognitionPayloads.map((payload) => payload.error), [
    '请先配置模型 API',
    '请先配置模型 API',
  ])
  await page.getByText(/失败 2 个：请先配置模型 API/).waitFor()
  report.expectedExternalBlockers.push({
    step: activeStep,
    status: 400,
    calls: 2,
    error: '请先配置模型 API',
    reason: 'REIMBURSEMENT_OCR_API_KEY and DASHSCOPE_API_KEY are not configured',
  })
  report.steps.recognizeWithoutKey = { ok: true, expectedBlocked: true }
  await screenshot('04-ocr-key-blocker')

  activeStep = 'fixture-record'
  const fixtureRecord = await createFixtureRecord(projectId)
  assert.equal(fixtureRecord.status, 201)
  assert.equal(fixtureRecord.payload.record.description, '报销验收交通费')
  report.steps.fixtureRecord = {
    ok: true,
    recordId: fixtureRecord.payload.record.id,
    source: 'test fixture, not OCR',
  }

  activeStep = 'export-excel'
  await page.goto(workspaceUrl('/app/reimbursements'), { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /报销明细/ }).click()
  const recordRow = page.getByRole('row').filter({ hasText: '报销验收交通费' })
  await recordRow.waitFor()
  await recordRow.getByText('128.50', { exact: false }).waitFor()
  await screenshot('05-record-ready-for-export')

  page.once('dialog', (dialog) => dialog.accept())
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 Excel', exact: true }).click()
  const download = await downloadPromise
  const suggestedFilename = download.suggestedFilename()
  assert.match(suggestedFilename, /\.xlsx$/i)
  assert.ok(suggestedFilename.includes(projectShortName))
  const exportPath = resolve(evidenceDir, suggestedFilename)
  await download.saveAs(exportPath)
  assert.ok((await stat(exportPath)).size > 0)

  const workbook = XLSX.read(await readFile(exportPath), { type: 'buffer' })
  assert.ok(workbook.SheetNames.length >= 1)
  const workbookText = workbook.SheetNames
    .map((name) => JSON.stringify(XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 })))
    .join('\n')
  assert.match(workbookText, /报销验收交通费/)
  assert.match(workbookText, /128\.5/)
  report.steps.exportExcel = {
    ok: true,
    filename: suggestedFilename,
    bytes: (await stat(exportPath)).size,
    sheetNames: workbook.SheetNames,
  }
  await screenshot('06-export-complete')

  activeStep = 'cleanup'
  await page.goto(workspaceUrl('/app/reimbursements/projects'), { waitUntil: 'networkidle' })
  const projectRow = page.getByRole('row').filter({ hasText: projectName })
  await projectRow.waitFor()
  page.once('dialog', (dialog) => dialog.accept())
  const deleteResponsePromise = page.waitForResponse((response) => (
    response.request().method() === 'DELETE'
    && response.url().endsWith(`/api/app/reimbursements/projects/${projectId}`)
  ))
  await projectRow.getByRole('button', { name: '删除', exact: true }).click()
  const deleteResponse = await deleteResponsePromise
  assert.equal(deleteResponse.status(), 200)
  await projectRow.waitFor({ state: 'detached' })
  report.cleanup = { ok: true, mode: 'ui' }
  projectId = null

  assert.deepEqual(report.unexpectedApiFailures, [])
  assert.deepEqual(report.unexpectedConsoleErrors, [])
  assert.deepEqual(report.pageErrors, [])
  report.ok = true
} catch (error) {
  report.ok = false
  report.error = error instanceof Error ? error.stack : String(error)
  report.failureUrl = page.url()
  report.failureBody = await page.locator('body').innerText().catch(() => '')
  await screenshot('failure').catch(() => undefined)
  throw error
} finally {
  if (projectId) {
    report.cleanup = {
      ok: await deleteProjectFallback(),
      mode: 'api-fallback',
    }
  }
  await writeFile(resolve(evidenceDir, 'result.json'), `${JSON.stringify(report, null, 2)}\n`)
  await browser.close()
}

console.log(JSON.stringify(report, null, 2))
