import { useEffect, useMemo, useState } from 'react'
import pipelineApi from '../../../../api/pipeline'
import {
  AppH5DataTable,
  AppH5MetricStrip,
  AppH5Notice,
  AppH5Panel,
} from '../../../../components/app/AppH5Surface'
import { getEventLabel, toNumber } from './lotteryHelpers'

const ZONE_NAMES = ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O']

function normalizeCapacityRatio(raw) {
  const value = toNumber(raw, 1)
  if (value < 0) return 0
  if (value > 2) return 2
  return value
}

function getCalculatedCapacity(zone) {
  return Math.floor(toNumber(zone.width, 0) * toNumber(zone.length, 0) * toNumber(zone.density, 0))
}

function getEffectiveCapacity(zone) {
  if (zone.zoneName === 'S') return 0
  return Math.floor(getCalculatedCapacity(zone) * normalizeCapacityRatio(zone.capacityRatio))
}

function getContrastYIQ(hexColor) {
  const hex = String(hexColor || '').replace('#', '')
  if (hex.length !== 6) return '#ffffff'
  const r = Number.parseInt(hex.slice(0, 2), 16)
  const g = Number.parseInt(hex.slice(2, 4), 16)
  const b = Number.parseInt(hex.slice(4, 6), 16)
  if ([r, g, b].some((value) => Number.isNaN(value))) return '#ffffff'
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000
  return yiq >= 148 ? '#142033' : '#ffffff'
}

function getZoneDisplayEvent(zone) {
  return zone.zoneName === 'S' ? '示意区' : (zone.event || '未指定项目')
}

function getEventAccent(eventName) {
  const value = String(eventName || '').trim()
  if (!value) {
    return {
      bg: 'rgba(18, 60, 103, 0.08)',
      border: 'rgba(18, 60, 103, 0.26)',
      text: '#143c67',
    }
  }
  if (value.includes('半')) {
    return {
      bg: 'rgba(190, 88, 24, 0.10)',
      border: 'rgba(190, 88, 24, 0.30)',
      text: '#9a4b16',
    }
  }
  return {
    bg: 'rgba(16, 110, 122, 0.10)',
    border: 'rgba(16, 110, 122, 0.30)',
    text: '#106e7a',
  }
}

function getZoneKey(zone, fallbackIndex = 0) {
  return String(zone.id || zone.zoneName || fallbackIndex)
}

function withNormalizedSortOrder(items) {
  return items.map((zone, index) => ({
    ...zone,
    sortOrder: index,
  }))
}

function ZoneVisualizer({ zones, selectedZoneKey, onSelectZone, onReorderZones }) {
  const [zoom, setZoom] = useState(1)
  const [hoveredZone, setHoveredZone] = useState(null)
  const [draggingZoneKey, setDraggingZoneKey] = useState('')
  const [dropTargetZoneKey, setDropTargetZoneKey] = useState('')

  if (!zones.length) {
    return (
      <div className="lottery-zone-visualizer lottery-zone-visualizer--empty">
        <div className="lottery-zone-visualizer__title">分区示意</div>
        <div className="lottery-zone-visualizer__empty">新增分区后，这里会实时显示起点沙盘布局。</div>
      </div>
    )
  }

  const totalLength = zones.reduce((sum, zone) => sum + toNumber(zone.length, 0) + toNumber(zone.gapDistance, 0), 0)
  const maxWidth = Math.max(...zones.map((zone) => Math.max(toNumber(zone.width, 0), zone.zoneName === 'S' ? 4 : 0)), 15)
  const viewWidth = 820
  const viewHeight = 170
  const paddingX = 24
  const archWidth = 14
  const roadWidth = Math.max(maxWidth, 8)
  const baseScaleX = Math.max((viewWidth - paddingX - archWidth - 36) / Math.max(totalLength, 1), 5)
  const scaleX = baseScaleX * zoom
  const scaleY = (viewHeight - 68) / Math.max(roadWidth, 1)
  const centerY = viewHeight / 2 + 10

  const laidOut = zones.reduce((acc, zone, index) => {
    const height = Math.max((zone.zoneName === 'S' ? 4 : toNumber(zone.width, 0)) * scaleY, zone.zoneName === 'S' ? 10 : 16)
    const width = Math.max(toNumber(zone.length, 0) * scaleX, zone.zoneName === 'S' ? 18 : 26)
    const x = acc.cursor
    const y = centerY - height / 2
    const gapWidth = Math.max(toNumber(zone.gapDistance, 0) * scaleX, 0)

    acc.items.push({
      index,
      zone,
      x,
      y,
      width,
      height,
      gapWidth,
    })
    acc.cursor += width + gapWidth + 2
    return acc
  }, { cursor: paddingX + archWidth + 10, items: [] }).items

  return (
    <div className="lottery-zone-visualizer">
      <div className="lottery-zone-visualizer__head">
        <div>
          <div className="lottery-zone-visualizer__title">分区示意</div>
          <div className="lottery-zone-visualizer__sub">长度和间隔按比例缩放，颜色、宽度和排序会实时反映在画布里，下面的摘要条也支持直接拖拽换位。</div>
        </div>
        <div className="lottery-zone-visualizer__controls">
          <div className="lottery-zone-visualizer__legend">
            <span>START 门</span>
            <span>长度按米数缩放</span>
            <span>`S` 区仅作示意</span>
          </div>
          <div className="lottery-zone-visualizer__zoom">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setZoom((value) => Math.max(0.7, Number((value - 0.15).toFixed(2))))}>-</button>
            <span>{Math.round(zoom * 100)}%</span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setZoom((value) => Math.min(1.8, Number((value + 0.15).toFixed(2))))}>+</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setZoom(1)}>Fit</button>
          </div>
        </div>
      </div>

      <div className="lottery-zone-visualizer__canvas" onMouseLeave={() => setHoveredZone(null)}>
        <svg viewBox={`0 0 ${viewWidth} ${viewHeight}`} className="lottery-zone-visualizer__svg" role="img" aria-label="起点分区实时示意图">
          <rect
            x={paddingX}
            y={centerY - (roadWidth * scaleY) / 2}
            width={viewWidth - paddingX - 12}
            height={roadWidth * scaleY}
            rx="10"
            fill="rgba(18, 60, 103, 0.08)"
          />

          <g>
            <rect
              x={paddingX}
              y={centerY - (roadWidth * scaleY) / 2 - 8}
              width={archWidth}
              height={(roadWidth * scaleY) + 16}
              rx="4"
              fill="#143c67"
            />
            <text
              x={paddingX + archWidth / 2}
              y={centerY}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="11"
              fontWeight="700"
              fill="#ffffff"
              transform={`rotate(-90, ${paddingX + archWidth / 2}, ${centerY})`}
            >
              START
            </text>
          </g>

          {laidOut.map((item) => {
            const color = item.zone.color || '#3478f6'
            const textColor = getContrastYIQ(color)
            const showLength = item.width >= 56
            const showMeta = item.width >= 82
            const eventLabel = getZoneDisplayEvent(item.zone)
            const capLabel = item.zone.zoneName === 'S' ? '不计容量' : `${getEffectiveCapacity(item.zone).toLocaleString()} 人`
            const nextItem = laidOut[item.index + 1]
            const eventAccent = getEventAccent(item.zone.event)
            const isSelected = selectedZoneKey === getZoneKey(item.zone, item.index)

            return (
              <g key={`${item.zone.id || item.zone.zoneName}-${item.x}`}>
                <rect
                  x={item.x}
                  y={item.y}
                  width={item.width}
                  height={item.height}
                  rx="8"
                  fill={color}
                  stroke={isSelected ? eventAccent.text : 'rgba(255,255,255,0.9)'}
                  strokeWidth={isSelected ? '4' : '2'}
                  onMouseMove={(event) => {
                    const svgRect = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
                    if (!svgRect) return
                    setHoveredZone({
                      zone: item.zone,
                      left: event.clientX - svgRect.left + 14,
                      top: event.clientY - svgRect.top - 10,
                    })
                  }}
                  onClick={() => onSelectZone?.(getZoneKey(item.zone, item.index))}
                />
                <text
                  x={item.x + item.width / 2}
                  y={showMeta ? item.y + (item.height / 2) - 8 : item.y + item.height / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={item.width < 42 ? '10' : '13'}
                  fontWeight="700"
                  fill={textColor}
                >
                  {item.zone.zoneName}
                </text>
                {showMeta ? (
                  <>
                    <text
                      x={item.x + item.width / 2}
                      y={item.y + (item.height / 2) + 7}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="9"
                      fontWeight="600"
                      fill={textColor}
                    >
                      {eventLabel}
                    </text>
                    <text
                      x={item.x + item.width / 2}
                      y={item.y + (item.height / 2) + 19}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="9"
                      fill={textColor}
                      opacity="0.92"
                    >
                      {capLabel}
                    </text>
                  </>
                ) : null}
                {showLength ? (
                  <text
                    x={item.x + item.width / 2}
                    y={item.y + item.height + 16}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#5e6978"
                  >
                    {toNumber(item.zone.length, 0)}m
                  </text>
                ) : null}
                {toNumber(item.zone.gapDistance, 0) > 0 && nextItem ? (
                  <>
                    <line
                      x1={item.x + item.width + 3}
                      y1={centerY}
                      x2={nextItem.x - 3}
                      y2={centerY}
                      stroke="#9a4b16"
                      strokeWidth="2"
                      strokeDasharray="5 5"
                    />
                    <text
                      x={(item.x + item.width + nextItem.x) / 2}
                      y={centerY - Math.max(item.height, nextItem.height) / 2 - 8}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="700"
                      fill="#9a4b16"
                    >
                      gap {toNumber(item.zone.gapDistance, 0)}m
                    </text>
                  </>
                ) : null}
              </g>
            )
          })}
        </svg>

        {hoveredZone ? (
          <div
            className="lottery-zone-tooltip"
            style={{
              left: `${hoveredZone.left}px`,
              top: `${hoveredZone.top}px`,
            }}
          >
            <strong>{hoveredZone.zone.zoneName} · {getZoneDisplayEvent(hoveredZone.zone)}</strong>
            <span>有效容量 {getEffectiveCapacity(hoveredZone.zone).toLocaleString()} 人</span>
            <span>宽 {toNumber(hoveredZone.zone.width, 0)}m / 长 {toNumber(hoveredZone.zone.length, 0)}m</span>
            <span>密度 {toNumber(hoveredZone.zone.density, 0)} / 系数 {normalizeCapacityRatio(hoveredZone.zone.capacityRatio)}</span>
          </div>
        ) : null}
      </div>

      <div className="lottery-zone-visualizer__rail">
        {zones.map((zone, index) => {
          const eventAccent = getEventAccent(zone.event)
          const zoneKey = getZoneKey(zone, index)
          const isSelected = selectedZoneKey === zoneKey
          const isDragging = draggingZoneKey === zoneKey
          const isDropTarget = dropTargetZoneKey === zoneKey && draggingZoneKey && draggingZoneKey !== zoneKey
          return (
          <button
            key={zone.id || zone.zoneName}
            type="button"
            className={`lottery-zone-visualizer__rail-card ${isSelected ? 'is-selected' : ''} ${isDragging ? 'is-dragging' : ''} ${isDropTarget ? 'is-drop-target' : ''}`}
            style={{
              borderColor: isSelected ? eventAccent.border : undefined,
              boxShadow: isSelected ? `inset 0 0 0 1px ${eventAccent.border}` : undefined,
            }}
            draggable
            onClick={() => onSelectZone?.(zoneKey)}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', zoneKey)
              setDraggingZoneKey(zoneKey)
              setDropTargetZoneKey(zoneKey)
              onSelectZone?.(zoneKey)
            }}
            onDragOver={(event) => {
              event.preventDefault()
              if (draggingZoneKey && draggingZoneKey !== zoneKey) {
                event.dataTransfer.dropEffect = 'move'
                setDropTargetZoneKey(zoneKey)
              }
            }}
            onDrop={(event) => {
              event.preventDefault()
              const sourceZoneKey = draggingZoneKey || event.dataTransfer.getData('text/plain')
              if (sourceZoneKey && sourceZoneKey !== zoneKey) {
                onReorderZones?.(sourceZoneKey, zoneKey)
                onSelectZone?.(sourceZoneKey)
              }
              setDraggingZoneKey('')
              setDropTargetZoneKey('')
            }}
            onDragEnd={() => {
              setDraggingZoneKey('')
              setDropTargetZoneKey('')
            }}
          >
            <div className="lottery-zone-visualizer__rail-head">
              <span className="lottery-zone-chip" style={{ background: zone.color || '#3478f6', color: getContrastYIQ(zone.color || '#3478f6') }}>
                {zone.zoneName}
              </span>
              <strong>{zone.zoneName === 'S' ? '示意区' : (zone.event || '未指定项目')}</strong>
            </div>
            <div className="lottery-zone-visualizer__rail-sort">
              <span>序号 {index + 1}</span>
              <span>拖拽换位</span>
            </div>
            <div className="lottery-zone-visualizer__rail-meta">
              <span>长 {toNumber(zone.length, 0)}m</span>
              <span>宽 {toNumber(zone.width, 0)}m</span>
              <span>gap {toNumber(zone.gapDistance, 0)}m</span>
              <span>有效 {getEffectiveCapacity(zone).toLocaleString()}</span>
            </div>
          </button>
        )})}
      </div>
    </div>
  )
}

export default function StartZoneSimulator({ raceId, raceDetail, preview, onUpdated }) {
  const [zones, setZones] = useState([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState('info')
  const [selectedZoneKey, setSelectedZoneKey] = useState('')

  useEffect(() => {
    let alive = true

    pipelineApi.getStartZones(Number(raceId))
      .then((items) => {
        if (!alive) return
        const normalizedZones = (items || []).map((zone) => ({
          ...zone,
          capacityRatio: normalizeCapacityRatio(zone.capacityRatio),
        }))
        setZones(normalizedZones)
        setSelectedZoneKey((current) => current || getZoneKey(normalizedZones[0], 0))
      })
      .catch((error) => {
        if (!alive) return
        setMessage(`加载起跑区失败：${error.message}`)
        setMessageTone('danger')
        setZones([])
      })

    return () => {
      alive = false
    }
  }, [raceId])

  const eventOptions = useMemo(
    () => (Array.isArray(raceDetail?.events) ? raceDetail.events.map((item) => getEventLabel(item?.name)) : []).filter(Boolean),
    [raceDetail?.events],
  )

  const totalZoneCap = useMemo(
    () => zones.reduce((sum, zone) => sum + getEffectiveCapacity(zone), 0),
    [zones],
  )

  const totalArea = useMemo(
    () => zones
      .filter((zone) => zone.zoneName !== 'S')
      .reduce((sum, zone) => sum + (toNumber(zone.width, 0) * toNumber(zone.length, 0)), 0),
    [zones],
  )

  const totalRoadLength = useMemo(
    () => zones
      .filter((zone) => zone.zoneName !== 'S')
      .reduce((sum, zone) => sum + toNumber(zone.length, 0) + toNumber(zone.gapDistance, 0), 0),
    [zones],
  )

  const totalTarget = preview?.step1?.totalTarget || 0
  const gap = totalTarget - totalZoneCap

  const metrics = [
    { key: 'zones', label: '分区数', value: zones.length.toLocaleString(), meta: '包含 S 示意区在内的当前分区数量。', pill: 'ZONE' },
    { key: 'capacity', label: '总有效容量', value: totalZoneCap.toLocaleString(), meta: '按宽度、长度、密度和容量系数推算。', pill: 'CAP' },
    { key: 'area', label: '总面积', value: `${totalArea.toLocaleString()} ㎡`, meta: '不含 S 区的总起跑面积。', pill: 'AREA' },
    { key: 'road', label: '占路长度', value: `${totalRoadLength.toLocaleString()} m`, meta: '按分区长度与间隔累计。', pill: 'ROAD' },
  ]

  const updateZone = (index, field, value) => {
    setZones((current) => current.map((zone, zoneIndex) => {
      if (zoneIndex !== index) return zone
      const next = {
        ...zone,
        [field]: ['width', 'length', 'density', 'gapDistance'].includes(field) ? toNumber(value, zone[field]) : value,
      }
      if (field === 'capacityRatio') {
        next.capacityRatio = normalizeCapacityRatio(value)
      }
      return {
        ...next,
        calculatedCapacity: getCalculatedCapacity(next),
      }
    }).map((zone, zoneIndex) => ({
      ...zone,
      sortOrder: zoneIndex,
    })))
  }

  useEffect(() => {
    if (!zones.length) {
      setSelectedZoneKey('')
      return
    }
    if (!zones.some((zone, index) => getZoneKey(zone, index) === selectedZoneKey)) {
      setSelectedZoneKey(getZoneKey(zones[0], 0))
    }
  }, [selectedZoneKey, zones])

  const addZone = () => {
    const usedNames = new Set(zones.map((zone) => zone.zoneName))
    const zoneName = ZONE_NAMES.find((item) => !usedNames.has(item)) || `Z${zones.length + 1}`
    const width = zoneName === 'S' ? 0 : 12
    const length = 20
    const density = 2.5

    setZones((current) => [...current, {
      raceId: Number(raceId),
      zoneName,
      width,
      length,
      density,
      calculatedCapacity: Math.floor(width * length * density),
      color: '#3478f6',
      sortOrder: current.length,
      gapDistance: 0,
      event: '',
      capacityRatio: 1,
    }].map((zone, index) => ({
      ...zone,
      sortOrder: index,
    })))
  }

  const moveZone = (index, direction) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= zones.length) return
    const next = [...zones]
    ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
    setZones(withNormalizedSortOrder(next))
  }

  const reorderZones = (sourceZoneKey, targetZoneKey) => {
    setZones((current) => {
      const sourceIndex = current.findIndex((zone, index) => getZoneKey(zone, index) === sourceZoneKey)
      const targetIndex = current.findIndex((zone, index) => getZoneKey(zone, index) === targetZoneKey)
      if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return current
      const next = [...current]
      const [dragged] = next.splice(sourceIndex, 1)
      next.splice(targetIndex, 0, dragged)
      return withNormalizedSortOrder(next)
    })
  }

  const removeZone = async (index) => {
    const zone = zones[index]
    try {
      if (zone?.id) {
        await pipelineApi.deleteStartZone(zone.id)
      }
      setZones((current) => withNormalizedSortOrder(current.filter((_, zoneIndex) => zoneIndex !== index)))
      onUpdated?.()
    } catch (error) {
      setMessage(`删除分区失败：${error.message}`)
      setMessageTone('danger')
    }
  }

  const saveAll = async () => {
    setSaving(true)
    setMessage('')
    try {
      for (let index = 0; index < zones.length; index += 1) {
        const zone = zones[index]
        await pipelineApi.saveStartZone({
          ...zone,
          raceId: Number(raceId),
          sortOrder: index,
          capacityRatio: normalizeCapacityRatio(zone.capacityRatio),
          calculatedCapacity: getCalculatedCapacity(zone),
        })
      }
      setMessage('起点沙盘已保存，分区排序和容量推演已同步刷新。')
      setMessageTone('success')
      onUpdated?.()
    } catch (error) {
      setMessage(`保存失败：${error.message}`)
      setMessageTone('danger')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="lottery-step-stack">
      {message ? <AppH5Notice tone={messageTone}>{message}</AppH5Notice> : null}

      <AppH5MetricStrip items={metrics} />

      <AppH5Panel title="起点沙盘" subtitle="分区容量直接对照预览中的 step2.gap，便于快速判断容量是否够用。">
        <div className={`lottery-help-block ${gap > 0 ? 'is-warning' : 'is-success'}`}>
          {gap > 0
            ? `当前总有效容量 ${totalZoneCap.toLocaleString()}，距离目标人数还差 ${gap.toLocaleString()}。`
            : `当前总有效容量 ${totalZoneCap.toLocaleString()}，比目标人数多出 ${Math.abs(gap).toLocaleString()}。`}
        </div>

        <ZoneVisualizer
          zones={zones}
          selectedZoneKey={selectedZoneKey}
          onSelectZone={setSelectedZoneKey}
          onReorderZones={reorderZones}
        />

        <AppH5DataTable>
          <table>
          <thead>
            <tr>
              <th>区</th>
              <th>颜色</th>
              <th>项目</th>
              <th>宽度</th>
              <th>长度</th>
              <th>密度</th>
              <th>间隔</th>
              <th>容量系数</th>
              <th>有效容量</th>
              <th>排序</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {zones.map((zone, index) => {
              const zoneKey = getZoneKey(zone, index)
              const isSelected = selectedZoneKey === zoneKey
              const eventAccent = getEventAccent(zone.event)
              return (
              <tr
                key={zone.id || `${zone.zoneName}-${index}`}
                className={isSelected ? 'lottery-zone-row is-selected' : 'lottery-zone-row'}
                style={isSelected ? { '--lottery-zone-accent': eventAccent.border } : undefined}
                onClick={() => setSelectedZoneKey(zoneKey)}
              >
                <td>
                  <div className="lottery-zone-chip" style={{ background: zone.color || '#3478f6', color: getContrastYIQ(zone.color || '#3478f6') }}>
                    {zone.zoneName}
                  </div>
                </td>
                <td><input type="color" value={zone.color || '#3478f6'} onChange={(event) => updateZone(index, 'color', event.target.value)} /></td>
                <td>
                  {zone.zoneName === 'S' ? (
                    <span className="lottery-zone-muted">示意区</span>
                  ) : (
                    <select className="lottery-select" value={zone.event || ''} onChange={(event) => updateZone(index, 'event', event.target.value)}>
                      <option value="">未指定</option>
                      {eventOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  )}
                </td>
                <td><input className="lottery-input lottery-input--table" type="number" value={zone.width} onChange={(event) => updateZone(index, 'width', event.target.value)} /></td>
                <td><input className="lottery-input lottery-input--table" type="number" value={zone.length} onChange={(event) => updateZone(index, 'length', event.target.value)} /></td>
                <td><input className="lottery-input lottery-input--table" type="number" step="0.1" value={zone.density} onChange={(event) => updateZone(index, 'density', event.target.value)} /></td>
                <td><input className="lottery-input lottery-input--table" type="number" value={zone.gapDistance || 0} onChange={(event) => updateZone(index, 'gapDistance', event.target.value)} /></td>
                <td><input className="lottery-input lottery-input--table" type="number" step="0.1" min="0" max="2" value={normalizeCapacityRatio(zone.capacityRatio)} onChange={(event) => updateZone(index, 'capacityRatio', event.target.value)} /></td>
                <td>{getEffectiveCapacity(zone).toLocaleString()}</td>
                <td>
                  <div className="lottery-inline-actions">
                    <button className="btn btn--ghost btn--sm" onClick={() => moveZone(index, -1)} disabled={index === 0}>↑</button>
                    <button className="btn btn--ghost btn--sm" onClick={() => moveZone(index, 1)} disabled={index === zones.length - 1}>↓</button>
                  </div>
                </td>
                <td>
                  <button className="btn btn--ghost btn--sm" onClick={() => removeZone(index)}>删除</button>
                </td>
              </tr>
            )})}
          </tbody>
          </table>
        </AppH5DataTable>

        <div className="lottery-footer-actions">
          <button className="btn btn--secondary" onClick={addZone}>新增分区</button>
          <button className="btn btn--primary" onClick={saveAll} disabled={saving}>
            {saving ? '保存中...' : '保存起点沙盘'}
          </button>
        </div>
      </AppH5Panel>
    </div>
  )
}
