import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import clothingApi from '../../../../api/clothing'
import useAuthStore from '../../../../stores/authStore'
import useRaceContextStore from '../../../../stores/raceContextStore'
import useWorkspaceStore from '../../../../features/workspace/workspaceStore'
import { resolveSurfaceOrgId, resolveSurfaceRaceId } from '../../../../utils/surfaceContext'
import {
  buildClothingStatisticsRows,
  findClothingLimit,
  formatClothingGender,
} from './clothingViewModel'
import {
  AppH5ContextState,
  AppH5DataTable,
  AppH5EmptyState,
  AppH5Notice,
  AppH5Panel,
  AppH5Surface,
} from '../../../../components/app/AppH5Surface'
import './clothing-page.css'

export default function ClothingPage() {
  const [searchParams] = useSearchParams()
  const user = useAuthStore((state) => state.user)
  const session = useWorkspaceStore((state) => state.session)
  const orgId = resolveSurfaceOrgId(searchParams, user, session)
  const raceId = resolveSurfaceRaceId(searchParams, user, orgId, session)
  const currentRace = useRaceContextStore(state => state.currentRace)

  const [loading, setLoading] = useState(false)
  const [limits, setLimits] = useState([])
  const [statistics, setStatistics] = useState([])

  const loadData = useCallback(async () => {
    if (!raceId) return
    setLoading(true)
    try {
      const [limitsResponse, statsResponse] = await Promise.all([
        clothingApi.getLimits(raceId).catch(() => null),
        clothingApi.getStatistics(raceId).catch(() => null),
      ])
      setLimits(Array.isArray(limitsResponse?.data) ? limitsResponse.data : Array.isArray(limitsResponse) ? limitsResponse : [])
      const statsData = statsResponse?.data || statsResponse
      setStatistics(buildClothingStatisticsRows(
        Array.isArray(statsData?.items) ? statsData.items : [],
      ))
    } catch (err) {
      console.error('加载服装数据失败:', err)
    } finally {
      setLoading(false)
    }
  }, [raceId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const getEvents = () => {
    const events = new Set(limits.map(l => l.event).filter(Boolean))
    return Array.from(events)
  }

  const getSizes = () => {
    const sizes = new Set(limits.map(l => l.size).filter(Boolean))
    return Array.from(sizes).sort()
  }

  const totalInventory = limits.reduce((sum, item) => sum + Number(item.totalInventory || 0), 0)
  const totalUsed = limits.reduce((sum, item) => sum + Number(item.usedCount || 0), 0)
  const totalGap = statistics.reduce((sum, item) => sum + item.overstock, 0)
  const eventCount = new Set(limits.map((item) => item.event).filter(Boolean)).size

  const metrics = [
    {
      key: 'race',
      label: '目标赛事',
      value: currentRace?.name || `#${raceId}`,
      meta: '库存、需求和缺口统计只作用于当前赛事。',
      pill: 'RACE',
    },
    {
      key: 'inventory',
      label: '总库存',
      value: totalInventory.toLocaleString(),
      meta: `当前已使用 ${totalUsed.toLocaleString()} 件。`,
      pill: 'STOCK',
    },
    {
      key: 'events',
      label: '覆盖项目',
      value: eventCount.toLocaleString(),
      meta: totalGap > 0 ? `仍有 ${totalGap.toLocaleString()} 件缺口待处理。` : '当前没有库存缺口。',
      pill: 'GRID',
    },
  ]

  if (!raceId) {
    return (
      <AppH5Surface
        className="clothing-page"
        eyebrow="我的赛事"
        title="服装物资"
        summary="统一查看当前赛事的服装库存、尺码分布、需求与缺口。"
      >
        <AppH5ContextState
          title="请先选择赛事"
          description="在顶部控制面板中选择目标赛事后，才能管理服装物资。"
        />
      </AppH5Surface>
    )
  }

  const events = getEvents()
  const sizes = getSizes()

  return (
    <AppH5Surface
      className="clothing-page"
      eyebrow="我的赛事"
      title="服装物资"
      summary="围绕当前赛事统一管理库存、缺口和尺码结构，避免把物资状态散落在抽签与排号页面里。"
      metrics={metrics}
    >

      <AppH5Panel title="库存概览" summary="按项目与性别查看各尺码库存占用，快速定位超配和缺口。">
        {loading ? (
          <AppH5Notice tone="info">正在加载服装物资...</AppH5Notice>
        ) : limits.length === 0 ? (
          <AppH5EmptyState icon="BOX" title="暂无库存数据" description="当前赛事还没有配置服装库存。" />
        ) : (
          <>
            {events.map(event => (
              <div key={event} className="clothing-section">
                <h3>{event}</h3>
                
                <div className="clothing-subsection">
                  <h4>男子</h4>
                  <div className="clothing-grid">
                    {sizes.map(size => {
                      const limit = findClothingLimit(limits, event, 'M', size)
                      return (
                        <div key={`male-${size}`} className="clothing-card">
                          <div className="clothing-card-size">{size}</div>
                          <div className="clothing-card-numbers">
                            <span className="clothing-card-used">{limit?.usedCount || 0}</span>
                            <span className="clothing-card-divider">/</span>
                            <span className="clothing-card-total">{limit?.totalInventory || 0}</span>
                          </div>
                          {limit && limit.usedCount > limit.totalInventory && (
                            <div className="clothing-card-warning">超出库存</div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="clothing-subsection">
                  <h4>女子</h4>
                  <div className="clothing-grid">
                    {sizes.map(size => {
                      const limit = findClothingLimit(limits, event, 'F', size)
                      return (
                        <div key={`female-${size}`} className="clothing-card">
                          <div className="clothing-card-size">{size}</div>
                          <div className="clothing-card-numbers">
                            <span className="clothing-card-used">{limit?.usedCount || 0}</span>
                            <span className="clothing-card-divider">/</span>
                            <span className="clothing-card-total">{limit?.totalInventory || 0}</span>
                          </div>
                          {limit && limit.usedCount > limit.totalInventory && (
                            <div className="clothing-card-warning">超出库存</div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ))}

            {statistics.length > 0 && (
              <div className="clothing-section">
                <h3>统计汇总</h3>
                <AppH5DataTable>
                  <table className="clothing-table">
                    <thead>
                      <tr>
                        <th>项目</th>
                        <th>性别</th>
                        <th>尺码</th>
                        <th>已用</th>
                        <th>库存</th>
                        <th>剩余</th>
                        <th>超额</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statistics.map((s, i) => (
                        <tr key={i}>
                          <td>{s.event}</td>
                          <td>{formatClothingGender(s.gender)}</td>
                          <td>{s.size}</td>
                          <td>{s.usedCount}</td>
                          <td>{s.totalInventory}</td>
                          <td>{s.remaining}</td>
                          <td className={s.overstock > 0 ? 'clothing-gap-negative' : ''}>
                            {s.overstock > 0 ? `+${s.overstock}` : 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </AppH5DataTable>
              </div>
            )}
          </>
        )}
      </AppH5Panel>
    </AppH5Surface>
  )
}
