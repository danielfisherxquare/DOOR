import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const mockUser = {
  id: 'codex-map-user',
  username: 'codex-map-user',
  orgId: 'org-codex',
  role: 'org_admin',
  defaultSurface: 'app',
  mustChangePassword: false,
  surfaceAccess: { app: true, admin: true, ops: true },
  scopedCapabilities: { inventory: ['3d_studio'] },
  moduleAccess: ['app:home', 'app:profile', 'app:map', 'app:3d-studio'],
  authzProfile: {
    scopeType: 'org',
    orgId: 'org-codex',
    raceId: null,
    surfaces: ['app', 'admin', 'ops'],
    modules: ['app:home', 'app:profile', 'app:map', 'app:3d-studio'],
    scopedCapabilities: { inventory: ['3d_studio'] },
  },
  preferences: {},
};
async function startViteServer() {
  if (process.env.MAP_E2E_BASE_URL) {
    return {
      baseUrl: process.env.MAP_E2E_BASE_URL.replace(/\/$/, ''),
      cleanup: async () => {},
    };
  }

  const port = process.env.MAP_E2E_PORT || String(4310 + (process.pid % 1000));
  const baseUrl = `http://127.0.0.1:${port}`;
  const viteBin = path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(
    process.execPath,
    [viteBin, '--host', '127.0.0.1', '--port', port, '--strictPort'],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        BROWSER: 'none',
        // Keep the provider-failure fixture deterministic even when a developer
        // has a valid token in a local .env file.
        VITE_CESIUM_ION_TOKEN: 'invalid-e2e-token',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let log = '';
  child.stdout.on('data', (chunk) => {
    log += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    log += chunk.toString();
  });

  const started = Date.now();
  while (Date.now() - started < 30_000) {
    if (child.exitCode != null) {
      throw new Error(`Vite exited before serving ${baseUrl}:\n${log}`);
    }
    try {
      const response = await fetch(baseUrl);
      if (response.ok) {
        return {
          baseUrl,
          cleanup: async () => stopProcess(child),
        };
      }
    } catch {
      // keep waiting
    }
    await delay(250);
  }

  await stopProcess(child);
  throw new Error(`Timed out waiting for Vite at ${baseUrl}:\n${log}`);
}

async function stopProcess(child) {
  if (!child || child.exitCode != null) return;
  child.kill('SIGTERM');
  const exited = await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(3_000).then(() => false),
  ]);
  if (exited === false && child.exitCode == null) {
    child.kill('SIGKILL');
  }
}

async function openMapPage(browser, baseUrl, options = {}) {
  const page = await browser.newPage({
    viewport: { width: 2048, height: 1000 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
  });
  const apiCalls = [];
  const consoleErrors = [];

  page.on('pageerror', (error) => {
    consoleErrors.push(`pageerror: ${error.message}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(`console: ${message.text()}`);
    }
  });

  await page.route(`${baseUrl}/api/**`, async (route) => {
    const request = route.request();
    const url = request.url();
    apiCalls.push({ method: request.method(), url, postData: request.postData() });

    if (url.includes('/api/auth/me')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: mockUser }),
      });
      return;
    }
    if (url.includes('/api/authz/profile')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: mockUser.authzProfile }),
      });
      return;
    }
    if (url.includes('/api/profile/context-options')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { organizations: [{ id: 'org-codex', name: 'Codex Org' }], races: [] },
        }),
      });
      return;
    }
    if (url.includes('/api/app/3d-studio/asset-templates')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
      return;
    }
    if (url.includes('/api/app/3d-studio/projects/project-codex/spatial-objects') && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
      return;
    }
    if (url.includes('/api/app/3d-studio/projects/project-codex/terrain-work-zones') && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
      return;
    }
    if (url.includes('/api/app/3d-studio/projects/project-codex/spatial-objects') && request.method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { id: `object-${apiCalls.length}` } }),
      });
      return;
    }
    if (url.includes('/api/app/3d-studio/projects/project-codex/terrain-work-zones') && request.method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { id: `zone-${apiCalls.length}` } }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [] }),
    });
  });

  await page.addInitScript((user) => {
    localStorage.removeItem('map-storage');
    localStorage.setItem('map-onboarding-dismissed', 'true');
    localStorage.setItem('auth-storage', JSON.stringify({
      state: {
        user,
        token: 'codex-test-token',
        refreshToken: 'codex-test-refresh',
        isAuthenticated: true,
        isBootstrapping: false,
      },
      version: 0,
    }));
    localStorage.setItem('workspace-session', JSON.stringify({
      state: {
        session: {
          orgId: 'org-codex',
          orgName: 'Codex Org',
          raceId: '',
          raceName: '',
          scopeType: 'org',
          surface: 'app',
          lastAppPath: '/app/map',
          lastOpsPath: '/ops',
          lastAdminPath: '/admin',
        },
      },
      version: 0,
    }));
  }, mockUser);

  const targetPath = `/app/map${options.query || ''}`;
  await page.goto(`${baseUrl}${targetPath}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForFunction(
    () => {
      const state = JSON.parse(localStorage.getItem('auth-storage') || '{}')?.state;
      return state?.isAuthenticated === true && state?.user?.authzProfile?.modules?.includes('app:map');
    },
    null,
    { timeout: 20_000 },
  );
  await page.evaluate((path) => {
    if (`${window.location.pathname}${window.location.search}` === path) return;
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, targetPath);
  try {
    await page.locator('.map-view-2d__panel--ovi-toolbar').waitFor({ state: 'visible', timeout: 20_000 });
  } catch (error) {
    const body = await page.locator('body').innerText().catch(() => '');
    const authStorage = await page.evaluate(() => localStorage.getItem('auth-storage')).catch(() => null);
    throw new Error(
      `Map toolbar did not render at ${page.url()}. API calls: ${JSON.stringify(apiCalls)}. `
      + `Console: ${JSON.stringify(consoleErrors)}. Auth: ${authStorage}. Body: ${body.slice(0, 1200)}`,
      { cause: error },
    );
  }
  const skipOnboarding = page.getByRole('button', { name: '跳过引导' });
  if (await skipOnboarding.isVisible().catch(() => false)) {
    await skipOnboarding.click();
  }

  return { page, apiCalls, consoleErrors };
}

async function mapState(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('map-storage') || '{}')?.state || {});
}

async function waitForFeatureCount(page, expected) {
  await page.waitForFunction(
    (count) => JSON.parse(localStorage.getItem('map-storage') || '{}')?.state?.drawnFeatures?.length === count,
    expected,
    { timeout: 8_000 },
  );
}

async function mapPoint(page, xRatio, yRatio) {
  const box = await page.locator('.leaflet-container').boundingBox();
  assert.ok(box, 'Leaflet container should have a bounding box');
  return {
    x: box.x + box.width * xRatio,
    y: box.y + box.height * yRatio,
  };
}

async function clickMap(page, xRatio, yRatio) {
  const point = await mapPoint(page, xRatio, yRatio);
  await page.mouse.click(point.x, point.y);
  await delay(160);
}

async function doubleClickMap(page, xRatio, yRatio) {
  const point = await mapPoint(page, xRatio, yRatio);
  await page.mouse.dblclick(point.x, point.y);
  await delay(450);
}

function objectTreeRow(page, name) {
  return page.locator('div[title="双击定位到此图形"]').filter({ hasText: name }).first();
}

function relevantConsoleErrors(errors) {
  return errors.filter((entry) => !/React Router Future Flag|Failed to load resource|net::/.test(entry));
}

async function drawAllShapesAndSave(browser, baseUrl, tempDir) {
  const { page, apiCalls, consoleErrors } = await openMapPage(browser, baseUrl, {
    query: '?projectId=project-codex',
  });
  try {
    assert.equal(new URL(page.url()).searchParams.get('projectId'), 'project-codex');
    assert.match(await page.locator('.app-map-layout__hint').textContent(), /当前编辑会同步到项目与工作区/);
    await waitForFeatureCount(page, 0);

    await page.locator('button[title="点位 (1)"]').click();
    await clickMap(page, 0.5, 0.42);
    await waitForFeatureCount(page, 1);

    await page.locator('button[title="线段 (3)"]').click();
    await clickMap(page, 0.45, 0.48);
    await clickMap(page, 0.5, 0.52);
    await doubleClickMap(page, 0.55, 0.48);
    await waitForFeatureCount(page, 2);

    await page.locator('button[title="面域 (4)"]').click();
    await clickMap(page, 0.57, 0.42);
    await clickMap(page, 0.62, 0.47);
    await clickMap(page, 0.58, 0.52);
    await doubleClickMap(page, 0.57, 0.42);
    await waitForFeatureCount(page, 3);

    await page.locator('button[title="矩形 (5)"]').click();
    await clickMap(page, 0.38, 0.58);
    await clickMap(page, 0.45, 0.66);
    await waitForFeatureCount(page, 4);

    await page.locator('button[title="圆域 (6)"]').click();
    await clickMap(page, 0.62, 0.6);
    await clickMap(page, 0.68, 0.66);
    await waitForFeatureCount(page, 5);

    const stateAfterDraw = await mapState(page);
    assert.deepEqual(
      new Set(stateAfterDraw.treeNodes.map((node) => node.featureType)),
      new Set(['marker', 'polyline', 'polygon', 'rectangle', 'circle']),
    );

    await page.locator('.map-view-2d__tool-chip').filter({ hasText: '复制' }).click();
    await page.locator('.map-view-2d__tool-chip').filter({ hasText: '粘贴' }).click();
    await waitForFeatureCount(page, 6);

    const downloadPromise = page.waitForEvent('download', { timeout: 10_000 });
    await page.locator('.map-view-2d__tool-chip').filter({ hasText: '导出' }).click();
    const download = await downloadPromise;
    const exportPath = path.join(tempDir, 'door-map-export.geojson');
    await download.saveAs(exportPath);
    const exported = JSON.parse(await readFile(exportPath, 'utf8'));
    assert.equal(exported.type, 'FeatureCollection');
    assert.equal(exported.features.length, 6);

    const saveButton = page.locator('.map-view-2d__tool-chip').filter({ hasText: '保存' });
    const syncPill = page.locator('.map-view-2d__sync-pill');
    const preSaveUi = {
      url: page.url(),
      saveDisabled: await saveButton.isDisabled(),
      syncText: await syncPill.textContent(),
      projectHint: await page.locator('.app-map-layout__hint').textContent(),
    };
    await saveButton.click();
    try {
      await page.waitForFunction(
        () => Array.from(document.querySelectorAll('.map-view-2d__sync-pill')).some((node) => node.textContent?.includes('已同步')),
        null,
        { timeout: 12_000 },
      );
    } catch (error) {
      const failedState = await mapState(page);
      const saveCalls = apiCalls.filter((call) => call.url.includes('/api/app/3d-studio'));
      const pageText = await page.locator('body').innerText().catch(() => '');
      throw new Error(
        `Map save did not reach synced state. API calls: ${JSON.stringify(apiCalls)}. `
        + `Pre-save UI: ${JSON.stringify(preSaveUi)}. `
        + `Nodes: ${JSON.stringify(failedState.treeNodes?.map((node) => ({ id: node.id, syncStatus: node.syncStatus, backendObjectId: node.backendObjectId })))}. `
        + `3D API calls: ${JSON.stringify(saveCalls)}. Page text: ${pageText.slice(0, 1200)}`,
        { cause: error },
      );
    }
    const savePosts = apiCalls.filter((call) =>
      call.method === 'POST' &&
      call.url.includes('/api/app/3d-studio/projects/project-codex/spatial-objects')
    );
    assert.equal(savePosts.length, 6);

    const stateAfterSave = await mapState(page);
    assert.equal(stateAfterSave.treeNodes.filter((node) => node.syncStatus === 'synced' && node.backendObjectId).length, 6);

    const beforeDeleteCount = stateAfterSave.drawnFeatures.length;
    await page.locator('.map-view-2d__tool-chip.is-danger').filter({ hasText: '删除' }).click();
    await waitForFeatureCount(page, beforeDeleteCount - 1);

    assert.deepEqual(relevantConsoleErrors(consoleErrors), []);
  } finally {
    await page.close();
  }
}

async function importObjectAndMeasurementWorkflows(browser, baseUrl, tempDir) {
  const importPath = path.join(tempDir, 'map-import-fixture.geojson');
  await writeFile(importPath, JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'import-point-1',
        properties: { name: 'Imported Point', featureType: 'marker', objectType: 'generic', color: '#D8262C' },
        geometry: { type: 'Point', coordinates: [104.07, 30.58] },
      },
      {
        type: 'Feature',
        id: 'import-line-1',
        properties: { name: 'Imported Line', featureType: 'polyline', objectType: 'generic', strokeColor: '#D8262C' },
        geometry: { type: 'LineString', coordinates: [[104.06, 30.57], [104.08, 30.59]] },
      },
    ],
  }, null, 2));

  const { page, consoleErrors } = await openMapPage(browser, baseUrl);
  try {
    await waitForFeatureCount(page, 0);
    await page.setInputFiles('.map-view-2d__file-input', importPath);
    await waitForFeatureCount(page, 2);
    await objectTreeRow(page, 'Imported Point').waitFor({ state: 'visible', timeout: 5_000 });
    await objectTreeRow(page, 'Imported Line').waitFor({ state: 'visible', timeout: 5_000 });

    await objectTreeRow(page, 'Imported Point').locator('span').filter({ hasText: 'Imported Point' }).first().dblclick();
    const renameInput = page.locator('.tree-content input').first();
    await renameInput.fill('Imported Point Renamed');
    await renameInput.press('Enter');
    await objectTreeRow(page, 'Imported Point Renamed').waitFor({ state: 'visible', timeout: 5_000 });
    let state = await mapState(page);
    assert.ok(state.treeNodes.some((node) => node.name === 'Imported Point Renamed'));

    await objectTreeRow(page, 'Imported Point Renamed').locator('button[title="隐藏"]').click();
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem('map-storage') || '{}')?.state?.treeNodes?.some((node) => node.name === 'Imported Point Renamed' && node.visible === false),
      null,
      { timeout: 5_000 },
    );
    await page.getByRole('button', { name: '隐藏' }).click();
    await objectTreeRow(page, 'Imported Point Renamed').waitFor({ state: 'visible', timeout: 5_000 });
    await page.getByRole('button', { name: '全部' }).click();

    await objectTreeRow(page, 'Imported Line').click();
    await page.keyboard.press('Delete');
    await waitForFeatureCount(page, 1);

    await page.locator('.map-view-2d__tool-chip').filter({ hasText: '测距' }).click();
    await clickMap(page, 0.44, 0.46);
    await clickMap(page, 0.49, 0.5);
    await doubleClickMap(page, 0.54, 0.46);
    await waitForFeatureCount(page, 2);
    state = await mapState(page);
    assert.ok(state.treeNodes.some((node) => String(node.name || '').startsWith('测距 ·')));

    await page.locator('.map-view-2d__tool-chip').filter({ hasText: '测面' }).click();
    await clickMap(page, 0.58, 0.42);
    await clickMap(page, 0.63, 0.47);
    await clickMap(page, 0.59, 0.52);
    await doubleClickMap(page, 0.58, 0.42);
    await waitForFeatureCount(page, 3);
    state = await mapState(page);
    assert.ok(state.treeNodes.some((node) => String(node.name || '').startsWith('测面 ·')));

    await objectTreeRow(page, 'Imported Point Renamed').locator('button[title="删除"]').click();
    await page.getByRole('button', { name: '确认删除' }).click();
    await waitForFeatureCount(page, 2);

    assert.deepEqual(relevantConsoleErrors(consoleErrors), []);
  } finally {
    await page.close();
  }
}

async function verifyRequired3dProviderFailureNeverReportsReady(browser, baseUrl) {
  const { page, consoleErrors } = await openMapPage(browser, baseUrl);
  try {
    await page.route('https://api.cesium.com/**', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Unauthorized test fixture' }),
      });
    });
    await page.locator('button[title^="视图:"]').click();
    await page.locator('.map-controls__menu-item').filter({ hasText: '三维地球' }).click();
    await page.locator('button[title^="OSM 白模"]').click();

    const providerStatus = page.locator('[data-testid="map-provider-status"]');
    try {
      await providerStatus.waitFor({ state: 'visible', timeout: 30_000 });
    } catch (error) {
      const pageText = await page.locator('body').innerText().catch(() => '');
      throw new Error(
        `${error.message}\nCurrent URL: ${page.url()}\nConsole errors: ${JSON.stringify(consoleErrors)}\nPage text: ${pageText.slice(0, 1600)}`,
        { cause: error },
      );
    }
    try {
      await page.locator(
        '[data-provider="buildings"][data-status="unavailable"], [data-provider="buildings"][data-status="failed"]',
      ).waitFor({
        state: 'visible',
        timeout: 10_000,
      });
    } catch (error) {
      const providerHtml = await providerStatus.evaluate((node) => node.outerHTML).catch(() => '');
      throw new Error(`${error.message}\nProvider HUD: ${providerHtml}`, { cause: error });
    }

    assert.notEqual(await providerStatus.getAttribute('data-status'), 'ready');
    assert.equal(await page.locator('[data-experience-status="error"]').count(), 1);
    assert.equal(await page.getByText('三维地球已就绪', { exact: true }).count(), 0);
  } finally {
    await page.close();
  }
}

test('GIS map drawing, exchange, project save, and object workflows', { timeout: 180_000 }, async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'door-map-e2e-'));
  const { baseUrl, cleanup } = await startViteServer();
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });

  try {
    await verifyRequired3dProviderFailureNeverReportsReady(browser, baseUrl);
    await drawAllShapesAndSave(browser, baseUrl, tempDir);
    await importObjectAndMeasurementWorkflows(browser, baseUrl, tempDir);
  } finally {
    await browser.close();
    await cleanup();
    await rm(tempDir, { recursive: true, force: true });
  }
});
