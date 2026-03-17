import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import credentialApi from '../../../api/credential'

const COLOR_OPTIONS = [
    '#EF4444', '#F97316', '#F59E0B', '#84CC16', '#10B981',
    '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#D946EF',
    '#F43F5E', '#14B8A6', '#84CC16', '#EAB308', '#EC4899',
]

const EMPTY_ZONE = {
    zoneCode: '',
    zoneName: '',
    zoneColor: '#3B82F6',
    sortOrder: 0,
    description: '',
    geometry: null,
}

function CredentialZonePage() {
    const [searchParams] = useSearchParams()
    const raceId = searchParams.get('raceId')

    const [zones, setZones] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState('')

    const [editingZone, setEditingZone] = useState(null)
    const [form, setForm] = useState(EMPTY_ZONE)

    const loadZones = async () => {
        if (!raceId) return
        setLoading(true)
        try {
            const res = await credentialApi.getZones(raceId)
            if (res.success) {
                setZones(res.data || [])
            }
        } catch (err) {
            setMessage(`加载分区失败：${err.message}`)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void loadZones()
    }, [raceId])

    const resetForm = () => {
        setEditingZone(null)
        setForm(EMPTY_ZONE)
    }

    const handleEdit = (zone) => {
        setEditingZone(zone)
        setForm({
            zoneCode: zone.zoneCode,
            zoneName: zone.zoneName,
            zoneColor: zone.zoneColor,
            sortOrder: zone.sortOrder,
            description: zone.description || '',
            geometry: zone.geometry,
        })
    }

    const handleDelete = async (zone) => {
        if (!window.confirm(`确认删除分区 "${zone.zoneName}" 吗？`)) return
        try {
            await credentialApi.deleteZone(raceId, zone.id)
            await loadZones()
            if (editingZone?.id === zone.id) {
                resetForm()
            }
        } catch (err) {
            setMessage(`删除失败：${err.message}`)
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!form.zoneCode.trim() || !form.zoneName.trim()) {
            setMessage('分区编码和名称为必填项')
            return
        }

        setSaving(true)
        setMessage('')

        try {
            const submitData = {
                ...form,
                geometry: form.geometry || { type: 'Polygon', coordinates: [] },
            }

            if (editingZone) {
                await credentialApi.updateZone(raceId, editingZone.id, submitData)
                setMessage('更新成功')
            } else {
                await credentialApi.createZone(raceId, submitData)
                setMessage('创建成功')
            }

            resetForm()
            await loadZones()
        } catch (err) {
            setMessage(`保存失败：${err.message}`)
        } finally {
            setSaving(false)
        }
    }

    if (!raceId) {
        return (
            <div style={styles.container}>
                <div style={styles.empty}>
                    <p style={{ marginBottom: 16 }}>请先选择赛事</p>
                    <Link to={`/admin/credential/select-race?orgId=${searchParams.get('orgId') || ''}`} className="btn btn--primary">
                        去选择赛事
                    </Link>
                </div>
            </div>
        )
    }

    return (
        <div style={styles.container}>
            <h1 style={styles.title}>证件分区管理</h1>

            {message && (
                <div style={{
                    ...styles.message,
                    backgroundColor: message.includes('失败') ? '#FEF2F2' : '#F0FDF4',
                    color: message.includes('失败') ? '#DC2626' : '#166534',
                }}>
                    {message}
                </div>
            )}

            <div style={styles.content}>
                {/* 左侧表单 */}
                <div style={styles.formPanel}>
                    <h2 style={styles.formTitle}>
                        {editingZone ? '编辑分区' : '新建分区'}
                    </h2>
                    <form onSubmit={handleSubmit} style={styles.form}>
                        <div style={styles.field}>
                            <label style={styles.label}>分区编码 *</label>
                            <input
                                type="text"
                                className="input"
                                value={form.zoneCode}
                                onChange={(e) => setForm({ ...form, zoneCode: e.target.value })}
                                placeholder="如：A, B, C"
                                style={styles.input}
                                disabled={!!editingZone}
                            />
                            <span style={styles.hint}>同一赛事内唯一，创建后不可修改</span>
                        </div>

                        <div style={styles.field}>
                            <label style={styles.label}>分区名称 *</label>
                            <input
                                type="text"
                                className="input"
                                value={form.zoneName}
                                onChange={(e) => setForm({ ...form, zoneName: e.target.value })}
                                placeholder="如：竞赛区、休息区"
                                style={styles.input}
                            />
                        </div>

                        <div style={styles.field}>
                            <label style={styles.label}>颜色</label>
                            <div style={styles.colorGrid}>
                                {COLOR_OPTIONS.map((color) => (
                                    <button
                                        key={color}
                                        type="button"
                                        style={{
                                            ...styles.colorSwatch,
                                            backgroundColor: color,
                                            border: form.zoneColor === color ? '3px solid #1F2937' : '2px solid #E5E7EB',
                                        }}
                                        onClick={() => setForm({ ...form, zoneColor: color })}
                                    />
                                ))}
                            </div>
                            <input
                                type="color"
                                value={form.zoneColor}
                                onChange={(e) => setForm({ ...form, zoneColor: e.target.value })}
                                style={styles.colorPicker}
                            />
                        </div>

                        <div style={styles.field}>
                            <label style={styles.label}>排序</label>
                            <input
                                type="number"
                                className="input"
                                value={form.sortOrder}
                                onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                                style={styles.input}
                            />
                            <span style={styles.hint}>数字越小越靠前</span>
                        </div>

                        <div style={styles.field}>
                            <label style={styles.label}>说明</label>
                            <textarea
                                className="input"
                                value={form.description}
                                onChange={(e) => setForm({ ...form, description: e.target.value })}
                                placeholder="分区用途说明"
                                style={{ ...styles.input, minHeight: 80 }}
                            />
                        </div>

                        <div style={styles.formActions}>
                            <button
                                type="button"
                                className="btn btn--ghost"
                                onClick={resetForm}
                                disabled={saving}
                            >
                                取消
                            </button>
                            <button
                                type="submit"
                                className="btn btn--primary"
                                disabled={saving}
                            >
                                {saving ? '保存中...' : (editingZone ? '更新' : '创建')}
                            </button>
                        </div>
                    </form>
                </div>

                {/* 右侧列表 */}
                <div style={styles.listPanel}>
                    <h2 style={styles.listTitle}>分区列表 ({zones.length})</h2>

                    {loading ? (
                        <div style={styles.loading}>加载中...</div>
                    ) : zones.length === 0 ? (
                        <div style={styles.empty}>暂无分区</div>
                    ) : (
                        <div style={styles.list}>
                            {zones.map((zone) => (
                                <div
                                    key={zone.id}
                                    style={{
                                        ...styles.listItem,
                                        borderLeft: `4px solid ${zone.zoneColor}`,
                                    }}
                                >
                                    <div style={styles.listItemHeader}>
                                        <span style={styles.listItemCode}>{zone.zoneCode}</span>
                                        <span style={styles.listItemName}>{zone.zoneName}</span>
                                    </div>
                                    {zone.description && (
                                        <div style={styles.listItemDesc}>{zone.description}</div>
                                    )}
                                    <div style={styles.listItemMeta}>
                                        <span style={{ ...styles.colorDot, backgroundColor: zone.zoneColor }} />
                                        <span>排序：{zone.sortOrder}</span>
                                        {zone.isActive === false && (
                                            <span style={styles.inactiveTag}>已禁用</span>
                                        )}
                                    </div>
                                    <div style={styles.listItemActions}>
                                        <button
                                            className="btn btn--ghost btn--sm"
                                            onClick={() => handleEdit(zone)}
                                        >
                                            编辑
                                        </button>
                                        <button
                                            className="btn btn--ghost btn--sm"
                                            onClick={() => handleDelete(zone)}
                                            style={{ color: '#DC2626' }}
                                        >
                                            删除
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

const styles = {
    container: {
        padding: 24,
        maxWidth: 1400,
        margin: '0 auto',
    },
    title: {
        fontSize: 24,
        fontWeight: 700,
        marginBottom: 24,
    },
    message: {
        padding: '12px 16px',
        borderRadius: 8,
        marginBottom: 16,
        fontSize: 14,
    },
    content: {
        display: 'grid',
        gridTemplateColumns: '400px 1fr',
        gap: 24,
    },
    formPanel: {
        background: '#FFFFFF',
        borderRadius: 12,
        padding: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    },
    formTitle: {
        fontSize: 18,
        fontWeight: 600,
        marginBottom: 20,
    },
    form: {
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
    },
    field: {
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
    },
    label: {
        fontSize: 14,
        fontWeight: 500,
        color: '#374151',
    },
    input: {
        padding: '10px 12px',
        border: '1px solid #D1D5DB',
        borderRadius: 6,
        fontSize: 14,
    },
    hint: {
        fontSize: 12,
        color: '#6B7280',
    },
    colorGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        gap: 8,
    },
    colorSwatch: {
        width: 32,
        height: 32,
        borderRadius: 6,
        cursor: 'pointer',
        transition: 'all 0.15s',
    },
    colorPicker: {
        width: '100%',
        height: 40,
        border: '1px solid #D1D5DB',
        borderRadius: 6,
        cursor: 'pointer',
    },
    formActions: {
        display: 'flex',
        gap: 12,
        justifyContent: 'flex-end',
        marginTop: 8,
    },
    listPanel: {
        background: '#FFFFFF',
        borderRadius: 12,
        padding: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    },
    listTitle: {
        fontSize: 18,
        fontWeight: 600,
        marginBottom: 20,
    },
    loading: {
        textAlign: 'center',
        padding: 40,
        color: '#6B7280',
    },
    empty: {
        textAlign: 'center',
        padding: 40,
        color: '#6B7280',
    },
    list: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
    },
    listItem: {
        padding: 16,
        background: '#F9FAFB',
        borderRadius: 8,
    },
    listItemHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 8,
    },
    listItemCode: {
        fontSize: 16,
        fontWeight: 700,
        color: '#1F2937',
    },
    listItemName: {
        fontSize: 14,
        color: '#6B7280',
    },
    listItemDesc: {
        fontSize: 13,
        color: '#6B7280',
        marginBottom: 8,
    },
    listItemMeta: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontSize: 13,
        color: '#6B7280',
    },
    colorDot: {
        width: 12,
        height: 12,
        borderRadius: '50%',
    },
    inactiveTag: {
        padding: '2px 8px',
        background: '#FEE2E2',
        color: '#DC2626',
        borderRadius: 4,
        fontSize: 12,
    },
    listItemActions: {
        display: 'flex',
        gap: 8,
        marginTop: 12,
    },
}

export default CredentialZonePage
