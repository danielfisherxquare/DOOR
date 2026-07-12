import * as XLSX from 'xlsx'
import { normalizeTeamImportRows } from './teamListPageData.js'

export function createTeamImportWorkbook(columns, sampleRows) {
  const titleRow = columns.map((item) => item.title)
  const descriptionRow = columns.map(
    (item) => `${item.key}${item.required ? '（必填）' : '（选填）'}`,
  )
  const sampleDataRows = sampleRows.map((row) =>
    columns.map((item) => row[item.key] ?? ''),
  )
  const worksheet = XLSX.utils.aoa_to_sheet([titleRow, descriptionRow, ...sampleDataRows])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, '团队成员模板')
  return workbook
}

export function writeTeamImportTemplate({ columns, sampleRows, fileName }) {
  XLSX.writeFile(createTeamImportWorkbook(columns, sampleRows), fileName)
}

export function readFirstSheetRows(workbook) {
  const worksheet = workbook.Sheets[workbook.SheetNames[0]]
  return XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })
}

export function writeTeamImportWorkbookBuffer(workbook) {
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
}

export function parseTeamImportWorkbook(buffer, columns) {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const worksheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' })
  return normalizeTeamImportRows(rows, columns)
}
