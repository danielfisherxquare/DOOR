import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import bibApi from '../../../../api/bib'
import bibTrackingApi from '../../../../api/bibTracking'
import pipelineApi from '../../../../api/pipeline'
import useAuthStore from '../../../../stores/authStore'
import useRaceContextStore from '../../../../stores/raceContextStore'
import useWorkspaceStore from '../../../../features/workspace/workspaceStore'
import { resolveSurfaceOrgId, resolveSurfaceRaceId } from '../../../../utils/surfaceContext'
import {
  AppH5ContextState,
  AppH5DataTable,
  AppH5EmptyState,
  AppH5Notice,
  AppH5Panel,
  AppH5Surface,
  AppH5Tabs,
} from '../../../../components/app/AppH5Surface'
import BibStats from './ported/BibStats'
import BibRuleManager from './ported/BibRuleManager'
import BibExecution from './ported/BibExecution'
import WindowPlanner from './ported/WindowPlanner'
import BibLayoutWorkbench from './BibLayoutWorkbench'
import { DEFAULT_BIB_NUMBERING_CONFIG } from './ported/bibNumberingConfig'
import { eventWindowMapKey, sanitizeEventWindowRange } from './ported/eventWindowUtils'
import { normalizeZone } from './ported/bibUtils'
import { allocateZonesByEventAndScoreDetailed } from './ported/zoneAllocator'
import './bib-page.css'

const CONFIG_PREFIX = 'bib-numbering-config:'
const DEFAULT_EVENT_LABEL = '未分项目'
const BIB_TABS = [
  { key: 'numbering', label: '排号流程', icon: '01', desc: '规则、窗口和执行' },
  { key: 'layout', label: '号码布排版', icon: '02', desc: '模板、字段和画布预览' },
]

function sanitizeConfig(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_BIB_NUMBERING_CONFIG }
  const src = raw
  const n = (value, fallback) => Math.max(1, Number.isFinite(Number(value)) ? Math.floor(Number(value)) : fallback)
  const bagWindowCount = n(src.bagWindowCount, DEFAULT_BIB_NUMBERING_CONFIG.bagWindowCount)
  const expoWindowCount = n(src.expoWindowCount, DEFAULT_BIB_NUMBERING_CONFIG.expoWindowCount)
  const fallbackBagRange = { start: 1, end: Math.max(1, bagWindowCount) }
  const fallbackExpoRange = { start: 1, end: Math.max(1, expoWindowCount) }

  const parseEventWindowRangeMap = (input, fallbackRange) => {
    const result = {}
    if (!input || typeof input !== 'object') return result
    for (const [eventRaw, rangeRaw] of Object.entries(input)) {
      result[eventWindowMapKey(eventRaw)] = sanitizeEventWindowRange(rangeRaw, fallbackRange)
    }
    return result
  }

  const zonePrefixMap = {}
  for (const [zone, prefixRaw] of Object.entries(src.zonePrefixMap || {})) {
    const zoneName = normalizeZone(zone)
    const prefix = String(prefixRaw || '').trim().match(/[A-Za-z0-9]/)?.[0]?.toUpperCase() || ''
    if (!zoneName || !prefix) continue
    zonePrefixMap[zoneName] = prefix
  }

  const zoneStartNoMaleMap = {}
  for (const [zone, startRaw] of Object.entries(src.zoneStartNoMaleMap || {})) {
    const zoneName = normalizeZone(zone)
    if (!zoneName) continue
    zoneStartNoMaleMap[zoneName] = n(startRaw, DEFAULT_BIB_NUMBERING_CONFIG.startNoMale)
  }

  const zoneStartNoFemaleMap = {}
  for (const [zone, startRaw] of Object.entries(src.zoneStartNoFemaleMap || {})) {
    const zoneName = normalizeZone(zone)
    if (!zoneName) continue
    zoneStartNoFemaleMap[zoneName] = n(startRaw, DEFAULT_BIB_NUMBERING_CONFIG.startNoFemale)
  }

  return {
    bagWindowCount,
    bagWindowCapacity: n(src.bagWindowCapacity, DEFAULT_BIB_NUMBERING_CONFIG.bagWindowCapacity),
    expoWindowCount,
    expoWindowCapacity: n(src.expoWindowCapacity, DEFAULT_BIB_NUMBERING_CONFIG.expoWindowCapacity),
    expoSeed: typeof src.expoSeed === 'string' ? src.expoSeed : '',
    bibNoMode: src.bibNoMode === 'global' ? 'global' : 'perZone',
    startNoMale: n(src.startNoMale, DEFAULT_BIB_NUMBERING_CONFIG.startNoMale),
    startNoFemale: n(src.startNoFemale, DEFAULT_BIB_NUMBERING_CONFIG.startNoFemale),
    bibDigits: n(src.bibDigits, DEFAULT_BIB_NUMBERING_CONFIG.bibDigits),
    zonePrefixMap,
    zoneStartNoMaleMap,
    zoneStartNoFemaleMap,
    eventBagWindowRangeMap: parseEventWindowRangeMap(src.eventBagWindowRangeMap, fallbackBagRange),
    eventExpoWindowRangeMap: parseEventWindowRangeMap(src.eventExpoWindowRangeMap, fallbackExpoRange),
  }
}

function buildPrefixFromZoneName(zoneName) {
  const first = String(zoneName || '').trim().match(/[A-Za-z0-9]/)?.[0]
  return first ? first.toUpperCase() : 'Z'
}

function remapZoneKeys(map, from, to) {
  const next = { ...(map || {}) }
  if (Object.prototype.hasOwnProperty.call(next, from)) {
    next[to] = next[from]
    delete next[from]
  }
  return next
}

function remapConfigZoneName(config, fromZone, toZone) {
  const from = normalizeZone(fromZone)
  const to = normalizeZone(toZone)
  if (!from || !to || from === to) return config
  return {
    ...config,
    zonePrefixMap: remapZoneKeys(config.zonePrefixMap, from, to),
    zoneStartNoMaleMap: remapZoneKeys(config.zoneStartNoMaleMap, from, to),
    zoneStartNoFemaleMap: remapZoneKeys(config.zoneStartNoFemaleMap, from, to),
  }
}

function mergeZonePrefixMap(config, startZones) {
  const uniqueZones = Array.from(new Set(
    [...startZones]
      .sort((a, b) => {
        const ao = Number.isFinite(a.sortOrder) ? Number(a.sortOrder) : Number.MAX_SAFE_INTEGER
        const bo = Number.isFinite(b.sortOrder) ? Number(b.sortOrder) : Number.MAX_SAFE_INTEGER
        if (ao !== bo) return ao - bo
        return String(a.zoneName || '').localeCompare(String(b.zoneName || ''), 'zh-CN')
      })
      .map((zone) => normalizeZone(zone.zoneName))
      .filter(Boolean),
  ))

  const mergedPrefixMap = {}
  const mergedMaleMap = {}
  const mergedFemaleMap = {}

  for (const zone of uniqueZones) {
    mergedPrefixMap[zone] = config.zonePrefixMap?.[zone] || buildPrefixFromZoneName(zone)
    mergedMaleMap[zone] = Math.max(1, Math.floor(Number(config.zoneStartNoMaleMap?.[zone] ?? config.startNoMale)))
    mergedFemaleMap[zone] = Math.max(1, Math.floor(Number(config.zoneStartNoFemaleMap?.[zone] ?? config.startNoFemale)))
  }

  return {
    ...config,
    zonePrefixMap: mergedPrefixMap,
    zoneStartNoMaleMap: mergedMaleMap,
    zoneStartNoFemaleMap: mergedFemaleMap,
  }
}

function toDbRecordForZonePreview(row) {
  return {
    id: row.id,
    raceId: undefined,
    name: String(row.name || '').trim(),
    namePinyin: '',
    phone: '',
    country: '',
    idType: '',
    idNumber: String(row.idNumber || '').trim(),
    gender: String(row.gender || '').trim(),
    age: '',
    birthday: '',
    event: String(row.event || '').trim(),
    source: '',
    clothingSize: '',
    province: '',
    city: '',
    district: '',
    address: '',
    email: '',
    emergencyName: '',
    emergencyPhone: '',
    bloodType: '',
    orderGroupId: '',
    paymentStatus: '',
    mark: '',
    lotteryStatus: String(row.lotteryStatus || '').trim(),
    personalBestFull: row.personalBestFull,
    personalBestHalf: row.personalBestHalf,
    lotteryZone: String(row.lotteryZone || '').trim(),
    _source: '',
    _importedAt: String(row._importedAt || '').trim(),
  }
}

function buildEventPlans(eligibleByEventExcludingS, startZones, zonePreviewRecords) {
  const eventCounter = new Map()
  for (const item of eligibleByEventExcludingS || []) {
    const event = String(item.event || '').trim() || DEFAULT_EVENT_LABEL
    const count = Math.max(0, Math.floor(Number(item.count || 0)))
    if (count <= 0) continue
    eventCounter.set(event, count)
  }

  let zoneDistributionByEvent = new Map()
  try {
    if (zonePreviewRecords.length > 0 && startZones.length > 0) {
      const allocation = allocateZonesByEventAndScoreDetailed(zonePreviewRecords, startZones)
      for (const group of allocation.zoneGuide.groups) {
        const zoneDistribution = []
        for (const row of group.rows) {
          if (row.totalCount > 0) {
            zoneDistribution.push({ zone: row.zone, count: row.totalCount })
          }
        }
        if (zoneDistribution.length > 0) {
          zoneDistributionByEvent.set(group.eventKey, zoneDistribution)
        }
      }
    }
  } catch {
    zoneDistributionByEvent = new Map()
  }

  const eventOrder = [...startZones]
    .sort((a, b) => {
      const ao = Number.isFinite(a.sortOrder) ? Number(a.sortOrder) : Number.MAX_SAFE_INTEGER
      const bo = Number.isFinite(b.sortOrder) ? Number(b.sortOrder) : Number.MAX_SAFE_INTEGER
      if (ao !== bo) return ao - bo
      return String(a.zoneName || '').localeCompare(String(b.zoneName || ''), 'zh-CN')
    })
    .map((zone) => String(zone.event || '').trim())
    .filter(Boolean)
    .filter((event, index, arr) => arr.indexOf(event) === index)

  const result = []
  for (const event of eventOrder) {
    if (!eventCounter.has(event)) continue
    result.push({
      event,
      participants: eventCounter.get(event) || 0,
      zoneDistribution: zoneDistributionByEvent.get(event.toLowerCase()),
    })
    eventCounter.delete(event)
  }

  const remaining = Array.from(eventCounter.entries())
    .sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))
    .map(([event, participants]) => ({
      event,
      participants,
      zoneDistribution: zoneDistributionByEvent.get(String(event).toLowerCase()),
    }))

  return [...result, ...remaining]
}

export default function BibPage() {
  const [searchParams] = useSearchParams()
  const user = useAuthStore((state) => state.user)
  const session = useWorkspaceStore((state) => state.session)
  const orgId = resolveSurfaceOrgId(searchParams, user, session)
  const resolvedRaceId = resolveSurfaceRaceId(searchParams, user, orgId, session)
  const raceId = Number(resolvedRaceId || 0)
  const currentRace = useRaceContextStore((state) => state.currentRace)
  const [loading, setLoading] = useState(false)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [stats, setStats] = useState({
    total: 0,
    eligible: 0,
    assigned: 0,
    byEvent: {},
    tracking: {
      receiptPrinted: 0,
      pickedUp: 0,
      checkedIn: 0,
      finished: 0,
    },
  })
  const [previewRecords, setPreviewRecords] = useState([])
  const [templates, setTemplates] = useState([])
  const [startZones, setStartZones] = useState([])
  const [zonePreviewRecords, setZonePreviewRecords] = useState([])
  const [eventPlans, setEventPlans] = useState([])
  const [config, setConfigState] = useState({ ...DEFAULT_BIB_NUMBERING_CONFIG })
  const [message, setMessage] = useState(null)
  const [activeTab, setActiveTab] = useState('numbering')

  const messageTimerRef = useRef(null)
  const loadRequestRef = useRef(0)
  const configKey = `${CONFIG_PREFIX}${raceId}`

  const setConfig = useCallback((next) => {
    const sanitized = sanitizeConfig(next)
    setConfigState(sanitized)
    localStorage.setItem(configKey, JSON.stringify(sanitized))
  }, [configKey])

  const resetConfig = useCallback(() => {
    setConfig({ ...DEFAULT_BIB_NUMBERING_CONFIG })
  }, [setConfig])

  const showMessage = useCallback((text, type = 'info') => {
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current)
    setMessage({ text, type })
    messageTimerRef.current = setTimeout(() => setMessage(null), 4000)
  }, [])

  const loadData = useCallback(async () => {
    if (!raceId) return
    const requestId = ++loadRequestRef.current
    setLoading(true)
    try {
      const localRaw = localStorage.getItem(configKey)
      let parsedConfig = null
      if (localRaw) {
        try {
          parsedConfig = JSON.parse(localRaw)
        } catch {
          parsedConfig = null
        }
      }
      const localConfig = sanitizeConfig(parsedConfig)

      const [
        overview,
        zonesResponse,
        executionDataset,
        trackingResponse,
        templateRows,
      ] = await Promise.all([
        bibApi.getBibOverview(raceId),
        pipelineApi.getStartZones(raceId),
        bibApi.getBibExecutionDataset(raceId),
        bibTrackingApi.getStats(raceId).catch(() => ({ data: null })),
        bibApi.getBibTemplates(raceId).catch(() => []),
      ])

      if (requestId !== loadRequestRef.current) return

      const trackingStats = trackingResponse?.data || trackingResponse || {}
      const byEvent = {}
      for (const item of overview?.eligibleByEvent || []) {
        const event = String(item.event || '').trim() || DEFAULT_EVENT_LABEL
        byEvent[event] = Math.max(0, Math.floor(Number(item.count || 0)))
      }

      setStats({
        total: Math.max(0, Math.floor(Number(overview?.total || 0))),
        eligible: Math.max(0, Math.floor(Number(overview?.eligible || 0))),
        assigned: Math.max(0, Math.floor(Number(overview?.assigned || 0))),
        byEvent,
        tracking: {
          receiptPrinted: Math.max(0, Number(trackingStats.receiptPrinted || 0)),
          pickedUp: Math.max(0, Number(trackingStats.pickedUp || 0)),
          checkedIn: Math.max(0, Number(trackingStats.checkedIn || 0)),
          finished: Math.max(0, Number(trackingStats.finished || 0)),
        },
      })

      setPreviewRecords((overview?.latestAssigned || []).map((record) => ({
        id: Number(record.id || 0),
        name: String(record.name || ''),
        bibNumber: String(record.bibNumber || ''),
      })))

      setTemplates(Array.isArray(templateRows) ? templateRows : [])

      const zoneList = Array.isArray(zonesResponse?.data) ? zonesResponse.data : []
      const mappedEligibleRecords = Array.isArray(executionDataset?.eligibleRecords)
        ? executionDataset.eligibleRecords.map(toDbRecordForZonePreview)
        : []
      setStartZones(zoneList)
      setZonePreviewRecords(mappedEligibleRecords)
      setEventPlans(buildEventPlans(overview?.eligibleByEventExcludingS || [], zoneList, mappedEligibleRecords))

      const mergedConfig = mergeZonePrefixMap(localConfig, zoneList)
      setConfigState(mergedConfig)
      localStorage.setItem(configKey, JSON.stringify(mergedConfig))
    } catch (error) {
      if (requestId !== loadRequestRef.current) return
      showMessage(error instanceof Error ? error.message : '加载排号数据失败', 'error')
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false)
        setHasLoadedOnce(true)
      }
    }
  }, [configKey, raceId, showMessage])

  const updateStartZoneFromBib = useCallback(async (zone, patch) => {
    const fullZone = startZones.find((item) => (zone.id != null && item.id === zone.id) || item.zoneName === zone.zoneName)
    if (!fullZone) {
      showMessage('未找到对应的起点分区，无法同步', 'error')
      return
    }

    const nextZoneName = String(patch.zoneName ?? zone.zoneName).trim()
    if (!nextZoneName) return
    const nextColor = String(patch.color ?? zone.color ?? fullZone.color ?? '#3B82F6')
    const nextScoreUpperSeconds = patch.scoreUpperSeconds === undefined
      ? (fullZone.scoreUpperSeconds ?? null)
      : patch.scoreUpperSeconds

    const renamedConfig = remapConfigZoneName(config, fullZone.zoneName, nextZoneName)
    if (renamedConfig !== config) {
      setConfig(renamedConfig)
    }

    await pipelineApi.saveStartZone({
      id: fullZone.id,
      raceId: fullZone.raceId,
      zoneName: nextZoneName,
      width: fullZone.width,
      length: fullZone.length,
      density: fullZone.density,
      calculatedCapacity: fullZone.calculatedCapacity,
      event: fullZone.event || '',
      color: nextColor,
      sortOrder: fullZone.sortOrder || 0,
      gapDistance: fullZone.gapDistance || 0,
      capacityRatio: Number.isFinite(Number(fullZone.capacityRatio)) ? Number(fullZone.capacityRatio) : 1,
      scoreUpperSeconds: nextScoreUpperSeconds,
    })

    await loadData()
    showMessage('已同步到起点沙盘', 'success')
  }, [config, loadData, setConfig, showMessage, startZones])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => () => {
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current)
  }, [])

  const isInitialLoading = loading && !hasLoadedOnce
  const headerSummary = useMemo(() => {
    if (currentRace?.name) return currentRace.name
    if (raceId) return `赛事 ID: ${raceId}`
    return '请先选择赛事'
  }, [currentRace?.name, raceId])

  const tabItems = useMemo(() => BIB_TABS.map((tab) => ({
    key: tab.key,
    label: tab.label,
    badge: tab.icon,
    active: tab.key === activeTab,
    onClick: () => setActiveTab(tab.key),
  })), [activeTab])

  if (!raceId) {
    return (
      <AppH5Surface
        className="bib-page"
        eyebrow="我的赛事"
        title="选手排号"
        summary="基于分区、成绩和窗口规则完成号码布编号、存衣窗口号和博览会窗口号分配。"
      >
        <AppH5ContextState
          title="请先选择赛事"
          description="在顶部控制面板中选择目标赛事后，才能进入完整的选手排号工作台。"
        />
      </AppH5Surface>
    )
  }

  return (
    <AppH5Surface
      className="bib-page"
      eyebrow="我的赛事"
      title="选手排号"
      summary={headerSummary}
      actions={(
        <div className="bib-toolbar">
          <div className="bib-toolbar__meta">
            已排号 {stats.assigned.toLocaleString()} / 可排号 {stats.eligible.toLocaleString()}
          </div>
          {loading && hasLoadedOnce ? <div className="bib-toolbar__chip">同步中...</div> : null}
        </div>
      )}
    >

      {message ? (
        <AppH5Notice tone={message.type === 'error' ? 'danger' : message.type === 'success' ? 'success' : 'info'}>
          {message.text}
        </AppH5Notice>
      ) : null}

      {isInitialLoading ? (
        <AppH5Panel title="排号工作台" summary="正在加载规则、起点分区和执行数据。">
          <div className="bib-loading">正在加载排号数据...</div>
        </AppH5Panel>
      ) : (
        <div className="bib-workbench">
          <AppH5Tabs
            className="bib-tab-strip"
            items={tabItems}
            ariaLabel="排号工作台标签"
          />

          {activeTab === 'numbering' ? (
            <>
              <BibStats stats={stats} />

              <WindowPlanner
                config={config}
                setConfig={setConfig}
                eventPlans={eventPlans}
                startZones={startZones}
              />

              <BibRuleManager
                config={config}
                setConfig={setConfig}
                onReset={resetConfig}
                startZones={startZones}
                zonePreviewRecords={zonePreviewRecords}
                onUpdateStartZone={updateStartZoneFromBib}
              />

              <BibExecution
                raceId={raceId}
                config={config}
                startZones={startZones}
                onReload={loadData}
                showMessage={showMessage}
              />

              <div className="bib-side-grid">
                <AppH5Panel title="最近号码布记录" summary="最近写入的号码布编号会显示在这里。">
                  {previewRecords.length > 0 ? (
                    <div className="bib-preview-list">
                      {previewRecords.map((record, index) => (
                        <div key={record.id || `preview-${index}`} className="bib-preview-item">
                          <span className="bib-preview-item__order">{index + 1}</span>
                          <span className="bib-preview-item__name">{record.name}</span>
                          <span className="bib-preview-item__number">{record.bibNumber || '-'}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <AppH5EmptyState
                      title="暂无排号记录"
                      description="执行排号后，这里会显示最近生成的号码布编号。"
                      icon="BIB"
                    />
                  )}
                </AppH5Panel>

                <AppH5Panel title="号码区间模板" summary="保留后端已存在的项目号段配置，便于核对历史模板。">
                  {templates.length > 0 ? (
                    <AppH5DataTable>
                      <table>
                        <thead>
                          <tr>
                            <th>项目</th>
                            <th>前缀</th>
                            <th>起始号</th>
                            <th>结束号</th>
                            <th>位数</th>
                          </tr>
                        </thead>
                        <tbody>
                          {templates.map((template, index) => (
                            <tr key={template.id || `${template.event}-${index}`}>
                              <td>{template.event || '-'}</td>
                              <td>{template.prefix || '-'}</td>
                              <td>{template.startNumber ?? '-'}</td>
                              <td>{template.endNumber ?? '-'}</td>
                              <td>{template.padding ?? '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </AppH5DataTable>
                  ) : (
                    <AppH5EmptyState
                      title="暂无号码区间模板"
                      description="当前赛事还没有写入项目号段模板，但排号流程已经可以按分区规则执行。"
                      icon="TPL"
                    />
                  )}
                </AppH5Panel>
              </div>
            </>
          ) : (
            <BibLayoutWorkbench raceId={raceId} />
          )}
        </div>
      )}
    </AppH5Surface>
  )
}
