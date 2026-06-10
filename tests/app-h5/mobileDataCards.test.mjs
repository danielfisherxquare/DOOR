import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { join } from 'node:path'

const root = process.cwd()
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8')

test('shared H5 table primitive supports mobile card fallbacks', () => {
  const component = read('src/components/app/AppH5Surface.jsx')
  const css = read('src/components/app/app-h5-surface.css')

  assert.ok(component.includes('mobileCards'), 'AppH5DataTable should accept a mobileCards slot')
  assert.ok(component.includes('export function AppH5DataCard'), 'shared mobile row card should be exported')
  assert.ok(component.includes('export function AppH5StatusTag'), 'shared status tag should be exported for dense mobile cards')
  assert.ok(component.includes('app-h5-table-wrap--with-mobile-cards'), 'table wrapper should mark card-capable tables')
  assert.ok(css.includes('.app-h5-data-card'), 'shared mobile card selector should be styled')
  assert.ok(css.includes('.app-h5-table-wrap--with-mobile-cards .app-h5-table-scroll'), 'mobile CSS should be able to hide the table scroll')
  assert.ok(css.includes('scroll-snap-type: x mandatory'), 'mobile tabs should use horizontal snap scrolling')
  assert.ok(css.includes('min-height: 44px'), 'mobile cards and tabs should preserve mature touch targets')
})

test('H5 data-heavy pages render mobile card alternatives next to desktop tables', () => {
  const files = [
    'src/views/app/projects/ProjectListPage.jsx',
    'src/views/app/events/records/RecordsOverviewPanel.jsx',
    'src/views/app/events/processing/ProcessingOverviewPanel.jsx',
    'src/views/app/events/processing/VerificationImportPanel.jsx',
    'src/views/app/events/processing/LotteryListsPanel.jsx',
  ]

  for (const file of files) {
    const source = read(file)
    assert.ok(source.includes('mobileCards='), file + ' should pass mobileCards into AppH5DataTable')
  }

  const projectList = read('src/views/app/projects/ProjectListPage.jsx')
  assert.ok(projectList.includes('unwrapListData'), 'ProjectListPage should normalize API and mock list envelopes before filtering')

  const records = read('src/views/app/events/records/RecordsOverviewPanel.jsx')
  for (const label of ['姓名', '项目', '手机号', '证件号', '签位状态', '号码布']) {
    assert.ok(records.includes(label), 'Records mobile card should expose stable field label ' + label)
  }
})
