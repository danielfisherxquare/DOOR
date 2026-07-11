import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('UTF-8 CSV parsing preserves Chinese headers without codepage warnings', async () => {
  const excelProcessor = await import('../../src/utils/excelProcessor.js')
  assert.equal(typeof excelProcessor.readWorkbookFromBytes, 'function')

  const bytes = await readFile(new URL('../fixtures/acceptance-registration.csv', import.meta.url))
  const consoleErrors = []
  const originalConsoleError = console.error
  console.error = (...args) => consoleErrors.push(args.join(' '))

  try {
    const workbook = excelProcessor.readWorkbookFromBytes(bytes, 'acceptance-registration.csv')
    const rows = excelProcessor.workbookToRows(workbook)

    assert.equal(rows.length, 3)
    assert.equal(rows[0].姓名, '验收选手甲')
    assert.equal(rows[0].手机号码, '13800138011')
    assert.deepEqual(consoleErrors, [])
  } finally {
    console.error = originalConsoleError
  }
})
