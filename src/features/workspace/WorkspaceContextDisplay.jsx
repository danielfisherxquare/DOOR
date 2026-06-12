export default function WorkspaceContextDisplay({ roleName, session, selectedOrgId, selectedRaceId, onSwitch }) {
  const isPlatformScope = session?.scopeType === 'platform'
  const orgLabel = isPlatformScope ? '系统平台' : (session?.orgName || selectedOrgId || '未选择机构')
  const scopeLabel = isPlatformScope ? '平台控制台' : (session?.raceName || selectedRaceId || '机构运营')

  return (
    <button type="button" className="workspace-context-display" onClick={onSwitch} title="切换工作区">
      <span className="workspace-context-display__icon material-symbols-outlined" aria-hidden="true">location_on</span>
      <span className="workspace-context-display__text">
        <span className="workspace-context-display__role">{roleName}</span>
        <span className="workspace-context-display__scope">{orgLabel} / {scopeLabel}</span>
      </span>
      <span className="workspace-context-display__switch material-symbols-outlined" aria-hidden="true">sync_alt</span>
    </button>
  )
}
