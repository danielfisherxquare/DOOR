import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { join } from 'node:path';

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

test('inventory app workbench shell uses the shared H5 surface language', () => {
  const shell = read('src/components/inventory/workbench/WarehouseWorkbenchShell.jsx');

  assert.ok(shell.includes("from '../../app/AppH5Surface'"), 'warehouse shell should import app H5 primitives');
  assert.match(shell, /AppH5Surface/, 'warehouse shell should render AppH5Surface');
  assert.match(shell, /AppH5Tabs/, 'warehouse shell should render AppH5Tabs for tab data');
  assert.ok(!shell.includes('CommandShell'), 'warehouse shell should not keep the command shell wrapper');
  assert.ok(!shell.includes('surface-admin'), 'app inventory pages should not carry admin surface styling');
});

test('inventory app centers pass tab data into the shared H5 tab primitive', () => {
  for (const page of [
    'src/views/inventory/InboundCenter.jsx',
    'src/views/inventory/OutboundCenter.jsx',
    'src/views/inventory/ControlCenter.jsx',
    'src/views/inventory/SpaceCenter.jsx',
  ]) {
    const source = read(page);
    assert.ok(source.includes('const tabs = TABS.map((tab) => ({'), `${page} should build tab data objects`);
    assert.ok(source.includes('active: activeTab === tab.key'), `${page} should mark the active H5 tab`);
    assert.ok(source.includes('onClick: () => {'), `${page} should keep tab URL updates as data callbacks`);
  }
});
