import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import adminApi from '../../api/adminApi'

function RacePermissionsPage() {
    const [searchParams] = useSearchParams()
    const preselectedUserId = searchParams.get('userId')
    const preselectedUsername = searchParams.get('username')

    const [members, setMembers] = useState([])
    const [selectedUser, setSelectedUser] = useState(preselectedUserId || null)
    const [selectedUsername, setSelectedUsername] = useState(preselectedUsername || '')
    const [allRaces, setAllRaces] = useState([])
    const [currentPermissions, setCurrentPermissions] = useState([])
    const [editedPermissions, setEditedPermissions] = useState({}) // { raceId: { checked, accessLevel } }
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState('')

    // 加载成员列表
    useEffect(() => {
        adminApi.getOrgUsers({ limit: 200 })
            .then(res => { if (res.success) setMembers(res.data.items) })
            .catch(() => { })
            .finally(() => setLoading(false))
    }, [])

    // 当选中用户变化时加载其权限
    useEffect(() => {
        if (!selectedUser) return
        setLoading(true)
        adminApi.getUserRacePermissions(selectedUser)
            .then(res => {
                if (res.success) {
                    setAllRaces(res.data.allRaces || [])
                    setCurrentPermissions(res.data.permissions || [])
                    // 初始化编辑状态
                    const edited = {}
                    for (const race of res.data.allRaces || []) {
                        const perm = (res.data.permissions || []).find(p => p.race_id === race.id)
                        edited[race.id] = {
                            checked: !!perm,
                            accessLevel: perm?.access_level || 'editor',
                        }
                    }
                    setEditedPermissions(edited)
                }
            })
            .catch(() => { })
            .finally(() => setLoading(false))
    }, [selectedUser])

    const handleUserSelect = (member) => {
        setSelectedUser(member.id)
        setSelectedUsername(member.username)
        setMessage('')
    }

    const handleToggleRace = (raceId) => {
        setEditedPermissions(prev => ({
            ...prev,
            [raceId]: { ...prev[raceId], checked: !prev[raceId]?.checked }
        }))
    }

    const handleAccessChange = (raceId, level) => {
        setEditedPermissions(prev => ({
            ...prev,
            [raceId]: { ...prev[raceId], accessLevel: level }
        }))
    }

    const handleSave = async () => {
        setSaving(true); setMessage('')
        const permissions = Object.entries(editedPermissions)
            .filter(([, v]) => v.checked)
            .map(([raceId, v]) => ({ raceId: Number(raceId), accessLevel: v.accessLevel }))
        try {
            const res = await adminApi.setUserRacePermissions(selectedUser, { permissions })
            if (res.success) setMessage(res.data.message || '保存成功')
        } catch (err) { setMessage('❌ ' + err.message) }
        finally { setSaving(false) }
    }

    const handleSelectAll = () => {
        const allChecked = allRaces.every(r => editedPermissions[r.id]?.checked)
        const edited = {}
        for (const race of allRaces) {
            edited[race.id] = { checked: !allChecked, accessLevel: editedPermissions[race.id]?.accessLevel || 'editor' }
        }
        setEditedPermissions(edited)
    }

    return (
        <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>🔑 赛事授权</h1>

            {message && (
                <div style={{ padding: '12px 16px', borderRadius: 8, background: message.startsWith('❌') ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', color: message.startsWith('❌') ? '#ef4444' : '#16a34a', fontSize: 14, marginBottom: 16 }}>
                    {message}
                </div>
            )}

            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
                {/* 左侧：成员列表 */}
                <div style={{ width: 260, flexShrink: 0, background: 'white', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', background: '#fafafa', borderBottom: '1px solid #e5e7eb', fontWeight: 600, fontSize: 14 }}>
                        选择成员
                    </div>
                    <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                        {members.map(m => (
                            <div
                                key={m.id}
                                onClick={() => handleUserSelect(m)}
                                style={{
                                    padding: '10px 16px', cursor: 'pointer',
                                    background: selectedUser === m.id ? 'var(--color-accent, #6366f1)' : 'white',
                                    color: selectedUser === m.id ? 'white' : 'inherit',
                                    borderBottom: '1px solid #f0f0f0', transition: 'background 100ms',
                                }}
                            >
                                <div style={{ fontWeight: 600, fontSize: 14 }}>{m.username}</div>
                                <div style={{ fontSize: 12, opacity: 0.7 }}>{m.role === 'race_editor' ? '编辑' : '只读'}</div>
                            </div>
                        ))}
                        {members.length === 0 && (
                            <div style={{ padding: 16, textAlign: 'center', color: '#999', fontSize: 13 }}>暂无成员</div>
                        )}
                    </div>
                </div>

                {/* 右侧：赛事权限 */}
                <div style={{ flex: 1, background: 'white', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    {!selectedUser ? (
                        <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
                            ← 请先选择一个成员
                        </div>
                    ) : loading ? (
                        <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>加载中...</div>
                    ) : (
                        <>
                            <div style={{ padding: '12px 16px', background: '#fafafa', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <span style={{ fontWeight: 600 }}>{selectedUsername}</span>
                                    <span style={{ fontSize: 13, color: '#999', marginLeft: 8 }}>的赛事权限</span>
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button className="btn btn--ghost btn--sm" onClick={handleSelectAll}>
                                        {allRaces.every(r => editedPermissions[r.id]?.checked) ? '取消全选' : '全选'}
                                    </button>
                                    <button className="btn btn--primary btn--sm" onClick={handleSave} disabled={saving}>
                                        {saving ? '保存中...' : '💾 保存'}
                                    </button>
                                </div>
                            </div>

                            {allRaces.length === 0 ? (
                                <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>本机构暂无赛事</div>
                            ) : (
                                <div style={{ padding: 8 }}>
                                    {allRaces.map(race => {
                                        const perm = editedPermissions[race.id] || { checked: false, accessLevel: 'editor' }
                                        return (
                                            <div key={race.id} style={{
                                                display: 'flex', alignItems: 'center', gap: 12,
                                                padding: '10px 12px', borderRadius: 8,
                                                background: perm.checked ? 'rgba(99,102,241,0.04)' : 'transparent',
                                                transition: 'background 100ms',
                                            }}>
                                                <input
                                                    type="checkbox"
                                                    checked={perm.checked}
                                                    onChange={() => handleToggleRace(race.id)}
                                                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                                                />
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: 600, fontSize: 14 }}>{race.name}</div>
                                                    <div style={{ fontSize: 12, color: '#999' }}>
                                                        {race.date ? new Date(race.date).toLocaleDateString() : ''}{race.location ? ` · ${race.location}` : ''}
                                                    </div>
                                                </div>
                                                {perm.checked && (
                                                    <select
                                                        value={perm.accessLevel}
                                                        onChange={e => handleAccessChange(race.id, e.target.value)}
                                                        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
                                                    >
                                                        <option value="editor">✏️ 编辑</option>
                                                        <option value="viewer">👁️ 只读</option>
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
