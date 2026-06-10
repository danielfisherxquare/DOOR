import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { join } from 'node:path';

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

test('project list app page uses H5 surface primitives', () => {
  const page = read('src/views/app/projects/ProjectListPage.jsx');

  for (const name of [
    'AppH5Surface',
    'AppH5Panel',
    'AppH5Notice',
    'AppH5DataTable',
    'AppH5EmptyState',
  ]) {
    assert.ok(page.includes(name), `ProjectListPage should use ${name}`);
  }

  assert.ok(page.includes('className="project-list-page"'), 'project list should expose a stable H5 page class');
  assert.ok(!page.includes('CommandShell'), 'project list should not keep the old command shell');
  assert.ok(!page.includes('CommandPanel'), 'project list should not keep command panels');
  assert.ok(!page.includes('CommandNotice'), 'project list should not keep command notices');
  assert.ok(!page.includes('CommandMetricGrid'), 'project list should not keep command metrics');
  assert.ok(!page.includes('surface-app'), 'project list should not carry the old surface-app class');
  assert.ok(!page.includes('command-page'), 'project list should not carry the old command-page class');
});

test('project detail app page uses H5 surface primitives', () => {
  const page = read('src/views/app/projects/ProjectDetailPage.jsx');

  for (const name of [
    'AppH5Surface',
    'AppH5Panel',
    'AppH5Notice',
    'AppH5Tabs',
  ]) {
    assert.ok(page.includes(name), `ProjectDetailPage should use ${name}`);
  }

  assert.ok(page.includes('className="project-detail-page"'), 'project detail should expose a stable H5 page class');
  assert.ok(page.includes("import './project-detail-page.css'"), 'project detail should move page layout styling into CSS');
  assert.ok(!page.includes('command-page'), 'project detail should not carry the old command-page class');
  assert.ok(!page.includes('surface-app'), 'project detail should not carry the old surface-app class');
  assert.ok(!page.includes('className="card"'), 'project detail should not use generic cards as page sections');
});
