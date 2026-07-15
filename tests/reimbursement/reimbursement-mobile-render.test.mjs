import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { chromium } from 'playwright';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const baseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173';

const authzProfile = {
  orgId: 'qa-org',
  raceId: '',
  scopeType: 'org',
  surfaces: ['app'],
  modules: [
    'app:home',
    'app:reimbursements',
    'app:import',
    'app:inventory',
    'app:map',
    'app:credentials',
    'app:design-requests',
    'app:interview',
  ],
};

const user = {
  id: 'qa-user',
  username: 'qa-user',
  email: 'qa@example.com',
  role: 'org_admin',
  defaultSurface: 'app',
  orgId: 'qa-org',
  preferences: { lastOrgId: 'qa-org', lastRaceId: '' },
  surfaceAccess: { app: true },
  moduleAccess: authzProfile.modules,
  authzProfile,
};

const workspaceSession = {
  orgId: 'qa-org',
  orgName: 'QA Org',
  raceId: '',
  raceName: '',
  scopeType: 'org',
  surface: 'app',
  lastAppPath: '/app/reimbursements',
  lastOpsPath: '/ops',
  lastAdminPath: '/admin',
};

const project = {
  id: 'project-1',
  name: '移动报销 QA 项目',
  status: 'active',
  record_count: 2,
  total_income: 0,
  total_expense: 376.5,
};

const records = [
  {
    id: 'record-1',
    index: 1,
    payment_date: '2026-07-05',
    category: '交通',
    sub_category: '打车',
    description: '机场接驳',
    income: 0,
    expense: 128.5,
    reporter: '王测试',
    has_invoice: true,
    company: '成都测试出行有限公司',
    remarks: '手机端复核样例',
    preview_file_id: 'preview-1',
    attachments: [{ id: 'attachment-1', file_type: 'invoice', original_name: 'invoice.jpg' }],
    ocr_review: { needsReview: false, issueCount: 0 },
  },
  {
    id: 'record-2',
    index: 2,
    payment_date: '2026-07-05',
    category: '餐饮',
    sub_category: '工作餐',
    description: '项目工作餐',
    income: 0,
    expense: 248,
    reporter: '王测试',
    has_invoice: false,
    company: '',
    remarks: '',
    preview_file_id: 'preview-2',
    attachments: [],
    ocr_review: { needsReview: true, issueCount: 2 },
  },
];

const previewFiles = [
  { id: 'preview-1', originalName: '手机发票.jpg', fileName: 'invoice.jpg', status: 'preview' },
  { id: 'preview-2', originalName: '付款凭证.jpg', fileName: 'payment.jpg', status: 'ocr_processing' },
];

const pendingMatches = [
  {
    id: 'match-1',
    payment_data: { amount: 128.5, date: '2026-07-05', payee: '成都测试出行有限公司' },
    candidates: [records[0]],
  },
];

function responseFor(pathname) {
  if (pathname === '/api/auth/me') return { success: true, data: user };
  if (pathname === '/api/authz/profile') return { success: true, data: authzProfile };
  if (pathname === '/api/app/reimbursements/settings') {
    return {
      settings: {
        defaultReporter: '王测试',
        hasServerLlmConfig: true,
        llmConfig: { provider: 'qwen', baseUrl: 'https://example.invalid', modelName: 'qwen-test' },
      },
    };
  }
  if (pathname === '/api/app/reimbursements/projects') return { projects: [project] };
  if (pathname === '/api/app/reimbursements/projects/project-1/records') return { records };
  if (pathname === '/api/app/reimbursements/projects/project-1/stats') {
    return { stats: { pending: 1, processing: 1, completed: 1, skipped: 0, errored: 0 } };
  }
  if (pathname === '/api/app/reimbursements/projects/project-1/pending-matches') return { matches: pendingMatches };
  if (pathname === '/api/app/reimbursements/projects/project-1/preview/list') return { list: previewFiles };
  if (pathname === '/api/app/reimbursements/projects/project-1/preview/stats') {
    return { stats: { total: 2, preview: 1, recognized: 1, duplicates: 0 } };
  }
  return { success: true };
}

async function installApiMocks(page) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/')) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responseFor(url.pathname)),
    });
  });

  await page.addInitScript(({ userState, sessionState }) => {
    window.localStorage.setItem('auth-storage', JSON.stringify({
      state: {
        user: userState,
        token: 'qa-token',
        refreshToken: 'qa-refresh',
        isAuthenticated: true,
      },
      version: 0,
    }));
    window.localStorage.setItem('workspace-session', JSON.stringify({
      state: { session: sessionState },
      version: 0,
    }));
  }, { userState: user, sessionState: workspaceSession });
}

test('reimbursement mobile route renders without horizontal overflow', async () => {
  const screenshotPath = join(root, 'tmp', 'reimbursement-mobile-render.png');
  const reportPath = join(root, 'tmp', 'reimbursement-mobile-render.json');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const consoleErrors = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(error.message);
  });

  try {
    await installApiMocks(page);
    await page.goto(baseUrl + '/app/reimbursements', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.reimbursement-mobile-home', { timeout: 15000 });
    await page.waitForSelector('.mobile-ocr-queue', { timeout: 15000 });
    await page.waitForTimeout(500);

    const homeMetrics = await page.evaluate(() => {
      const mobileContent = document.querySelector('.reimbursement-tool__mobile-content');
      const desktopContent = document.querySelector('.reimbursement-tool__desktop-content');
      return {
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        hasMobileHome: Boolean(document.querySelector('.reimbursement-mobile-home')),
        hasQueue: Boolean(document.querySelector('.mobile-ocr-queue')),
        hasReviewCard: Boolean(document.querySelector('.mobile-review-card')),
        hasDock: Boolean(document.querySelector('.workspace-mobile-dock')),
        mobileDisplay: mobileContent ? getComputedStyle(mobileContent).display : '',
        desktopDisplay: desktopContent ? getComputedStyle(desktopContent).display : '',
      };
    });

    await page.getByRole('button', { name: '处理冲突' }).click();
    await page.waitForSelector('.matching-modal--mobile-wizard', { timeout: 5000 });
    const modalMetrics = await page.evaluate(() => {
      const overlay = document.querySelector('.matching-modal-overlay');
      const modal = document.querySelector('.matching-modal--mobile-wizard');
      return {
        overlayAlignItems: overlay ? getComputedStyle(overlay).alignItems : '',
        bottom: modal ? getComputedStyle(modal).bottom : '',
        hasPaymentStep: Boolean(document.querySelector('.matching-modal__wizard-step--payment')),
        hasCandidatesStep: Boolean(document.querySelector('.matching-modal__wizard-step--candidates')),
      };
    });
    await page.locator('.matching-modal__close').click();

    await page.getByRole('tab', { name: /报销明细/ }).click();
    await page.waitForSelector('.reimbursement-mobile-record-card', { timeout: 5000 });
    const recordMetrics = await page.evaluate(() => {
      const tableScroll = document.querySelector('.app-h5-table-scroll');
      const tableCards = document.querySelector('.app-h5-table-cards');
      return {
        cardCount: document.querySelectorAll('.reimbursement-mobile-record-card').length,
        tableScrollDisplay: tableScroll ? getComputedStyle(tableScroll).display : '',
        tableCardsDisplay: tableCards ? getComputedStyle(tableCards).display : '',
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      };
    });

    await page.screenshot({ path: screenshotPath, fullPage: true });

    assert.equal(homeMetrics.hasMobileHome, true, 'mobile reimbursement home should render');
    assert.equal(homeMetrics.hasQueue, true, 'mobile OCR queue should render');
    assert.equal(homeMetrics.hasReviewCard, true, 'mobile review cards should render');
    assert.equal(homeMetrics.hasDock, true, 'app mobile dock should render');
    assert.equal(homeMetrics.mobileDisplay, 'block', 'mobile reimbursement surface should be visible');
    assert.equal(homeMetrics.desktopDisplay, 'none', 'desktop preview workspace should be hidden on phone viewport');
    assert.ok(homeMetrics.scrollWidth <= homeMetrics.innerWidth + 1, 'mobile import view should not overflow horizontally');
    assert.equal(modalMetrics.overlayAlignItems, 'flex-end', 'matching modal overlay should align as bottom sheet');
    assert.equal(modalMetrics.bottom, '0px', 'matching modal should be anchored to bottom');
    assert.equal(modalMetrics.hasPaymentStep, true, 'matching modal should show payment wizard step');
    assert.equal(modalMetrics.hasCandidatesStep, true, 'matching modal should show candidates wizard step');
    assert.ok(recordMetrics.cardCount >= 2, 'record tab should render mobile record cards');
    assert.equal(recordMetrics.tableScrollDisplay, 'none', 'desktop table should be hidden when mobile cards are active');
    assert.equal(recordMetrics.tableCardsDisplay, 'grid', 'mobile record cards should be visible');
    assert.ok(recordMetrics.scrollWidth <= recordMetrics.innerWidth + 1, 'mobile record view should not overflow horizontally');
    assert.deepEqual(consoleErrors, [], 'render should not emit console or page errors');

    writeFileSync(reportPath, JSON.stringify({ homeMetrics, modalMetrics, recordMetrics, screenshotPath }, null, 2));
  } finally {
    await browser.close();
  }
});
