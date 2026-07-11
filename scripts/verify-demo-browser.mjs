import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.ARCSPRO_BASE_URL || 'http://127.0.0.1:8088').replace(/\/$/, '');
const evidenceDir = resolve(
  process.env.ARCSPRO_EVIDENCE_DIR || 'output/remediation-acceptance-20260711',
);
const username = process.env.ARCSPRO_DEMO_USERNAME || 'east.ops';
const password = process.env.ARCSPRO_DEMO_PASSWORD || 'ArcSproDemo@123';
const raceName = process.env.ARCSPRO_DEMO_RACE || '上海国际马拉松';
const registrationFixture = resolve(
  process.env.ARCSPRO_REGISTRATION_FIXTURE || 'tests/fixtures/acceptance-registration.csv',
);

await mkdir(evidenceDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const consoleErrors = [];
const failedRequests = [];

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(error.message));
page.on('response', (response) => {
  if (response.status() >= 400) {
    failedRequests.push({ status: response.status(), url: response.url() });
  }
});

const result = {
  baseUrl,
  account: username,
  raceName,
  checks: {},
  consoleErrors,
  failedRequests,
};

try {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL(/\/workspaces(?:\?|$)/, { timeout: 15_000 });
  await page.waitForFunction(() => document.querySelectorAll('select')[0]?.options.length > 1);

  const organizations = await page.locator('select').first().locator('option').allTextContents();
  const scopes = await page.locator('select').nth(1).locator('option').allTextContents();
  assert.ok(organizations.includes('华东悦跑体育运营中心'));
  assert.ok(scopes.includes(raceName));
  result.checks.workspace = { organizations, scopes };
  await page.screenshot({ path: resolve(evidenceDir, '01-workspace.png'), fullPage: true });

  await page.locator('select').nth(1).selectOption({ label: raceName });
  await page.getByRole('button', { name: /进入工作区/ }).click();
  await page.waitForURL(/\/launcher(?:\?|$)/, { timeout: 15_000 });
  await page.getByRole('heading', { name: '选择入口' }).waitFor();

  const surfaces = await page.locator('.workspace-entry__surface-title').allTextContents();
  assert.deepEqual(surfaces.sort(), ['应用层', '执行层'].sort());
  result.checks.launcher = { surfaces };
  await page.screenshot({ path: resolve(evidenceDir, '02-launcher.png'), fullPage: true });

  await page.getByRole('button', { name: /应用层/ }).click();
  await page.waitForURL(/\/app(?:\/|$)/, { timeout: 15_000 });
  await page.locator('body').getByText('赛事管理', { exact: true }).first().waitFor();
  result.checks.app = { url: page.url() };
  await page.screenshot({ path: resolve(evidenceDir, '03-app.png'), fullPage: true });

  await page.goto(`${baseUrl}/app/events/import`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '名单导入' }).first().waitFor();
  await page.locator('input[type="file"]').setInputFiles(registrationFixture);
  await page.getByText('3 行数据', { exact: true }).waitFor({ timeout: 15_000 });
  await page.screenshot({ path: resolve(evidenceDir, '04-import-upload.png'), fullPage: true });

  await page.getByRole('button', { name: /进入字段映射/ }).click();
  await page.getByRole('heading', { name: '字段映射' }).first().waitFor();
  const continueCleaning = page.getByRole('button', { name: /继续清洗/ });
  await continueCleaning.waitFor();
  assert.equal(await continueCleaning.isEnabled(), true);
  await page.screenshot({ path: resolve(evidenceDir, '05-import-mapping.png'), fullPage: true });
  await continueCleaning.click();

  const previewSave = page.getByRole('button', { name: /预览保存/ });
  await previewSave.waitFor();
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes('预览保存'));
    return button && !button.disabled;
  }, null, { timeout: 30_000 });
  await page.screenshot({ path: resolve(evidenceDir, '06-import-cleaning.png'), fullPage: true });
  await previewSave.click();

  await page.getByRole('heading', { name: '最终预览' }).first().waitFor();
  await page.getByText('显示前 3 条，共 3 条记录', { exact: true }).waitFor();
  await page.screenshot({ path: resolve(evidenceDir, '07-import-preview.png'), fullPage: true });

  const completedJob = page.waitForResponse(async (response) => {
    if (!/\/api\/app\/jobs\/[^/]+$/.test(response.url()) || response.request().method() !== 'GET') return false;
    if (!response.ok()) return false;
    const payload = await response.json().catch(() => null);
    return payload?.data?.status === 'succeeded';
  }, { timeout: 60_000 });
  await page.getByRole('button', { name: '保存到数据库' }).click();
  const completedJobPayload = await (await completedJob).json();

  await page.goto(`${baseUrl}/app/events/records`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '名单管理' }).first().waitFor();
  const importedNames = ['验收选手甲', '验收选手乙', '验收选手丙'];
  for (const importedName of importedNames) {
    await page.getByText(importedName, { exact: true }).first().waitFor({ timeout: 15_000 });
  }
  result.checks.importRecords = {
    importedNames,
    jobResult: completedJobPayload.data?.result || null,
    url: page.url(),
  };
  await page.screenshot({ path: resolve(evidenceDir, '08-records.png'), fullPage: true });

  await page.goto(`${baseUrl}/ops`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: '执行工作台' }).waitFor();
  result.checks.ops = { url: page.url() };
  await page.screenshot({ path: resolve(evidenceDir, '09-ops.png'), fullPage: true });

  await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: '权限不足' }).waitFor();
  result.checks.adminDenied = { url: page.url() };
  await page.screenshot({ path: resolve(evidenceDir, '10-admin-denied.png'), fullPage: true });

  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(failedRequests, []);
  result.ok = true;
} catch (error) {
  result.ok = false;
  result.error = error.stack || error.message;
  await page.screenshot({ path: resolve(evidenceDir, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await writeFile(resolve(evidenceDir, 'entry-result.json'), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  await browser.close();
}
