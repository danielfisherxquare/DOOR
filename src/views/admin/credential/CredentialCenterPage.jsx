import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCredentialSurface } from './useCredentialSurface'
import {
  AdminDataTable,
  AdminEmptyState,
  AdminNotice,
  AdminSectionHeader,
  AdminStatusPill,
  AdminSurface,
} from '../../../components/admin/AdminWorkbench'

function formatNumber(value) {
  return Number(value || 0).toLocaleString('zh-CN')
}

const STATUS_LABELS = {
  submitted: '待审核',
  under_review: '审核中',
  approved: '已通过',
  rejected: '已驳回',
  generated: '已生成',
}

export default function CredentialCenterPage() {
  const { buildHref, credentialApi, orgId, raceId } = useCredentialSurface()

  const [categories, setCategories] = useState([])
  const [accessAreas, setAccessAreas] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const context = useMemo(() => ({ orgId, raceId: raceId || '' }), [orgId, raceId])

  useEffect(() => {
    const load = async () => {
      if (!raceId) {
        setCategories([])
        setAccessAreas([])
        setRequests([])
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const [categoryRes, accessRes, requestRes] = await Promise.all([
          credentialApi.getCategories(raceId),
          credentialApi.getAccessAreas(raceId),
          credentialApi.getRequests(raceId),
        ])

        if (categoryRes.success) setCategories(categoryRes.data || [])
        if (accessRes.success) setAccessAreas(accessRes.data || [])
        if (requestRes.success) setRequests(requestRes.data || [])
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [credentialApi, raceId])

  const metrics = useMemo(() => {
    const pendingCount = requests.filter((item) => ['submitted', 'under_review'].includes(item.status)).length
    const generatedCount = requests.filter((item) => item.status === 'generated').length

    return [
      { label: '通行区域', value: loading ? '...' : formatNumber(accessAreas.length), meta: '证件规则的最底层范围。' },
      { label: '证件类别', value: loading ? '...' : formatNumber(categories.length), meta: '类别决定默认规则与审核链路。' },
      { label: '待处理请求', value: loading ? '...' : formatNumber(pendingCount), meta: '审核与制证最值得优先处理的池子。' },
      { label: '已生成证件', value: loading ? '...' : formatNumber(generatedCount), meta: '从申请进入发放追踪的部分。' },
    ]
  }, [accessAreas.length, categories.length, loading, requests])

  const stageLinks = useMemo(() => ([
    {
      title: '基础规则',
      summary: '先锁定赛事，再处理区域、类别和样式这些不会频繁变化的规则。',
      links: [
        { label: '选择赛事', href: buildHref('/credential/select-race', context) },
        { label: '通行区域', href: buildHref('/credential/access-areas', context) },
        { label: '证件类别', href: buildHref('/credential/categories', context) },
        { label: '证件样式', href: buildHref('/credential/styles', context) },
      ],
    },
    {
      title: '作业处理',
      summary: '把建单、审核和领取放回同一条处理线，而不是分散成平铺功能菜单。',
      links: [
        { label: '申请与建单', href: buildHref('/credential/requests', context) },
        { label: '审核中心', href: buildHref('/credential/review', context) },
        { label: '领取管理', href: buildHref('/credential/issue', context) },
      ],
    },
  ]), [buildHref, context])

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <AdminSectionHeader
        eyebrow="证件流程"
        title="证件中心"
        description="证件管理现在从一组平铺页面，改成围绕同一赛事上下文的流程型工作区。先看规则，再处理申请，再进入审核和发放，路径会更自然。"
        metrics={metrics}
        actions={
          raceId
            ? <Link to={buildHref('/credential/requests', context)} className="btn btn--primary">进入申请池</Link>
            : <Link to={buildHref('/credential/select-race', context)} className="btn btn--primary">先选择赛事</Link>
        }
      />

      {!raceId ? (
        <AdminSurface title="先锁定赛事" subtitle="证件链路必须有明确的赛事作用域。">
          <div style={contextGuideStyle}>
            <div style={contextGuideIconStyle}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v4M12 16h.01"/>
              </svg>
            </div>
            <h3 style={contextGuideTitleStyle}>当前没有赛事上下文</h3>
            <p style={contextGuideDescStyle}>
              证件区域、类别、审核和领取都依赖同一个赛事。请先选择要操作的赛事：
            </p>
            <div style={contextGuideActionsStyle}>
              <Link to={buildHref('/credential/select-race', context)} className="btn btn--primary">
                前往选择赛事
              </Link>
              <span style={contextGuideHintStyle}>
                或在页面顶部的「目标赛事」下拉框中选择
              </span>
            </div>
          </div>
        </AdminSurface>
      ) : (
        <>
          <div style={stageGridStyle}>
            {stageLinks.map((stage) => (
              <AdminSurface key={stage.title} title={stage.title} subtitle={stage.summary}>
                <div style={stageLinkGridStyle}>
                  {stage.links.map((item) => (
                    <Link key={item.label} to={item.href} className="btn btn--ghost" style={{ justifyContent: 'flex-start' }}>
                      {item.label}
                    </Link>
                  ))}
                </div>
              </AdminSurface>
            ))}
          </div>

          <AdminSurface title="当前处理信号" subtitle="优先把审核池和异常状态暴露出来，减少进到子页面后才发现问题。">
            {requests.length === 0 ? (
              <AdminNotice tone="success">当前赛事还没有证件请求，可以先配置规则或直接创建新请求。</AdminNotice>
            ) : (
              <div style={signalGridStyle}>
                <div style={signalCardStyle}>
                  <AdminStatusPill tone="warning">待审核</AdminStatusPill>
                  <span style={signalValueStyle}>{formatNumber(requests.filter((item) => ['submitted', 'under_review'].includes(item.status)).length)}</span>
                  <span style={signalMetaStyle}>进入审核中心优先处理。</span>
                </div>
                <div style={signalCardStyle}>
                  <AdminStatusPill tone="success">可发放</AdminStatusPill>
                  <span style={signalValueStyle}>{formatNumber(requests.filter((item) => item.status === 'generated').length)}</span>
                  <span style={signalMetaStyle}>已生成证件，适合转入领取管理。</span>
                </div>
                <div style={signalCardStyle}>
                  <AdminStatusPill tone="danger">已驳回</AdminStatusPill>
                  <span style={signalValueStyle}>{formatNumber(requests.filter((item) => item.status === 'rejected').length)}</span>
                  <span style={signalMetaStyle}>需要回看驳回原因并重新建单。</span>
                </div>
              </div>
            )}
          </AdminSurface>

          <AdminSurface title="最近请求" subtitle="保留一眼可见的近况，不用每次都跳进完整列表。">
            {requests.length === 0 ? (
              <AdminEmptyState title="暂无请求" description="可以从申请与建单入口直接创建第一批请求。" />
            ) : (
              <AdminDataTable>
                <thead>
                  <tr>
                    <th>申请人</th>
                    <th>类别</th>
                    <th>状态</th>
                    <th>提交时间</th>
                    <th>近路</th>
                  </tr>
                </thead>
                <tbody>
                  {requests
                    .slice()
                    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
                    .slice(0, 6)
                    .map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div style={primaryCellStyle}>{item.personName}</div>
                          <div style={secondaryCellStyle}>{item.orgName || '-'}</div>
                        </td>
                        <td>{item.categoryName || '-'}</td>
                        <td>
                          <AdminStatusPill tone={item.status === 'rejected' ? 'danger' : item.status === 'generated' ? 'success' : 'warning'}>
                            {STATUS_LABELS[item.status] || item.status}
                          </AdminStatusPill>
                        </td>
                        <td>{new Date(item.createdAt).toLocaleString('zh-CN')}</td>
                        <td>
                          <Link className="btn btn--ghost btn--sm" to={buildHref(`/credential/${item.status === 'generated' ? 'issue' : 'review'}`, context)}>
                            {item.status === 'generated' ? '去发放' : '去处理'}
                          </Link>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </AdminDataTable>
            )}
          </AdminSurface>
        </>
      )}
    </div>
  )
}

const stageGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: 18,
}

const stageLinkGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: 10,
}

const signalGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12,
}

const signalCardStyle = {
  display: 'grid',
  gap: 8,
  padding: '16px 18px',
  borderRadius: 18,
  background: 'rgba(15, 23, 42, 0.04)',
}

const signalValueStyle = {
  fontSize: 28,
  fontWeight: 700,
  letterSpacing: '-0.05em',
}

const signalMetaStyle = {
  color: '#66717f',
  fontSize: 13,
  lineHeight: 1.6,
}

const primaryCellStyle = {
  fontWeight: 700,
  letterSpacing: '-0.02em',
}

const secondaryCellStyle = {
  marginTop: 4,
  color: '#66717f',
  fontSize: 12,
}

// 上下文引导样式
const contextGuideStyle = {
  display: 'grid',
  justifyItems: 'center',
  gap: 16,
  padding: '32px 24px',
  textAlign: 'center',
}

const contextGuideIconStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 80,
  height: 80,
  borderRadius: 24,
  background: 'rgba(249, 115, 22, 0.1)',
  color: '#c2410c',
}

const contextGuideTitleStyle = {
  margin: 0,
  fontSize: 20,
  fontWeight: 700,
  letterSpacing: '-0.03em',
}

const contextGuideDescStyle = {
  margin: 0,
  maxWidth: 400,
  color: '#66717f',
  fontSize: 14,
  lineHeight: 1.7,
}

const contextGuideActionsStyle = {
  display: 'grid',
  gap: 12,
  marginTop: 8,
}

const contextGuideHintStyle = {
  fontSize: 13,
  color: '#66717f',
}
