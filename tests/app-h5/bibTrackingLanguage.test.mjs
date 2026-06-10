import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { join } from 'node:path';

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

test('bib tracking app page uses the shared H5 design language', () => {
  const page = read('src/views/app/events/bib-tracking/BibTrackingPage.jsx');

  for (const name of [
    'AppH5Surface',
    'AppH5Panel',
    'AppH5Notice',
    'AppH5Toolbar',
    'AppH5FilterBar',
    'AppH5DataTable',
    'AppH5EmptyState',
    'AppH5StatusTag',
    'AppH5DetailPane',
  ]) {
    assert.ok(page.includes(name), `BibTrackingPage should use ${name}`);
  }

  assert.ok(page.includes('className="bib-tracking-page"'), 'page should expose a stable H5 app surface class');
  assert.ok(!page.includes('CommandShell'), 'bib tracking should not keep the old command shell header');
  assert.ok(!page.includes('CommandPanel'), 'bib tracking should not keep command panels');
  assert.ok(!page.includes('CommandNotice'), 'bib tracking should not keep command notices');
  assert.ok(!page.includes('CommandToolbar'), 'bib tracking should not keep command toolbar');
  assert.ok(!page.includes('CommandMetricGrid'), 'bib tracking should not keep command metrics');
  assert.ok(!page.includes('surface-admin'), 'bib tracking app route should not carry admin surface styling');
  assert.ok(!page.includes('components/command/CommandPrimitives'), 'bib tracking should not import command primitives');
});

test('H5 design language exports inner-page workbench primitives', () => {
  const component = read('src/components/app/AppH5Surface.jsx');
  const css = read('src/components/app/app-h5-surface.css');

  for (const name of [
    'AppH5Toolbar',
    'AppH5FilterBar',
    'AppH5DataTable',
    'AppH5EmptyState',
    'AppH5StatusTag',
    'AppH5DetailPane',
    'AppH5ContextState',
  ]) {
    assert.ok(component.includes(`export function ${name}`), `AppH5Surface should export ${name}`);
  }

  for (const selector of [
    '.app-h5-toolbar',
    '.app-h5-filter-bar',
    '.app-h5-table-wrap',
    '.app-h5-empty',
    '.app-h5-status-tag',
    '.app-h5-detail-pane',
    '.app-h5-notice--success',
  ]) {
    assert.ok(css.includes(selector), `missing selector ${selector}`);
  }
});
