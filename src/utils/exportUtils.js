/**
 * 数据导出工具函数
 */
import * as XLSX from 'xlsx'

/**
 * 导出场景数据为 JSON
 */
export function exportToJSON(draftScene, options = {}) {
  const { includeLevels = true, includeMeasurements = true } = options

  const exportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    warehouse: draftScene.warehouse,
  }

  if (includeLevels && draftScene.levels) {
    exportData.levels = draftScene.levels
  }

  if (draftScene.zones) exportData.zones = draftScene.zones
  if (draftScene.racks) exportData.racks = draftScene.racks
  if (draftScene.walls) exportData.walls = draftScene.walls
  if (draftScene.structures) exportData.structures = draftScene.structures
  if (draftScene.prefabs) exportData.prefabs = draftScene.prefabs

  if (includeMeasurements && draftScene.measurements) {
    exportData.measurements = draftScene.measurements
  }

  return JSON.stringify(exportData, null, 2)
}

/**
 * 导出场景数据为 Excel
 */
export function exportToExcel(draftScene, options = {}) {
  const workbook = XLSX.utils.book_new()

  // 仓库信息
  if (draftScene.warehouse) {
    const warehouseData = [
      ['属性', '值'],
      ['名称', draftScene.warehouse.name || ''],
      ['宽度(m)', draftScene.warehouse.width || 0],
      ['深度(m)', draftScene.warehouse.depth || 0],
      ['高度(m)', draftScene.warehouse.height || 0],
    ]
    const wsWarehouse = XLSX.utils.aoa_to_sheet(warehouseData)
    XLSX.utils.book_append_sheet(workbook, wsWarehouse, '仓库信息')
  }

  // 楼层信息
  if (draftScene.levels?.length) {
    const levelsData = [
      ['ID', '名称', '标高(m)', '层高(m)'],
      ...draftScene.levels.map(l => [l.id, l.name, l.elevation, l.height])
    ]
    const wsLevels = XLSX.utils.aoa_to_sheet(levelsData)
    XLSX.utils.book_append_sheet(workbook, wsLevels, '楼层')
  }

  // 区域列表
  if (draftScene.zones?.length) {
    const zonesData = [
      ['ID', '名称', '类型', 'X', 'Z', '宽度', '深度', '楼层ID'],
      ...draftScene.zones.map(z => [
        z.id,
        z.name || '',
        z.type || '',
        z.position?.x || 0,
        z.position?.z || 0,
        z.size?.width || 0,
        z.size?.depth || 0,
        z.levelId || '',
      ])
    ]
    const wsZones = XLSX.utils.aoa_to_sheet(zonesData)
    XLSX.utils.book_append_sheet(workbook, wsZones, '区域')
  }

  // 货架列表
  if (draftScene.racks?.length) {
    const racksData = [
      ['ID', '模板ID', 'X', 'Z', '旋转角度', '楼层ID'],
      ...draftScene.racks.map(r => [
        r.id,
        r.templateId || '',
        r.position?.x || 0,
        r.position?.z || 0,
        r.rotation || 0,
        r.levelId || '',
      ])
    ]
    const wsRacks = XLSX.utils.aoa_to_sheet(racksData)
    XLSX.utils.book_append_sheet(workbook, wsRacks, '货架')
  }

  // 墙体列表
  if (draftScene.walls?.length) {
    const wallsData = [
      ['ID', '起点X', '起点Z', '终点X', '终点Z', '高度(m)', '厚度(m)', '材质', '楼层ID'],
      ...draftScene.walls.map(w => [
        w.id,
        w.start?.x || 0,
        w.start?.z || 0,
        w.end?.x || 0,
        w.end?.z || 0,
        w.height || 2.8,
        w.thickness || 0.2,
        w.material || 'concrete',
        w.levelId || '',
      ])
    ]
    const wsWalls = XLSX.utils.aoa_to_sheet(wallsData)
    XLSX.utils.book_append_sheet(workbook, wsWalls, '墙体')
  }

  // 结构元素
  if (draftScene.structures?.length) {
    const structuresData = [
      ['ID', '类型', 'X', 'Y', 'Z', '旋转角度', '楼层ID'],
      ...draftScene.structures.map(s => [
        s.id,
        s.type || '',
        s.position?.x || 0,
        s.position?.y || 0,
        s.position?.z || 0,
        s.rotation || 0,
        s.levelId || '',
      ])
    ]
    const wsStructures = XLSX.utils.aoa_to_sheet(structuresData)
    XLSX.utils.book_append_sheet(workbook, wsStructures, '结构元素')
  }

  // 测量数据
  if (draftScene.measurements?.length) {
    const measurementsData = [
      ['ID', '类型', '值', '标签', '楼层ID'],
      ...draftScene.measurements.map(m => [
        m.id,
        m.type || '',
        m.value || 0,
        m.label || '',
        m.levelId || '',
      ])
    ]
    const wsMeasurements = XLSX.utils.aoa_to_sheet(measurementsData)
    XLSX.utils.book_append_sheet(workbook, wsMeasurements, '测量')
  }

  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
}

/**
 * 导出为 CSV (单个表格)
 */
export function exportToCSV(draftScene, entityType = 'zones') {
  const entities = draftScene[entityType] || []

  if (entities.length === 0) return ''

  // 生成表头
  const headers = Object.keys(entities[0])
  const rows = [headers.join(',')]

  // 生成数据行
  for (const entity of entities) {
    const row = headers.map(h => {
      const value = entity[h]
      if (typeof value === 'object') return `"${JSON.stringify(value).replace(/"/g, '""')}"`
      return value ?? ''
    })
    rows.push(row.join(','))
  }

  return rows.join('\n')
}

/**
 * 下载文本内容为文件
 */
export function downloadText(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * 下载 ArrayBuffer 为文件
 */
export function downloadArrayBuffer(buffer, filename) {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}