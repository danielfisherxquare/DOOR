/**
 * 2D 平面图生成工具
 * 生成 SVG 或 PDF 格式的平面图
 */
import { getWallLength } from './snapEngine'

/**
 * 生成 SVG 平面图
 */
export function generateSVGFloorPlan(draftScene, options = {}) {
  const {
    scale = 100,            // 1m = 100px
    includeDimensions = true,
    includeLabels = true,
    levelId = null,         // null = 所有楼层
    padding = 50,
  } = options

  const warehouse = draftScene.warehouse || { width: 20, depth: 15 }
  const width = warehouse.width * scale + padding * 2
  const height = warehouse.depth * scale + padding * 2

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    .wall { fill: #4B5563; stroke: none; }
    .wall-dimension { font-family: Arial, sans-serif; font-size: 10px; fill: #6B7280; }
    .zone { fill-opacity: 0.3; stroke-width: 1; }
    .zone-label { font-family: Arial, sans-serif; font-size: 12px; fill: #374151; font-weight: bold; }
    .rack { fill: #8B5CF6; stroke: #7C3AED; stroke-width: 1; }
    .column { fill: #6B7280; }
    .door { fill: #FCD34D; }
    .window { fill: #60A5FA; }
    .dimension-line { stroke: #9CA3AF; stroke-width: 1; stroke-dasharray: 4 2; }
    .dimension-text { font-family: Arial, sans-serif; font-size: 10px; fill: #6B7280; }
    .title { font-family: Arial, sans-serif; font-size: 16px; fill: #111827; font-weight: bold; }
  </style>

  <!-- 背景 -->
  <rect width="${width}" height="${height}" fill="#F9FAFB"/>

  <!-- 标题 -->
  <text x="${width / 2}" y="25" text-anchor="middle" class="title">${warehouse.name || '仓库平面图'}</text>

  <!-- 仓库边界 -->
  <rect x="${padding}" y="${padding}" width="${warehouse.width * scale}" height="${warehouse.depth * scale}" fill="none" stroke="#D1D5DB" stroke-width="2"/>
`

  // 比例尺
  svg += `
  <!-- 比例尺 -->
  <g transform="translate(${padding}, ${height - 30})">
    <line x1="0" y1="0" x2="${scale}" y2="0" stroke="#374151" stroke-width="2"/>
    <line x1="0" y1="-5" x2="0" y2="5" stroke="#374151" stroke-width="2"/>
    <line x1="${scale}" y1="-5" x2="${scale}" y2="5" stroke="#374151" stroke-width="2"/>
    <text x="${scale / 2}" y="15" text-anchor="middle" class="dimension-text">1m</text>
  </g>
`

  // 区域
  const zones = filterByLevel(draftScene.zones, levelId)
  for (const zone of zones) {
    const x = padding + (zone.position?.x || 0) * scale
    const y = padding + (zone.position?.z || 0) * scale
    const w = (zone.size?.width || 2) * scale
    const h = (zone.size?.depth || 2) * scale
    const color = getZoneColor(zone.type)

    svg += `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" class="zone" fill="${color}" stroke="${color}"/>`

    if (includeLabels && zone.name) {
      svg += `
  <text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" dominant-baseline="middle" class="zone-label">${zone.name}</text>`
    }

    if (includeDimensions) {
      svg += `
  <text x="${x + w / 2}" y="${y + h + 12}" text-anchor="middle" class="dimension-text">${(zone.size?.width || 2).toFixed(1)}m × ${(zone.size?.depth || 2).toFixed(1)}m</text>`
    }
  }

  // 墙体
  const walls = filterByLevel(draftScene.walls, levelId)
  for (const wall of walls) {
    const x1 = padding + (wall.start?.x || 0) * scale
    const z1 = padding + (wall.start?.z || 0) * scale
    const x2 = padding + (wall.end?.x || 0) * scale
    const z2 = padding + (wall.end?.z || 0) * scale
    const thickness = (wall.thickness || 0.2) * scale

    // 使用 line 绘制墙体
    svg += `
  <line x1="${x1}" y1="${z1}" x2="${x2}" y2="${z2}" class="wall" stroke="#4B5563" stroke-width="${thickness}" stroke-linecap="round"/>`

    if (includeDimensions) {
      const length = getWallLength(wall)
      const midX = (x1 + x2) / 2
      const midZ = (z1 + z2) / 2
      svg += `
  <text x="${midX}" y="${midZ - 10}" text-anchor="middle" class="wall-dimension">${length.toFixed(2)}m</text>`
    }

    // 门窗
    if (wall.openings?.length) {
      const length = getWallLength(wall)
      const angle = Math.atan2((wall.end?.z || 0) - (wall.start?.z || 0), (wall.end?.x || 0) - (wall.start?.x || 0))

      for (const opening of wall.openings) {
        const pos = (opening.position || 0.5) * length
        const opX = x1 + pos * Math.cos(angle) * scale / length * length
        const opZ = z1 + pos * Math.sin(angle) * scale / length * length
        const opW = (opening.width || 0.9) * scale

        if (opening.type === 'door') {
          svg += `
  <rect x="${opX - opW / 2}" y="${opZ - thickness / 2}" width="${opW}" height="${thickness}" class="door" transform="rotate(${angle * 180 / Math.PI}, ${opX}, ${opZ})"/>`
        } else if (opening.type === 'window') {
          svg += `
  <rect x="${opX - opW / 2}" y="${opZ - thickness / 2}" width="${opW}" height="${thickness}" class="window" transform="rotate(${angle * 180 / Math.PI}, ${opX}, ${opZ})"/>`
        }
      }
    }
  }

  // 货架
  const racks = filterByLevel(draftScene.racks, levelId)
  for (const rack of racks) {
    const x = padding + (rack.position?.x || 0) * scale
    const y = padding + (rack.position?.z || 0) * scale
    const w = 1.2 * scale  // 默认货架宽度
    const h = 0.6 * scale  // 默认货架深度

    svg += `
  <rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" class="rack" transform="rotate(${((rack.rotation || 0) * 180 / Math.PI) % 360}, ${x}, ${y})"/>`
  }

  // 柱子
  const structures = filterByLevel(draftScene.structures, levelId)
  const columns = structures.filter(s => s.type === 'column')
  for (const col of columns) {
    const x = padding + (col.position?.x || 0) * scale
    const y = padding + (col.position?.z || 0) * scale
    const size = (col.dimensions?.width || 0.4) * scale

    if (col.columnType === 'circular') {
      svg += `
  <circle cx="${x}" cy="${y}" r="${size / 2}" class="column"/>`
    } else {
      svg += `
  <rect x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" class="column"/>`
    }
  }

  svg += '\n</svg>'
  return svg
}

/**
 * 生成 PDF 平面图 (使用 jsPDF)
 */
export async function generatePDFFloorPlan(draftScene, options = {}) {
  const { jsPDF } = await import('jspdf')

  const {
    scale = 100,
    includeLabels = true,
    levelId = null,
  } = options

  const warehouse = draftScene.warehouse || { width: 20, depth: 15 }
  const pageWidth = warehouse.width * scale + 100
  const pageHeight = warehouse.depth * scale + 150

  const doc = new jsPDF({
    orientation: pageWidth > pageHeight ? 'landscape' : 'portrait',
    unit: 'px',
    format: [pageWidth, pageHeight]
  })

  // 标题
  doc.setFontSize(20)
  doc.text(warehouse.name || '仓库平面图', pageWidth / 2, 30, { align: 'center' })

  // 仓库边界
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(2)
  doc.rect(50, 50, warehouse.width * scale, warehouse.depth * scale)

  // 区域
  const zones = filterByLevel(draftScene.zones, levelId)
  for (const zone of zones) {
    const x = 50 + (zone.position?.x || 0) * scale
    const y = 50 + (zone.position?.z || 0) * scale
    const w = (zone.size?.width || 2) * scale
    const h = (zone.size?.depth || 2) * scale
    const color = getZoneColorRGB(zone.type)

    doc.setFillColor(color.r, color.g, color.b)
    doc.setDrawColor(color.r, color.g, color.b)
    doc.rect(x, y, w, h, 'FD')

    if (includeLabels && zone.name) {
      doc.setFontSize(12)
      doc.setTextColor(55, 65, 81)
      doc.text(zone.name, x + w / 2, y + h / 2, { align: 'center', baseline: 'middle' })
    }
  }

  // 墙体
  const walls = filterByLevel(draftScene.walls, levelId)
  for (const wall of walls) {
    const x1 = 50 + (wall.start?.x || 0) * scale
    const y1 = 50 + (wall.start?.z || 0) * scale
    const x2 = 50 + (wall.end?.x || 0) * scale
    const y2 = 50 + (wall.end?.z || 0) * scale
    const thickness = (wall.thickness || 0.2) * scale

    doc.setFillColor(75, 85, 99)
    doc.setDrawColor(75, 85, 99)
    doc.setLineWidth(thickness)
    doc.line(x1, y1, x2, y2)
  }

  // 比例尺
  doc.setDrawColor(55, 65, 81)
  doc.setLineWidth(2)
  doc.line(50, pageHeight - 30, 50 + scale, pageHeight - 30)
  doc.setFontSize(10)
  doc.setTextColor(55, 65, 81)
  doc.text('1m', 50 + scale / 2, pageHeight - 15, { align: 'center' })

  return doc
}

// 辅助函数
function filterByLevel(entities, levelId) {
  if (!entities) return []
  if (levelId === null) return entities
  return entities.filter(e => !e.levelId || e.levelId === levelId)
}

function getZoneColor(type) {
  const colors = {
    storage: '#A78BFA',
    receiving: '#34D399',
    shipping: '#FBBF24',
    office: '#60A5FA',
    cold: '#22D3EE',
    hazardous: '#F87171',
  }
  return colors[type] || '#94A3B8'
}

function getZoneColorRGB(type) {
  const colors = {
    storage: { r: 167, g: 139, b: 250 },
    receiving: { r: 52, g: 211, b: 153 },
    shipping: { r: 251, g: 191, b: 36 },
    office: { r: 96, g: 165, b: 250 },
    cold: { r: 34, g: 211, b: 238 },
    hazardous: { r: 248, g: 113, b: 113 },
  }
  return colors[type] || { r: 148, g: 163, b: 184 }
}
