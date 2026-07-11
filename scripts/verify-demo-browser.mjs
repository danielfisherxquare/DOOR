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

async function runAndWaitForSucceededJob(action, timeout = 60_000) {
  const completedJob = page.waitForResponse(async (response) => {
    if (!/\/api\/app\/jobs\/[^/]+$/.test(response.url()) || response.request().method() !== 'GET') return false;
    if (!response.ok()) return false;
    const payload = await response.json().catch(() => null);
    return payload?.data?.status === 'succeeded';
  }, { timeout });
  await action();
  return (await completedJob).json();
}

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

  const completedJobPayload = await runAndWaitForSucceededJob(
    () => page.getByRole('button', { name: '保存到数据库' }).click(),
  );

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

  await page.goto(`${baseUrl}/app/events/processing?tab=audit`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '名单处理' }).first().waitFor();
  const auditTab = page.getByRole('tab', { name: /清洗流水线/ });
  await auditTab.waitFor();
  if (await auditTab.getAttribute('aria-selected') !== 'true') await auditTab.click();
  await page.getByText('当前赛事总报名人数：3', { exact: true }).waitFor({ timeout: 15_000 });
  await page.getByRole('button', { name: '开始流水线' }).click();

  const auditSteps = ['未成年检查', '黑名单碰撞', '精英资质核验', '直通锁定', '大众池标记'];
  const auditResults = [];
  for (const [index, stepLabel] of auditSteps.entries()) {
    const executeButton = page.getByRole('button', { name: `执行 ${stepLabel}` });
    await executeButton.waitFor();
    await page.waitForFunction((label) => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === `执行 ${label}`);
      return button && !button.disabled;
    }, stepLabel);
    const jobPayload = await runAndWaitForSucceededJob(() => executeButton.click());
    const resultText = page.locator('.pipeline-result').filter({ hasText: /影响/ }).last();
    await resultText.waitFor();
    auditResults.push({
      step: stepLabel,
      text: (await resultText.innerText()).trim(),
      result: jobPayload.data?.result || null,
    });
    const confirmLabel = index === auditSteps.length - 1 ? '确认完成' : '确认进入下一步';
    const confirmButton = page.locator('button:enabled', { hasText: confirmLabel }).first();
    await confirmButton.waitFor();
    await confirmButton.click();
  }
  await page.getByText('五步二次清洗已全部完成。', { exact: false }).waitFor();
  result.checks.auditPipeline = { steps: auditResults };
  await page.screenshot({ path: resolve(evidenceDir, '09-audit-pipeline.png'), fullPage: true });

  await page.goto(`${baseUrl}/app/events/lottery`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '抽签管理' }).first().waitFor();
  await page.getByRole('tab', { name: /物资匹配与最终执行/ }).click();
  const initialV2ConfigPromise = page.waitForResponse((response) => (
    /\/api\/app\/lottery-v2\/config\/\d+$/.test(response.url()) && response.request().method() === 'GET'
  ));
  await page.getByRole('tab', { name: 'V2 测试版' }).click();
  await initialV2ConfigPromise;
  await page.getByRole('button', { name: '刷新数据' }).waitFor();
  const seedInput = page.getByLabel('随机种子');
  await seedInput.click();
  await seedInput.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await seedInput.pressSequentially('door-acceptance-20260711');
  await seedInput.press('Tab');
  assert.equal(await seedInput.inputValue(), 'door-acceptance-20260711');
  const configRequestPromise = page.waitForRequest((request) => (
    /\/api\/app\/lottery-v2\/config\/\d+$/.test(request.url()) && request.method() === 'PUT'
  ));
  const configResponsePromise = page.waitForResponse((response) => (
    /\/api\/app\/lottery-v2\/config\/\d+$/.test(response.url()) && response.request().method() === 'PUT'
  ));
  await page.getByRole('button', { name: '保存 V2 配置' }).click();
  const configRequest = await configRequestPromise;
  const configResponse = await configResponsePromise;
  const configRequestBody = configRequest.postDataJSON();
  const configResponseBody = await configResponse.json();
  assert.equal(configRequestBody.seed, 'door-acceptance-20260711');
  assert.equal(configResponseBody.data?.seed, 'door-acceptance-20260711');
  await page.getByText('V2 配置已保存，旧预演已标记为失效。', { exact: true }).waitFor();

  const previewJob = await runAndWaitForSucceededJob(
    () => page.getByRole('button', { name: '执行 V2 预演' }).click(),
  );
  await page.getByText('V2 预演完成，已刷新预演结果。', { exact: true }).waitFor();
  await page.getByText('ready', { exact: true }).first().waitFor();
  await page.screenshot({ path: resolve(evidenceDir, '10-lottery-v2-preview.png'), fullPage: true });

  page.once('dialog', (dialog) => dialog.accept());
  const finalizeJob = await runAndWaitForSucceededJob(
    () => page.getByRole('button', { name: '执行 V2 正式抽签' }).click(),
  );
  await page.getByText('V2 正式执行完成。', { exact: true }).waitFor();
  const finalizedCounts = {
    winners: Number(finalizeJob.data?.result?.resultSummary?.winners ?? 0),
    losers: Number(finalizeJob.data?.result?.resultSummary?.losers ?? 0),
    waitlist: Number(finalizeJob.data?.result?.resultSummary?.waitlist ?? 0),
  };
  assert.deepEqual(finalizedCounts, { winners: 2, losers: 1, waitlist: 0 });
  assert.equal(finalizeJob.data?.result?.seed, 'door-acceptance-20260711');
  result.checks.lotteryV2 = {
    preview: previewJob.data?.result || null,
    finalized: finalizeJob.data?.result || null,
    counts: finalizedCounts,
  };
  await page.screenshot({ path: resolve(evidenceDir, '11-lottery-v2-finalized.png'), fullPage: true });

  await page.goto(`${baseUrl}/app/events/bib`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '选手排号' }).first().waitFor();
  await page.getByText('已排号 0 / 可排号 2', { exact: true }).waitFor();
  await page.getByRole('button', { name: '预览排号结果（100人）' }).click();
  await page.getByText(/预计分配 2 人/).waitFor();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '执行排号（自动创建快照）' }).click();
  await page.getByText('排号完成：参与 2 人，不参与 1 人', { exact: true }).waitFor();
  await page.getByText('已排号 2 / 可排号 2', { exact: true }).waitFor();
  const assignedBibs = await page.locator('.bib-preview-item').evaluateAll((items) => items.map((item) => ({
    name: item.querySelector('.bib-preview-item__name')?.textContent?.trim() || '',
    bibNumber: item.querySelector('.bib-preview-item__number')?.textContent?.trim() || '',
  })));
  assert.equal(assignedBibs.length, 2);
  assert.equal(assignedBibs.every((item) => item.name && item.bibNumber), true);
  await page.screenshot({ path: resolve(evidenceDir, '12-bib-assigned.png'), fullPage: true });

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '回滚到上次执行前' }).click();
  await page.getByText('排号已回滚到上次执行前状态', { exact: true }).waitFor();
  await page.getByText('已排号 0 / 可排号 2', { exact: true }).waitFor();
  result.checks.bib = { assignedBibs, rolledBack: true };

  await page.goto(`${baseUrl}/app/bib-tracking`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '号牌布控' }).first().waitFor();
  await page.screenshot({ path: resolve(evidenceDir, '13-bib-tracking.png'), fullPage: true });

  await page.goto(`${baseUrl}/app/events/lottery`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '抽签管理' }).first().waitFor();
  await page.getByRole('tab', { name: /物资匹配与最终执行/ }).click();
  await page.getByRole('tab', { name: 'V2 测试版' }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '回滚 V2 结果' }).click();
  await page.getByText('V2 回滚完成。', { exact: true }).waitFor();

  const restoredRecordsPromise = page.waitForResponse((response) => (
    /\/api\/app\/records\/query$/.test(response.url()) && response.request().method() === 'POST'
  ));
  await page.goto(`${baseUrl}/app/events/records`, { waitUntil: 'domcontentloaded' });
  const restoredRecordsPayload = await (await restoredRecordsPromise).json();
  await page.getByRole('heading', { name: '名单管理' }).first().waitFor();
  await page.getByRole('cell', { name: '验收选手甲', exact: true }).waitFor();
  const restoredLotteryStatuses = (restoredRecordsPayload.data?.records || [])
    .filter((record) => record.lotteryStatus === '参与抽签')
    .length;
  assert.equal(restoredLotteryStatuses, 3);
  result.checks.lotteryV2.rolledBack = true;
  result.checks.lotteryV2.restoredLotteryStatuses = restoredLotteryStatuses;
  await page.screenshot({ path: resolve(evidenceDir, '14-lottery-v2-rolled-back.png'), fullPage: true });

  await page.goto(`${baseUrl}/ops`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: '执行工作台' }).waitFor();
  result.checks.ops = { url: page.url() };
  await page.screenshot({ path: resolve(evidenceDir, '15-ops.png'), fullPage: true });

  await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: '权限不足' }).waitFor();
  result.checks.adminDenied = { url: page.url() };
  await page.screenshot({ path: resolve(evidenceDir, '16-admin-denied.png'), fullPage: true });

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
