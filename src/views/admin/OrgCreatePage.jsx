import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import adminApi from '../../api/adminApi'
import {
  CommandMetricGrid,
  CommandNotice,
  CommandPanel,
  CommandShell,
  CommandStatusTag,
} from '../../components/command/CommandPrimitives'

function OrgCreatePage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [adminUsername, setAdminUsername] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('Abc123456')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState(1)
  const [orgId, setOrgId] = useState(null)

  const metrics = useMemo(() => ([
    {
      key: 'step',
      label: '当前阶段',
      value: `0${step}`,
      meta: step === 1 ? '先创建机构，再补管理员账号。' : '机构已创建，正在补充首位管理员。',
      pill: 'STEP',
    },
    {
      key: 'org',
      label: '机构状态',
      value: orgId ? '已创建' : '待创建',
      meta: '机构是团队、赛事、项目和账号的承接容器。',
      pill: 'ORG',
    },
    {
      key: 'admin',
      label: '管理员状态',
      value: step === 2 ? '待创建' : '未开始',
      meta: '管理员首次登录后会被要求修改初始密码。',
      pill: 'IAM',
    },
  ]), [orgId, step])

  const handleCreateOrg = async (event) => {
    event.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await adminApi.createOrg({ name: name.trim() })
      if (res.success) {
        setOrgId(res.data.id)
        setStep(2)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateAdmin = async (event) => {
    event.preventDefault()
    if (!adminUsername.trim() || !adminEmail.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await adminApi.createOrgAdmin(orgId, {
        username: adminUsername.trim(),
        email: adminEmail.trim(),
        password: adminPassword,
      })
      if (res.success) navigate('/admin/orgs')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="command-page surface-admin command-page--narrow">
      <CommandShell
        eyebrow="平台治理"
        title="新建机构"
        summary="用两步完成机构创建和首位管理员初始化，让后续团队、赛事和项目都有清晰的组织归属。"
        actions={(
          <button type="button" className="btn btn--ghost" onClick={() => navigate('/admin/orgs')}>
            返回机构列表
          </button>
        )}
      >
        <CommandMetricGrid items={metrics} />
      </CommandShell>

      {error ? <CommandNotice tone="danger">{error}</CommandNotice> : null}

      <div className="command-grid command-grid--two">
        <CommandPanel
          title={step === 1 ? '步骤 1 / 创建机构' : '步骤 2 / 创建管理员'}
          subtitle={step === 1 ? '先建立组织实体，再挂接后台管理员账号。' : '补齐首位机构管理员，确保机构可以立即接管日常运营。'}
        >
          {step === 1 ? (
            <form onSubmit={handleCreateOrg} className="command-stack">
              <div className="input-group">
                <label>机构名称</label>
                <input
                  className="input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="例如：XX 马拉松组委会"
                  disabled={loading}
                />
              </div>
              <div className="command-actions-row">
                <button type="submit" className="btn btn--primary" disabled={loading || !name.trim()}>
                  {loading ? '创建中...' : '创建机构'}
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => navigate('/admin/orgs')}>
                  取消
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleCreateAdmin} className="command-stack">
              <div className="input-group">
                <label>管理员用户名</label>
                <input
                  className="input"
                  value={adminUsername}
                  onChange={(event) => setAdminUsername(event.target.value)}
                  placeholder="admin_username"
                  disabled={loading}
                />
              </div>
              <div className="input-group">
                <label>管理员邮箱</label>
                <input
                  className="input"
                  type="email"
                  value={adminEmail}
                  onChange={(event) => setAdminEmail(event.target.value)}
                  placeholder="admin@example.com"
                  disabled={loading}
                />
              </div>
              <div className="input-group">
                <label>初始密码</label>
                <input
                  className="input"
                  value={adminPassword}
                  onChange={(event) => setAdminPassword(event.target.value)}
                  disabled={loading}
                />
              </div>
              <CommandStatusTag tone="warning">管理员首次登录后必须修改密码</CommandStatusTag>
              <div className="command-actions-row">
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={loading || !adminUsername.trim() || !adminEmail.trim()}
                >
                  {loading ? '创建中...' : '创建管理员'}
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => navigate('/admin/orgs')}>
                  暂时跳过
                </button>
              </div>
            </form>
          )}
        </CommandPanel>

        <CommandPanel
          title="创建规则"
          subtitle="保持机构命名、权限初始化和交接动作的一致性。"
        >
          <div className="command-definition-list">
            <div className="command-definition-list__row">
              <span className="command-definition-list__label">机构命名</span>
              <span className="command-definition-list__value">建议使用正式运营名称，避免后续团队、赛事与财务页面出现歧义。</span>
            </div>
            <div className="command-definition-list__row">
              <span className="command-definition-list__label">账号初始化</span>
              <span className="command-definition-list__value">机构创建完成后即可补齐管理员，用于接管成员、赛事和证件流程。</span>
            </div>
            <div className="command-definition-list__row">
              <span className="command-definition-list__label">安全提醒</span>
              <span className="command-definition-list__value">初始密码仅用于首登，建议创建完成后立即通知对方修改并启用正式交接流程。</span>
            </div>
          </div>
        </CommandPanel>
      </div>
    </div>
  )
}

export default OrgCreatePage
