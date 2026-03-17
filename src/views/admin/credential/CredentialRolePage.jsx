import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import credentialApi from '../../../api/credential'

const COLOR_OPTIONS = [
    '#6B7280', '#EF4444', '#F97316', '#F59E0B', '#84CC16',
    '#10B981', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6',
    '#D946EF', '#F43F5E', '#14B8A6', '#EAB308', '#EC4899',
]

const EMPTY_TEMPLATE = {
    roleName: '',
    roleCode: '',
    defaultColor: '#6B7280',
    requiresReview: true,
    description: '',
    zoneCodes: [],
}

function CredentialRolePage() {
    const [searchParams] = useSearchParams()
    const raceId = searchParams.get('raceId')

    const [zones, setZones] = useState([])
    const [templates, setTemplates] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState('')

    const [editingTemplate, setEditingTemplate] = useState(null)
    const [form, setForm] = useState(EMPTY_TEMPLATE)

    const loadZones = async () => {
        if (!raceId) return
        try {
            const res = await credentialApi.getZones(raceId)
            if (res.success) {
                setZones(res.data || [])
            }
        } catch (err) {
            console.error('加载分区失败:', err)
        }
    }

    const loadTemplates = async () => {
        if (!raceId) return
        setLoading(true)
        try {
            const res = await credentialApi.getRoleTemplates(raceId)
            if (res.success) {
                setTemplates(res.data || [])
            }
        } catch (err) {
            setMessage(`加载岗位模板失败：${err.message}`)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void loadZones()
        void loadTemplates()
    }, [raceId])

    const resetForm = () => {
        setEditingTemplate(null)
        setForm(EMPTY_TEMPLATE)
    }

    const handleEdit = (template) => {
        setEditingTemplate(template)
        setForm({
            roleName: template.roleName,
            roleCode: template.roleCode,
            defaultColor: template.defaultColor,
            requiresReview: template.requiresReview,
            description: template.description || '',
            zoneCodes: template.zoneCodes || [],
        })
    }

    const handleDelete = async (template) => {
        if (!window.confirm(`确认删除岗位模板 "${template.roleName}" 吗？`)) return
        try {
            await credentialApi.deleteRoleTemplate(raceId, template.id)
            await loadTemplates()
            if (editingTemplate?.id === template.id) {
                resetForm()
            }
        } catch (err) {
            setMessage(`删除失败：${err.message}`)
        }
    }

    const handleToggleZone = (zoneCode) => {
        setForm((prev) => {
            const exists = prev.zoneCodes.includes(zoneCode)
            return {
                ...prev,
                zoneCodes: exists
                    ? prev.zoneCodes.filter((c) => c !== zoneCode)
                    : [...prev.zoneCodes, zoneCode],
            }
        })
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!form.roleName.trim() || !form.roleCode.trim()) {
            setMessage('岗位名称和编码为必填项')
            return
        }

        setSaving(true)
        setMessage('')

        try {
            const submitData = {
                ...form,
                zoneCodes: form.zoneCodes,
            }

            if (editingTemplate) {
                await credentialApi.updateRoleTemplate(raceId, editingTemplate.id, submitData)
                setMessage('更新成功')
            } else {
                await credentialApi.createRoleTemplate(raceId, submitData)
                setMessage('创建成功')
            }

            resetForm()
            await loadTemplates()
        } catch (err) {
            setMessage(`保存失败：${err.message}`)
        } finally {
            setSaving(false)
        }
    }

    const zoneMap = useMemo(() => {
        const map = new Map()
        zones.forEach((zone) => map.set(zone.zoneCode, zone))
        return map
    }, [zones])

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
            <h1 style={styles.title}>岗位模板管理</h1>

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
                        {editingTemplate ? '编辑岗位模板' : '新建岗位模板'}
                    </h2>
                    <form onSubmit={handleSubmit} style={styles.form}>
                        <div style={styles.field}>
                            <label style={styles.label}>岗位编码 *</label>
                            <input
                                type="text"
                                className="input"
                                value={form.roleCode}
                                onChange={(e) => setForm({ ...form, roleCode: e.target.value })}
                                placeholder="如：JUDGE, VOLUNTEER"
                                style={styles.input}
                                disabled={!!editingTemplate}
                            />
                            <span style={styles.hint}>同一赛事内唯一，创建后不可修改</span>
                        </div>

                        <div style={styles.field}>
                            <label style={styles.label}>岗位名称 *</label>
                            <input
                                type="text"
                                className="input"
                                value={form.roleName}
                                onChange={(e) => setForm({ ...form, roleName: e.target.value })}
                                placeholder="如：裁判员、志愿者"
                                style={styles.input}
                            />
                        </div>

                        <div style={styles.field}>
                            <label style={styles.label}>默认颜色</label>
                            <div style={styles.colorGrid}>
                                {COLOR_OPTIONS.map((color) => (
                                    <button
                                        key={color}
                                        type="button"
                                        style={{
                                            ...styles.colorSwatch,
                                            backgroundColor: color,
                                            border: form.defaultColor === color ? '3px solid #1F2937' : '2px solid #E5E7EB',
                                        }}
                                        onClick={() => setForm({ ...form, defaultColor: color })}
                                    />
                                ))}
                            </div>
                            <input
                                type="color"
                                value={form.defaultColor}
                                onChange={(e) => setForm({ ...form, defaultColor: e.target.value })}
                                style={styles.colorPicker}
                            />
                        </div>

                        <div style={styles.field}>
                            <label style={styles.label}>
                                <input
                                    type="checkbox"
                                    checked={form.requiresReview}
                                    onChange={(e) => setForm({ ...form, requiresReview: e.target.checked })}
                                    style={{ marginRight: 8 }}
                                />
                                需要审核
                            </label>
                            <span style={styles.hint}>开启后申请需管理员审核通过才能生成证件</span>
                        </div>

                        <div style={styles.field}>
                            <label style={styles.label}>说明</label>
                            <textarea
                                className="input"
                                value={form.description}
                                onChange={(e) => setForm({ ...form, description: e.target.value })}
                                placeholder="岗位职责说明"
                                style={{ ...styles.input, minHeight: 60 }}
                            />
                        </div>

                        <div style={styles.field}>
                            <label style={styles.label}>默认可通行区域</label>
                            {zones.length === 0 ? (
                                <span style={styles.hint}>请先创建分区</span>
                            ) : (
                                <div style={styles.zoneList}>
                                    {zones.map((zone) => (
                                        <label
                                            key={zone.zoneCode}
                                            style={styles.zoneCheckbox}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={form.zoneCodes.includes(zone.zoneCode)}
                                                onChange={() => handleToggleZone(zone.zoneCode)}
                                            />
                                            <span
                                                style={{
                                                    ...styles.zoneDot,
                                                    backgroundColor: zone.zoneColor,
                                                }}
                                            />
                                            <span>{zone.zoneName} ({zone.zoneCode})</span>
                                        </label>
                                    ))}
                                </div>
                            )}
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
                                {saving ? '保存中...' : (editingTemplate ? '更新' : '创建')}
                            </button>
                        </div>
                    </form>
                </div>

                {/* 右侧列表 */}
                <div style={styles.listPanel}>
                    <h2 style={styles.listTitle}>岗位模板列表 ({templates.length})</h2>

                    {loading ? (
                        <div style={styles.loading}>加载中...</div>
                    ) : templates.length === 0 ? (
                        <div style={styles.empty}>暂无岗位模板</div>
                    ) : (
                        <div style={styles.list}>
                            {templates.map((template) => (
                                <div
                                    key={template.id}
                                    style={{
                                        ...styles.listItem,
                                        borderLeft: `4px solid ${template.defaultColor}`,
                                    }}
                                >
                                    <div style={styles.listItemHeader}>
                                        <span style={styles.listItemCode}>{template.roleCode}</span>
                                        <span style={styles.listItemName}>{template.roleName}</span>
                                        {template.requiresReview && (
                                            <span style={styles.reviewTag}>需审核</span>
                                        )}
                                    </div>
                                    {template.description && (
                                        <div style={styles.listItemDesc}>{template.description}</div>
                                    )}
                                    <div style={styles.listItemMeta}>
                                        <span
                                            style={{
                                                ...styles.colorDot,
                                                backgroundColor: template.defaultColor,
                                            }}
                                        />
                                        <span>
                                            可通行区域：{template.zoneCodes?.length || 0} 个
                                        </span>
                                        {template.zoneCodes?.length > 0 && (
                                            <span style={styles.zoneTags}>
                                                {template.zoneCodes.map((code) => {
                                                    const zone = zoneMap.get(code)
                                                    return (
                                                        <span
                                                            key={code}
                                                            style={{
                                                                ...styles.zoneTag,
                                                                backgroundColor: zone?.zoneColor || '#E5E7EB',
                                                            }}
                                                        >
                                                            {code}
                                                        </span>
                                                    )
                                                })}
                                            </span>
                                        )}
                                    </div>
                                    <div style={styles.listItemActions}>
                                        <button
                                            className="btn btn--ghost btn--sm"
                                            onClick={() => handleEdit(template)}
                                        >
                                            编辑
                                        </button>
                                        <button
                                            className="btn btn--ghost btn--sm"
                                            onClick={() => handleDelete(template)}
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
        gridTemplateColumns: '450px 1fr',
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
        flexWrap: 'wrap',
    },
    colorDot: {
        width: 12,
        height: 12,
        borderRadius: '50%',
    },
    reviewTag: {
        padding: '2px 8px',
        background: '#DBEAFE',
        color: '#1E40AF',
        borderRadius: 4,
        fontSize: 12,
    },
    zoneTags: {
        display: 'flex',
        gap: 4,
        flexWrap: 'wrap',
    },
    zoneTag: {
        padding: '2px 6px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 500,
        color: '#1F2937',
    },
    listItemActions: {
        display: 'flex',
        gap: 8,
        marginTop: 12,
    },
    zoneList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 8,
        border: '1px solid #E5E7EB',
        borderRadius: 6,
        maxHeight: 200,
        overflowY: 'auto',
    },
    zoneCheckbox: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        cursor: 'pointer',
        fontSize: 14,
    },
    zoneDot: {
        width: 12,
        height: 12,
        borderRadius: '50%',
        flexShrink: 0,
    },
}

export default CredentialRolePage
