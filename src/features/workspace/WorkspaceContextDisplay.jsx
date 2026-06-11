export default function WorkspaceContextDisplay({ roleName, session, selectedOrgId, selectedRaceId, onSwitch }) {
  const orgLabel = session?.orgName || selectedOrgId || '未选择机构'
  const scopeLabel = session?.raceName || selectedRaceId || '机构运营'

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
