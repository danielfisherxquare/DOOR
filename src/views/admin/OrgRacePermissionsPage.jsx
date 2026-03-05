import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import adminApi from '../../api/adminApi'
import useAuthStore from '../../stores/authStore'

function OrgRacePermissionsPage() {
    const { user } = useAuthStore()
    const isSuperAdmin = user?.role === 'super_admin'
    const [searchParams] = useSearchParams()
    const presetOrgId = searchParams.get('orgId') || ''

    const [orgs, setOrgs] = useState([])
    const [selectedOrgId, setSelectedOrgId] = useState(presetOrgId)
    const [allRaces, setAllRaces] = useState([])
    const [editedPermissions, setEditedPermissions] = useState({})
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState('')

    useEffect(() => {
        if (!isSuperAdmin) {
            setLoading(false)
            return
        }

        setLoading(true)
        adminApi.getOrgs({ limit: 500 })
            .then((res) => {
                if (!res.success) return
                const items = res.data.items || []
                setOrgs(items)
                if (!presetOrgId && !selectedOrgId && items[0]?.id) {
                    setSelectedOrgId(items[0].id)
                }
            })
            .catch(() => { })
            .finally(() => setLoading(false))
    }, [isSuperAdmin, presetOrgId])

    useEffect(() => {
        if (!isSuperAdmin || !selectedOrgId) {
            setAllRaces([])
            setEditedPermissions({})
            return
        }

        setLoading(true)
        setMessage('')
        adminApi.getOrgRacePermissions(selectedOrgId)
            .then((res) => {
                if (!res.success) return
                const races = res.data.allRaces || []
                const currentPermissions = res.data.permissions || []
                const permissionMap = new Map(
                    currentPermissions.map((row) => [Number(row.race_id), row.access_level || 'viewer']),
                )

                setAllRaces(races)
                const nextEdited = {}
                for (const race of races) {
                    nextEdited[race.id] = {
                        checked: permissionMap.has(Number(race.id)),
                        accessLevel: permissionMap.get(Number(race.id)) || 'viewer',
                    }
                }
                setEditedPermissions(nextEdited)
            })
            .catch((err) => setMessage(`❌ ${err.message}`))
            .finally(() => setLoading(false))
    }, [isSuperAdmin, selectedOrgId])

    const enabledCount = useMemo(
        () => Object.values(editedPermissions).filter((row) => row.checked).length,
        [editedPermissions],
    )

    const handleToggleRace = (raceId) => {
        setEditedPermissions((prev) => ({
            ...prev,
            [raceId]: {
                checked: !prev[raceId]?.checked,
                accessLevel: prev[raceId]?.accessLevel || 'viewer',
            },
        }))
    }

    const handleAccessLevelChange = (raceId, accessLevel) => {
        setEditedPermissions((prev) => ({
            ...prev,
            [raceId]: {
                checked: prev[raceId]?.checked ?? false,
                accessLevel,
            },
        }))
    }

    const handleSelectAll = () => {
        const allChecked = allRaces.length > 0 && allRaces.every((race) => editedPermissions[race.id]?.checked)
        const nextEdited = {}
        for (const race of allRaces) {
            nextEdited[race.id] = {
                checked: !allChecked,
                accessLevel: editedPermissions[race.id]?.accessLevel || 'viewer',
            }
        }
        setEditedPermissions(nextEdited)
    }

    const handleSave = async () => {
        if (!selectedOrgId) return
        setSaving(true)
        setMessage('')

        const permissions = Object.entries(editedPermissions)
            .filter(([, row]) => row.checked)
            .map(([raceId, row]) => ({ raceId: Number(raceId), accessLevel: row.accessLevel }))

        try {
            const res = await adminApi.setOrgRacePermissions(selectedOrgId, { permissions })
            if (res.success) {
                setMessage(res.data.message || `保存成功，已授权 ${permissions.length} 场赛事`)
            }
        } catch (err) {
            setMessage(`❌ ${err.message}`)
        } finally {
            setSaving(false)
        }
    }

    if (!isSuperAdmin) {
        return <div style={{ padding: 24 }}>仅超级管理员可访问该页面。</div>
    }

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>🏢 机构赛事授权</h1>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn--ghost btn--sm" onClick={handleSelectAll} disabled={!selectedOrgId || loading}>
                        {allRaces.length > 0 && allRaces.every((race) => editedPermissions[race.id]?.checked) ? '取消全选' : '全选'}
                    </button>
                    <button className="btn btn--primary btn--sm" onClick={handleSave} disabled={!selectedOrgId || loading || saving}>
                        {saving ? '保存中...' : '保存授权'}
                    </button>
                </div>
            </div>

            <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, marginBottom: 6, fontWeight: 600 }}>目标机构 *</label>
                <select
                    className="input"
                    value={selectedOrgId}
                    onChange={(e) => setSelectedOrgId(e.target.value)}
                    disabled={loading}
                    style={{ maxWidth: 420 }}
                >
                    <option value="">请选择机构</option>
                    {orgs.map((org) => (
                        <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                </select>
            </div>

            {message && (
                <div style={{
                    padding: '12px 16px',
                    borderRadius: 8,
                    marginBottom: 16,
                    background: message.startsWith('❌') ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                    color: message.startsWith('❌') ? '#ef4444' : '#16a34a',
                    fontSize: 14,
                }}>
                    {message}
                </div>
            )}

            <div style={{ background: 'var(--color-bg-card, #fff)', borderRadius: 12, boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06))', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color, #e5e7eb)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600 }}>赛事列表</span>
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>已选 {enabledCount} 场</span>
                </div>

                {!selectedOrgId ? (
                    <div style={{ padding: 36, textAlign: 'center', color: 'var(--color-text-secondary)' }}>请选择一个机构</div>
                ) : loading ? (
                    <div style={{ padding: 36, textAlign: 'center', color: 'var(--color-text-secondary)' }}>加载中...</div>
                ) : allRaces.length === 0 ? (
                    <div style={{ padding: 36, textAlign: 'center', color: 'var(--color-text-secondary)' }}>暂无可授权赛事</div>
                ) : (
                    <div style={{ padding: 8 }}>
                        {allRaces.map((race) => {
                            const row = editedPermissions[race.id] || { checked: false, accessLevel: 'viewer' }
                            return (
                                <div
                                    key={race.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12,
                                        padding: '10px 12px',
                                        borderRadius: 8,
                                        background: row.checked ? 'rgba(99,102,241,0.06)' : 'transparent',
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={row.checked}
                                        onChange={() => handleToggleRace(race.id)}
                                        style={{ width: 18, height: 18 }}
                                    />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, fontSize: 14 }}>{race.name}</div>
                                        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                                            {(race.org_name || race.org_id) ? `${race.org_name || race.org_id}` : '-'}
                                            {race.date ? ` · ${race.date}` : ''}
                                            {race.location ? ` · ${race.location}` : ''}
                                        </div>
                                    </div>
                                    {row.checked && (
                                        <select
                                            value={row.accessLevel}
                                            onChange={(e) => handleAccessLevelChange(race.id, e.target.value)}
                                            style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-color, #d1d5db)', fontSize: 13 }}
                                        >
                                            <option value="editor">编辑</option>
                                            <option value="viewer">只读</option>
                                        </select>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}

export default OrgRacePermissionsPage
