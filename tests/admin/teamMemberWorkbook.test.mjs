import assert from 'node:assert/strict'
import test from 'node:test'

async function loadWorkbook() {
  try {
    return await import('../../src/views/admin/teamMemberWorkbook.js')
  } catch {
    return null
  }
}

test('team workbook preserves titles, field descriptions, and sample rows', async () => {
  const workbook = await loadWorkbook()
  assert.ok(workbook, 'team member workbook module must exist')

  const columns = [
    { key: 'employeeCode', title: '工号', required: true },
    { key: 'employeeName', title: '姓名', required: false },
  ]
  const book = workbook.createTeamImportWorkbook(columns, [
    { employeeCode: 'STA001', employeeName: '张三' },
  ])

  assert.deepEqual(workbook.readFirstSheetRows(book), [
    ['工号', '姓名'],
    ['employeeCode（必填）', 'employeeName（选填）'],
    ['STA001', '张三'],
  ])
})

test('team workbook parses the first sheet through the shared row contract', async () => {
  const workbook = await loadWorkbook()
  assert.ok(workbook, 'team member workbook module must exist')

  const columns = [{ key: 'employeeCode', title: '工号', required: true }]
  const book = workbook.createTeamImportWorkbook(columns, [{ employeeCode: 'STA001' }])
  const buffer = workbook.writeTeamImportWorkbookBuffer(book)

  assert.deepEqual(workbook.parseTeamImportWorkbook(buffer, columns), [
    { employeeCode: 'employeeCode（必填）' },
    { employeeCode: 'STA001' },
  ])
})
