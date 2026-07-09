import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { join } from 'node:path';

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

test('clothing app page uses H5 surface primitives', () => {
  const page = read('src/views/app/events/clothing/ClothingPage.jsx');

  for (const name of [
    'AppH5Surface',
    'AppH5Panel',
    'AppH5ContextState',
    'AppH5DataTable',
    'AppH5EmptyState',
    'AppH5Notice',
  ]) {
    assert.ok(page.includes(name), `ClothingPage should use ${name}`);
  }

  assert.ok(page.includes('className="clothing-page"'), 'clothing page should keep a stable H5 route class');
  assert.ok(!page.includes('CommandShell'), 'clothing page should not keep the old command shell');
  assert.ok(!page.includes('CommandPanel'), 'clothing page should not keep command panels');
  assert.ok(!page.includes('CommandMetricGrid'), 'clothing page should not keep command metrics');
  assert.ok(!page.includes('ContextRequirementState'), 'clothing page should not keep command context state');
  assert.ok(!page.includes('surface-app'), 'clothing page should not carry the old surface-app class');
  assert.ok(!page.includes('command-page'), 'clothing page should not carry the old command-page class');
});

test('assessment campaign list uses H5 surface primitives', () => {
  const page = read('src/views/app/assessment/AssessmentCampaignListPage.jsx');

  for (const name of [
    'AppH5Surface',
    'AppH5Panel',
    'AppH5Notice',
    'AppH5DataTable',
    'AppH5EmptyState',
    'AppH5StatusTag',
  ]) {
    assert.ok(page.includes(name), `AssessmentCampaignListPage should use ${name}`);
  }

  assert.ok(page.includes('className="assessment-campaign-list-page"'), 'assessment page should keep a stable H5 route class');
  assert.ok(!page.includes('CommandShell'), 'assessment page should not keep the old command shell');
  assert.ok(!page.includes('CommandPanel'), 'assessment page should not keep command panels');
  assert.ok(!page.includes('CommandMetricGrid'), 'assessment page should not keep command metrics');
  assert.ok(!page.includes('CommandNotice'), 'assessment page should not keep command notices');
  assert.ok(!page.includes('CommandStatusTag'), 'assessment page should not keep command status tags');
  assert.ok(!page.includes('surface-app'), 'assessment page should not carry the old surface-app class');
  assert.ok(!page.includes('command-page'), 'assessment page should not carry the old command-page class');
});

test('processing center uses H5 surface and tab primitives', () => {
  const page = read('src/views/app/events/processing/ProcessingCenterPage.jsx');

  for (const name of [
    'AppH5Surface',
    'AppH5ContextState',
    'AppH5Tabs',
  ]) {
    assert.ok(page.includes(name), `ProcessingCenterPage should use ${name}`);
  }

  assert.ok(page.includes('className="processing-center-page"'), 'processing center should keep a stable H5 route class');
  assert.ok(!page.includes('CommandShell'), 'processing center should not keep the old command shell');
  assert.ok(!page.includes('CommandMetricGrid'), 'processing center should not keep command metrics');
  assert.ok(!page.includes('CommandStepRail'), 'processing center should not keep the old command step rail');
  assert.ok(!page.includes('ContextRequirementState'), 'processing center should not keep command context state');
  assert.ok(!page.includes('surface-app'), 'processing center should not carry the old surface-app class');
  assert.ok(!page.includes('command-page'), 'processing center should not carry the old command-page class');
});

test('records page uses H5 surface primitives', () => {
  const page = read('src/views/app/events/records/RecordsPage.jsx');
  const layout = read('src/components/app/AppLayout.jsx');
  const config = read('src/components/app/appConfig.js');

  for (const name of [
    'AppH5Surface',
    'AppH5ContextState',
  ]) {
    assert.ok(page.includes(name), `RecordsPage should use ${name}`);
  }

  assert.ok(page.includes('className="records-page"'), 'records page should keep a stable H5 route class');
  assert.ok(!page.includes('CommandShell'), 'records page should not keep the old command shell');
  assert.ok(!page.includes('CommandMetricGrid'), 'records page should not keep command metrics');
  assert.ok(!page.includes('ContextRequirementState'), 'records page should not keep command context state');
  assert.ok(!page.includes('surface-app'), 'records page should not carry the old surface-app class');
  assert.ok(!page.includes('command-page'), 'records page should not carry the old command-page class');
  assert.ok(!page.includes('/admin/processing'), 'records page should link back to the app processing route');
  assert.ok(layout.includes('const RecordsPage'), 'app layout should lazy-load the records page');
  assert.ok(layout.includes('path="events/records"'), 'app layout should expose records under /app/events/records');
  assert.ok(config.includes("path: '/events/records'"), 'app nav should expose the records H5 entry');
  assert.ok(config.includes("path: '/app/events/records'"), 'app route metadata should resolve the records H5 entry');
});

test('import page uses H5 surface primitives', () => {
  const page = read('src/views/app/events/import/ImportPage.jsx');

  for (const name of [
    'AppH5Surface',
    'AppH5ContextState',
    'AppH5Panel',
    'AppH5Notice',
    'AppH5Tabs',
    'AppH5EmptyState',
  ]) {
    assert.ok(page.includes(name), `ImportPage should use ${name}`);
  }

  assert.ok(page.includes('className="import-page"'), 'import page should keep a stable H5 route class');
  assert.ok(!page.includes('CommandShell'), 'import page should not keep the old command shell');
  assert.ok(!page.includes('CommandMetricGrid'), 'import page should not keep command metrics');
  assert.ok(!page.includes('CommandPanel'), 'import page should not keep command panels');
  assert.ok(!page.includes('CommandNotice'), 'import page should not keep command notices');
  assert.ok(!page.includes('CommandStepRail'), 'import page should not keep the old command step rail');
  assert.ok(!page.includes('ContextRequirementState'), 'import page should not keep command context state');
  assert.ok(!page.includes('surface-app'), 'import page should not carry the old surface-app class');
  assert.ok(!page.includes('command-page'), 'import page should not carry the old command-page class');
});

test('bib page uses H5 surface primitives', () => {
  const page = read('src/views/app/events/bib/BibPage.jsx');

  for (const name of [
    'AppH5Surface',
    'AppH5ContextState',
    'AppH5Panel',
    'AppH5Notice',
    'AppH5Tabs',
    'AppH5DataTable',
    'AppH5EmptyState',
  ]) {
    assert.ok(page.includes(name), `BibPage should use ${name}`);
  }

  assert.ok(page.includes('className="bib-page"'), 'bib page should keep a stable H5 route class');
  assert.ok(!page.includes('CommandShell'), 'bib page should not keep the old command shell');
  assert.ok(!page.includes('CommandPanel'), 'bib page should not keep command panels');
  assert.ok(!page.includes('CommandDataTable'), 'bib page should not keep command tables');
  assert.ok(!page.includes('CommandEmptyState'), 'bib page should not keep command empty states');
  assert.ok(!page.includes('CommandNotice'), 'bib page should not keep command notices');
  assert.ok(!page.includes('CommandStepRail'), 'bib page should not keep the old command step rail');
  assert.ok(!page.includes('ContextRequirementState'), 'bib page should not keep command context state');
  assert.ok(!page.includes('surface-app'), 'bib page should not carry the old surface-app class');
  assert.ok(!page.includes('command-page'), 'bib page should not carry the old command-page class');
});

test('lottery page route shell uses H5 surface primitives', () => {
  const page = read('src/views/app/events/lottery/LotteryPage.jsx');

  for (const name of [
    'AppH5Surface',
    'AppH5ContextState',
    'AppH5Panel',
    'AppH5Notice',
    'AppH5Tabs',
  ]) {
    assert.ok(page.includes(name), `LotteryPage should use ${name}`);
  }

  assert.ok(page.includes('className="lottery-page"'), 'lottery page should keep a stable H5 route class');
  assert.ok(!page.includes('CommandShell'), 'lottery page should not keep the old command shell');
  assert.ok(!page.includes('CommandMetricGrid'), 'lottery page should not keep command metrics');
  assert.ok(!page.includes('CommandPanel'), 'lottery page route shell should not keep command panels');
  assert.ok(!page.includes('CommandNotice'), 'lottery page should not keep command notices');
  assert.ok(!page.includes('CommandStepRail'), 'lottery page should not keep the old command step rail');
  assert.ok(!page.includes('ContextRequirementState'), 'lottery page should not keep command context state');
  assert.ok(!page.includes('surface-app'), 'lottery page should not carry the old surface-app class');
  assert.ok(!page.includes('command-page'), 'lottery page should not carry the old command-page class');
});

test('lottery workflow panels use H5 inner primitives', () => {
  const files = [
    'src/views/app/events/lottery/CapacityPlanner.jsx',
    'src/views/app/events/lottery/StartZoneSimulator.jsx',
    'src/views/app/events/lottery/PerformanceFilter.jsx',
    'src/views/app/events/lottery/InventoryMatcher.jsx',
    'src/views/app/events/lottery/LotteryV2BetaPanel.jsx',
  ];

  for (const file of files) {
    const page = read(file);
    assert.ok(page.includes('AppH5Panel'), `${file} should use AppH5Panel`);
    assert.ok(!page.includes('CommandPanel'), `${file} should not use CommandPanel`);
    assert.ok(!page.includes('CommandNotice'), `${file} should not use CommandNotice`);
    assert.ok(!page.includes('CommandMetricGrid'), `${file} should not use CommandMetricGrid`);
    assert.ok(!page.includes('CommandDataTable'), `${file} should not use CommandDataTable`);
    assert.ok(!page.includes('CommandEmptyState'), `${file} should not use CommandEmptyState`);
  }
});

test('event workbench inner panels use H5 primitives', () => {
  const files = [
    'src/views/app/events/bib/BibLayoutWorkbench.jsx',
    'src/views/app/events/processing/LotteryListsPanel.jsx',
    'src/views/app/events/processing/ListEntryEditModal.jsx',
    'src/views/app/events/processing/ProcessingOverviewPanel.jsx',
    'src/views/app/events/processing/VerificationImportPanel.jsx',
    'src/views/app/events/processing/AuditPipelinePanel.jsx',
    'src/views/app/events/records/RecordsOverviewPanel.jsx',
  ];

  for (const file of files) {
    const page = read(file);
    assert.ok(page.includes('AppH5Panel'), `${file} should use AppH5Panel`);
    for (const oldName of [
      'CommandPanel',
      'CommandNotice',
      'CommandDataTable',
      'CommandEmptyState',
      'CommandStatusTag',
      'CommandToolbar',
      'CommandFilterBar',
      'command-panel',
      'command-table-wrap',
      'command-data-table',
    ]) {
      assert.ok(!page.includes(oldName), `${file} should not use ${oldName}`);
    }
  }
});

test('lottery lists import avoids automatic full-record rematching', () => {
  const page = read('src/views/app/events/processing/LotteryListsPanel.jsx');
  const loadDataBlock = page.slice(
    page.indexOf('const loadData = useCallback'),
    page.indexOf('const refreshMatching = useCallback'),
  );
  const importBlock = page.slice(
    page.indexOf('const handleImport = useCallback'),
    page.indexOf('const currentEntries = useMemo'),
  );

  assert.ok(loadDataBlock.includes('recordsApi.quickStats'), 'initial list load should use lightweight record stats');
  assert.ok(!loadDataBlock.includes('fetchAllRecords'), 'initial list load should not fetch every record');
  assert.ok(!importBlock.includes('refreshMatching('), 'Excel import should not automatically run full rematching');
  assert.ok(importBlock.includes('await loadData()'), 'Excel import should refresh list data after saving entries');
});
