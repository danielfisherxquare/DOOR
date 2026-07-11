import assert from 'node:assert/strict'
import test from 'node:test'
import ExcelJS from 'exceljs'

async function loadFocusedModule(fileName) {
  try {
    return await import(`../src/modules/design-requests/${fileName}`)
  } catch {
    return null
  }
}

test('design collaboration data helpers normalize stable row contracts', async () => {
  const helpers = await loadFocusedModule('design-collaboration-data.js')
  assert.ok(helpers, 'focused collaboration data module must exist')

  assert.deepEqual(helpers.computeSyncState({ needsDesign: false }), {
    syncStatus: 'ignored',
    syncIssues: [],
  })
  assert.deepEqual(
    helpers.computeSyncState({
      needsDesign: true,
      requesterDepartment: '',
      requesterName: '',
      dueAt: '',
    }),
    {
      syncStatus: 'needs_info',
      syncIssues: ['需求部门为空', '需求人为空', '交付时间为空'],
    },
  )
  assert.equal(
    helpers.buildStableKey({
      area: ' 主会场 ',
      category: ' 导视 ',
      itemName: ' 门楣 ',
      supplier: 'Vendor',
      buildSize: '2 x 3',
      quantity: 1,
      unit: '套',
    }),
    helpers.buildStableKey({
      area: '主会场',
      category: '导视',
      itemName: '门楣',
      supplier: 'vendor',
      buildSize: '2 x 3',
      quantity: 1,
      unit: '套',
    }),
  )
})

test('design collaboration workbook parser preserves material columns and carried areas', async () => {
  const workbookModule = await loadFocusedModule('design-collaboration-workbook.js')
  assert.ok(workbookModule, 'focused collaboration workbook module must exist')

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('协同清单')
  sheet.addRow([
    '使用区域',
    '类别',
    '项目',
    '材质',
    '设计',
    '需求部门',
    '需求人',
    '交付时间',
    '优先级',
    '材质',
  ])
  sheet.addRow(['主会场', '导视', '门楣', '木结构', '✅', '竞赛部', '张三', new Date('2026-08-01T10:00:00.000Z'), '高', '喷绘布'])
  sheet.addRow(['', '导视', '背景墙', '桁架', '✅', '', '', '', '普通', '软膜'])

  const parsed = await workbookModule.parseCollaborationWorkbook(await workbook.xlsx.writeBuffer())
  assert.equal(parsed.sheetName, '协同清单')
  assert.equal(parsed.rows.length, 2)
  assert.equal(parsed.rows[0].buildMaterial, '木结构')
  assert.equal(parsed.rows[0].designMaterial, '喷绘布')
  assert.equal(parsed.rows[0].priority, 'high')
  assert.equal(parsed.rows[0].syncStatus, 'ready')
  assert.equal(parsed.rows[1].area, '主会场')
  assert.deepEqual(parsed.rows[1].syncIssues, ['需求部门为空', '需求人为空', '交付时间为空'])
})

test('design collaboration workbook exporter keeps review metadata columns', async () => {
  const workbookModule = await loadFocusedModule('design-collaboration-workbook.js')
  assert.ok(workbookModule, 'focused collaboration workbook module must exist')

  const buffer = await workbookModule.buildCollaborationExportWorkbook(
    { round_no: 2 },
    [{
      change_type: 'changed',
      row_json: JSON.stringify({
        area: '主会场',
        itemName: '门楣',
        needsDesign: true,
        stableKey: 'stable-key',
      }),
    }],
  )
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const sheet = workbook.worksheets[0]

  assert.equal(sheet.getCell('X1').value, '变更标记')
  assert.equal(sheet.getCell('X2').value, '修改')
  assert.equal(sheet.getCell('Y2').value, 2)
  assert.equal(sheet.getCell('AB2').value, 'stable-key')
  assert.equal(sheet.getColumn('AB').hidden, true)
})
