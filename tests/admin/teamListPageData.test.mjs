import assert from 'node:assert/strict'
import test from 'node:test'

async function loadData() {
  try {
    return await import('../../src/views/admin/teamListPageData.js')
  } catch {
    return null
  }
}

test('team employee codes fill numeric gaps and preserve occupied state', async () => {
  const data = await loadData()
  assert.ok(data, 'team list data module must exist')

  const options = data.buildEmployeeCodeOptions(['STA001', 'STA003'], 'MANUAL')

  assert.deepEqual(options.find((item) => item.code === 'STA001'), {
    code: 'STA001',
    occupied: true,
  })
  assert.deepEqual(options.find((item) => item.code === 'STA002'), {
    code: 'STA002',
    occupied: false,
  })
  assert.ok(options.some((item) => item.code === 'MANUAL' && item.occupied === false))
})

test('team import rows map template titles and remove empty rows', async () => {
  const data = await loadData()
  assert.ok(data, 'team list data module must exist')

  const rows = data.normalizeTeamImportRows(
    [{ 姓名: '张三', 部门: '执行' }, { 姓名: ' ', 部门: '' }],
    [
      { title: '姓名', key: 'employeeName' },
      { title: '部门', key: 'department' },
    ],
  )

  assert.deepEqual(rows, [{ employeeName: '张三', department: '执行' }])
  assert.equal(data.EMPTY_TEAM_MEMBER_FORM.memberType, 'employee')
})
