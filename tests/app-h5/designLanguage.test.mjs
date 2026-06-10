import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import { join } from 'node:path';

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

test('app layer publishes reusable H5 design language primitives', () => {
  const componentPath = 'src/components/app/AppH5Surface.jsx';
  const cssPath = 'src/components/app/app-h5-surface.css';

  assert.equal(existsSync(join(root, componentPath)), true, 'AppH5Surface component file should exist');
  assert.equal(existsSync(join(root, cssPath)), true, 'AppH5Surface stylesheet should exist');

  const component = read(componentPath);
  assert.match(component, /export function AppH5Surface/, 'surface wrapper should be exported');
  assert.match(component, /export function AppH5Section/, 'section wrapper should be exported');
  assert.match(component, /export function AppH5ActionCard/, 'action card primitive should be exported');
  assert.match(component, /export function AppH5MetricStrip/, 'metric strip primitive should be exported');
  assert.match(component, /export function AppH5Panel/, 'panel primitive should be exported');
  assert.match(component, /export function AppH5Notice/, 'notice primitive should be exported');
  assert.match(component, /export function AppH5Tabs/, 'tab primitive should be exported');
  assert.match(component, /import '\.\/app-h5-surface\.css'/, 'component should own its stylesheet');

  const css = read(cssPath);
  for (const selector of [
    '.app-h5-surface',
    '.app-h5-surface__header',
    '.app-h5-metric-strip',
    '.app-h5-section',
    '.app-h5-action-card',
    '.app-h5-panel',
    '.app-h5-notice',
    '.app-h5-tabs',
    '@media (max-width: 768px)',
  ]) {
    assert.ok(css.includes(selector), `missing selector ${selector}`);
  }
});

test('app home uses the shared H5 primitives instead of standalone portal cards', () => {
  const home = read('src/views/Home.jsx');

  for (const name of ['AppH5Surface', 'AppH5Section', 'AppH5ActionCard']) {
    assert.ok(home.includes(name), `Home should use ${name}`);
  }

  assert.ok(home.includes('className="app-h5-home"'), 'Home should identify the H5 home surface');
  assert.ok(home.includes('metrics={metrics}'), 'Home should pass metric data into AppH5Surface');
  assert.ok(home.includes('title={item.label}'), 'Home action cards should pass labels through the title prop');
  assert.ok(!home.includes('FUNCTIONAL_MODULES'), 'Home should not expose old technical section copy');
  assert.ok(!home.includes('ENTER <span'), 'Home cards should use localized H5 action copy');
});

test('reimbursement app page uses shared H5 inner-page primitives', () => {
  const page = read('src/views/reimbursement/ReimbursementTool.jsx');

  for (const name of ['AppH5Surface', 'AppH5Panel', 'AppH5Notice', 'AppH5Tabs']) {
    assert.ok(page.includes(name), `ReimbursementTool should use ${name}`);
  }

  assert.ok(!page.includes('CommandShell'), 'ReimbursementTool should not keep a separate command shell header');
  assert.ok(!page.includes('className="reimbursement-tool__tabs"'), 'tabs should use AppH5Tabs');
});

test('app shell exposes route summaries as part of the unified page language', () => {
  const layout = read('src/components/app/AppLayout.jsx');
  const css = read('src/components/app/app-layout.css');

  assert.ok(layout.includes('routeMeta.summary'), 'AppLayout should render route metadata summaries');
  assert.ok(layout.includes('workspace-main__summary'), 'AppLayout should provide a summary element');
  assert.ok(css.includes('.workspace-main__summary'), 'workspace summary should be styled');
  assert.ok(css.includes('workspace-main__summary {'), 'summary selector should have concrete rules');
});
