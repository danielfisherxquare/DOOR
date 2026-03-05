import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import adminApi from '../../api/adminApi'
import useAuthStore from '../../stores/authStore'

function RacePermissionsPage() {
    const { user } = useAuthStore()
    const isSuperAdmin = user?.role === 'super_admin'

    const [searchParams] = useSearchParams()
    const preselectedUserId = searchParams.get('userId')
    const preselectedUsername = searchParams.get('username')
    const orgId = searchParams.get('orgId') || undefined
    const isGlobalSuperAdmin = isSuperAdmin && !orgId

    const [members, setMembers] = useState([])
    const [selectedUser, setSelectedUser] = useState(preselectedUserId || null)
    const [selectedUsername, setSelectedUsername] = useState(preselectedUsername || '')
    const [allRaces, setAllRaces] = useState([])
    const [editedPermissions, setEditedPermissions] = useState({})
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState('')

    useEffect(() => {
        setMessage('')
        setSelectedUser(preselectedUserId || null)
        setSelectedUsername(preselectedUsername || '')
        setAllRaces([])
        setEditedPermissions({})

        setLoading(true)

        const loader = isGlobalSuperAdmin
            ? adminApi.getAllUsers({ limit: 500 })
            : adminApi.getOrgUsers({ limit: 200, orgId })

        loader
            .then((res) => {
                if (!res.success) return

                const rawMembers = res.data.items || []
                const nextMembers = isGlobalSuperAdmin
                    ? rawMembers.filter((m) => m.role !== 'super_admin' && !!m.org_id)
                    : rawMembers

                setMembers(nextMembers)

                if (preselectedUserId && !nextMembers.find((m) => String(m.id) === String(preselectedUserId))) {
                    setSelectedUser(null)
                    setSelectedUsername('')
                }
            })
            .catch(() => { })
            .finally(() => setLoading(false))
    }, [orgId, isGlobalSuperAdmin, preselectedUserId, preselectedUsername])

    useEffect(() => {
        if (!selectedUser) {
            setAllRaces([])
            setEditedPermissions({})
            return
        }

        setLoading(true)

        adminApi.getUserRacePermissions(selectedUser, orgId ? { orgId } : undefined)
            .then((res) => {
                if (!res.success) return

                const nextAllRaces = res.data.allRaces || []
                const permissions = res.data.permissions || []
                setAllRaces(nextAllRaces)

                const edited = {}
                for (const race of nextAllRaces) {
                    const perm = permissions.find((p) => p.race_id === race.id)
                    const defaultLevel = race.orgAccessLevel === 'viewer' ? 'viewer' : 'editor'
                    const nextLevel = perm?.access_level || defaultLevel
                    edited[race.id] = {
                        checked: !!perm,
                        accessLevel: race.orgAccessLevel === 'viewer' ? 'viewer' : nextLevel,
                    }
                }
                setEditedPermissions(edited)
            })
            .catch(() => { })
            .finally(() => setLoading(false))
    }, [selectedUser, orgId])

    const handleUserSelect = (member) => {
        setSelectedUser(String(member.id))
        setSelectedUsername(member.username)
        setMessage('')
    }

    const handleToggleRace = (raceId) => {
        setEditedPermissions((prev) => ({
            ...prev,
            [raceId]: { ...prev[raceId], checked: !prev[raceId]?.checked },
        }))
    }

    const handleAccessChange = (raceId, level) => {
        setEditedPermissions((prev) => ({
            ...prev,
            [raceId]: { ...prev[raceId], accessLevel: level },
        }))
    }

    const handleSave = async () => {
        if (!selectedUser) return

        setSaving(true)
        setMessage('')

        const permissions = Object.entries(editedPermissions)
            .filter(([, v]) => v.checked)
            .map(([raceId, v]) => {
                const race = allRaces.find((row) => Number(row.id) === Number(raceId))
                const orgAccessLevel = race?.orgAccessLevel || 'editor'
                const accessLevel = orgAccessLevel === 'viewer' ? 'viewer' : v.accessLevel
                return { raceId: Number(raceId), accessLevel }
            })

        try {
            const res = await adminApi.setUserRacePermissions(selectedUser, { permissions }, orgId)
            if (res.success) setMessage(res.data.message || '保存成功')
        } catch (err) {
            setMessage(`❌ ${err.message}`)
        } finally {
            setSaving(false)
        }
    }

    const handleSelectAll = () => {
        const allChecked = allRaces.length > 0 && allRaces.every((r) => editedPermissions[r.id]?.checked)
        const edited = {}
        for (const race of allRaces) {
            edited[race.id] = { checked: !allChecked, accessLevel: editedPermissions[race.id]?.accessLevel || 'editor' }
        }
        setEditedPermissions(edited)
    }

    return (
        <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>🔑 赛事授权</h1>

            {isGlobalSuperAdmin && (
                <div style={{ padding: '12px 16px', marginBottom: 16, borderRadius: 10, background: 'rgba(245,158,11,0.1)', color: '#b45309', fontSize: 14 }}>
                    未选择机构：当前可为全平台用户分配赛事权限，权限范围将按目标用户所属机构自动限制。
                </div>
            )}

            {message && (
                <div
                    style={{
                        padding: '12px 16px',
                        borderRadius: 8,
                        background: message.startsWith('❌') ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                        color: message.startsWith('❌') ? '#ef4444' : '#16a34a',
                        fontSize: 14,
                        marginBottom: 16,
                    }}
                >
                    {message}
                </div>
            )}

            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
                <div style={{ width: 280, flexShrink: 0, background: 'var(--color-bg-card, #fff)', borderRadius: 12, boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06))', overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', background: 'var(--color-bg-secondary, #fafafa)', borderBottom: '1px solid var(--border-color, #e5e7eb)', fontWeight: 600, fontSize: 14 }}>
                        选择用户
                    </div>
                    <div style={{ maxHeight: 540, overflowY: 'auto' }}>
                        {members.map((m) => (
                            <div
                                key={m.id}
                                onClick={() => handleUserSelect(m)}
                                style={{
                                    padding: '10px 16px',
                                    cursor: 'pointer',
                                    background: String(selectedUser) === String(m.id) ? 'var(--color-primary, #27272A)' : 'var(--color-bg-card, #fff)',
                                    color: String(selectedUser) === String(m.id) ? 'var(--color-text-on-dark, #fff)' : 'inherit',
                                    borderBottom: '1px solid var(--border-color, #f0f0f0)',
                                    transition: 'background 100ms',
                                }}
                            >
                                <div style={{ fontWeight: 600, fontSize: 14 }}>{m.username}</div>
                                <div style={{ fontSize: 12, opacity: 0.75 }}>
                                    {m.role}
                                    {isGlobalSuperAdmin && (m.org_name || m.org_id) ? ` · ${m.org_name || m.org_id}` : ''}
                                </div>
                            </div>
                        ))}
                        {members.length === 0 && (
                            <div style={{ padding: 16, textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 13 }}>暂无用户</div>
                        )}
                    </div>
                </div>

                <div style={{ flex: 1, background: 'var(--color-bg-card, #fff)', borderRadius: 12, boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06))' }}>
                    {!selectedUser ? (
                        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-secondary)' }}>请先选择一个用户</div>
                    ) : loading ? (
                        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-secondary)' }}>加载中...</div>
                    ) : (
                        <>
                            <div style={{ padding: '12px 16px', background: 'var(--color-bg-secondary, #fafafa)', borderBottom: '1px solid var(--border-color, #e5e7eb)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <span style={{ fontWeight: 600 }}>{selectedUsername}</span>
                                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginLeft: 8 }}>的赛事权限</span>
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button className="btn btn--ghost btn--sm" onClick={handleSelectAll}>
                                        {allRaces.length > 0 && allRaces.every((r) => editedPermissions[r.id]?.checked) ? '取消全选' : '全选'}
                                    </button>
                                    <button className="btn btn--primary btn--sm" onClick={handleSave} disabled={saving}>
                                        {saving ? '保存中...' : '保存'}
                                    </button>
                                </div>
                            </div>

                            {allRaces.length === 0 ? (
                                <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-secondary)' }}>该用户所属机构暂无赛事</div>
                            ) : (
                                <div style={{ padding: 8 }}>
                                    {allRaces.map((race) => {
                                        const perm = editedPermissions[race.id] || { checked: false, accessLevel: 'editor' }
                                        const isViewerOnlyRace = race.orgAccessLevel === 'viewer'
                                        return (
                                            <div key={race.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, background: perm.checked ? 'rgba(99,102,241,0.04)' : 'transparent', transition: 'background 100ms' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={perm.checked}
                                                    onChange={() => handleToggleRace(race.id)}
                                                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                                                />
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: 600, fontSize: 14 }}>{race.name}</div>
                                                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                                                        {race.date || ''}
                                                        {race.location ? ` · ${race.location}` : ''}
                                                    </div>
                                                </div>
                                                {perm.checked && (
                                                    <select
                                                        value={isViewerOnlyRace ? 'viewer' : perm.accessLevel}
                                                        onChange={(e) => handleAccessChange(race.id, e.target.value)}
                                                        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-color, #d1d5db)', fontSize: 13 }}
                                                        disabled={isViewerOnlyRace}
                                                    >
                                                        {!isViewerOnlyRace && <option value="editor">编辑</option>}
                                                        <option value="viewer">只读</option>
                                                    </select>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

export default RacePermissionsPage
