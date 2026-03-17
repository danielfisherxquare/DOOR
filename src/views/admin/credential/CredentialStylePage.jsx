import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import credentialApi from '../../../api/credential'

const STATUS_OPTIONS = [
    { value: '', label: '全部状态' },
    { value: 'draft', label: '草稿' },
    { value: 'active', label: '启用' },
    { value: 'archived', label: '归档' },
]

const EMPTY_TEMPLATE = {
    templateName: '',
    templateCode: '',
    frontLayoutJson: null,
    backLayoutJson: null,
    pageWidth: 283.46,
    pageHeight: 396.85,
    version: 1,
    status: 'draft',
    description: '',
}

function CredentialStylePage() {
    const [searchParams] = useSearchParams()
    const raceId = searchParams.get('raceId')

    const [templates, setTemplates] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState('')
    const [statusFilter, setStatusFilter] = useState('')

    const [editingTemplate, setEditingTemplate] = useState(null)
    const [form, setForm] = useState(EMPTY_TEMPLATE)
    const [previewLayout, setPreviewLayout] = useState(null)

    const loadTemplates = async () => {
        if (!raceId) return
        setLoading(true)
        try {
            const res = await credentialApi.getStyleTemplates(raceId, statusFilter ? { status: statusFilter } : {})
            if (res.success) {
                setTemplates(res.data || [])
            }
        } catch (err) {
            setMessage(`加载样式模板失败：${err.message}`)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void loadTemplates()
    }, [raceId, statusFilter])

    const resetForm = () => {
        setEditingTemplate(null)
        setForm(EMPTY_TEMPLATE)
    }

    const handleEdit = (template) => {
        setEditingTemplate(template)
        setForm({
            templateName: template.templateName,
            templateCode: template.templateCode,
            frontLayoutJson: template.frontLayoutJson,
            backLayoutJson: template.backLayoutJson,
            pageWidth: template.pageWidth,
            pageHeight: template.pageHeight,
            version: template.version,
            status: template.status,
            description: template.description || '',
        })
    }

    const handleDelete = async (template) => {
        if (!window.confirm(`确认删除样式模板 "${template.templateName}" 吗？`)) return
        try {
            await credentialApi.deleteStyleTemplate(raceId, template.id)
            await loadTemplates()
            if (editingTemplate?.id === template.id) {
                resetForm()
            }
        } catch (err) {
            setMessage(`删除失败：${err.message}`)
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!form.templateName.trim() || !form.templateCode.trim()) {
            setMessage('模板名称和编码为必填项')
            return
        }

        setSaving(true)
        setMessage('')

        try {
            const submitData = {
                ...form,
                frontLayoutJson: form.frontLayoutJson || { version: 1, fields: [] },
                backLayoutJson: form.backLayoutJson,
            }

            if (editingTemplate) {
                await credentialApi.updateStyleTemplate(raceId, editingTemplate.id, submitData)
                setMessage('更新成功')
            } else {
                await credentialApi.createStyleTemplate(raceId, submitData)
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

    const handlePreviewLayout = (layoutJson, side) => {
        if (!layoutJson) {
            setMessage('暂无布局数据', 'info');
            return;
        }
        setPreviewLayout({ layout: layoutJson, side });
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
            <h1 style={styles.title}>证件样式模板管理</h1>

            {message && (
                <div style={{
                    ...styles.message,
                    backgroundColor: message.includes('失败') ? '#FEF2F2' : '#F0FDF4',
                    color: message.includes('失败') ? '#DC2626' : '#166534',
                }}>
                    {message}
                </div>
            )}

            {/* 筛选栏 */}
            <div style={styles.filterBar}>
                <div style={styles.filterGroup}>
                    <label style={styles.filterLabel}>状态：</label>
                    <select
                        className="input"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        style={styles.select}
                    >
                        {STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* 模板列表 */}
            <div style={styles.grid}>
                {loading ? (
                    <div style={styles.loading}>加载中...</div>
                ) : templates.length === 0 ? (
                    <div style={styles.empty}>暂无样式模板</div>
                ) : (
                    templates.map((template) => (
                        <div key={template.id} style={styles.card}>
                            <div style={styles.cardHeader}>
                                <div style={styles.cardTitle}>
                                    <h3 style={styles.cardName}>{template.templateName}</h3>
                                    <span style={styles.cardCode}>{template.templateCode}</span>
                                </div>
                                <span style={{
                                    ...styles.statusBadge,
                                    backgroundColor: getStatusColor(template.status),
                                }}>
                                    {getStatusLabel(template.status)}
                                </span>
                            </div>

                            <div style={styles.cardBody}>
                                <div style={styles.infoRow}>
                                    <span style={styles.infoLabel}>尺寸:</span>
                                    <span style={styles.infoValue}>
                                        {template.pageWidth} × {template.pageHeight} pt
                                    </span>
                                </div>
                                <div style={styles.infoRow}>
                                    <span style={styles.infoLabel}>版本:</span>
                                    <span style={styles.infoValue}>{template.version}</span>
                                </div>
                                {template.description && (
                                    <div style={styles.description}>{template.description}</div>
                                )}

                                <div style={styles.layoutPreview}>
                                    <button
                                        className="btn btn--ghost btn--sm"
                                        onClick={() => handlePreviewLayout(template.frontLayoutJson, '正面')}
                                        disabled={!template.frontLayoutJson}
                                    >
                                        正面布局
                                    </button>
                                    <button
                                        className="btn btn--ghost btn--sm"
                                        onClick={() => handlePreviewLayout(template.backLayoutJson, '背面')}
                                        disabled={!template.backLayoutJson}
                                    >
                                        背面布局
                                    </button>
                                </div>
                            </div>

                            <div style={styles.cardFooter}>
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
                    ))
                )}
            </div>

            {/* 编辑对话框 */}
            {editingTemplate && (
                <div style={styles.modal}>
                    <div style={styles.modalContent}>
                        <h2 style={styles.modalTitle}>
                            {editingTemplate ? '编辑样式模板' : '新建样式模板'}
                        </h2>
                        <form onSubmit={handleSubmit} style={styles.form}>
                            <div style={styles.formGrid}>
                                <div style={styles.field}>
                                    <label style={styles.label}>模板名称 *</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={form.templateName}
                                        onChange={(e) => setForm({ ...form, templateName: e.target.value })}
                                        placeholder="如：裁判证 -2026"
                                        style={styles.input}
                                        disabled={!!editingTemplate}
                                    />
                                </div>

                                <div style={styles.field}>
                                    <label style={styles.label}>模板编码 *</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={form.templateCode}
                                        onChange={(e) => setForm({ ...form, templateCode: e.target.value })}
                                        placeholder="如：JUDGE-2026"
                                        style={styles.input}
                                        disabled={!!editingTemplate}
                                    />
                                </div>
                            </div>

                            <div style={styles.formGrid}>
                                <div style={styles.field}>
                                    <label style={styles.label}>页面宽度 (pt)</label>
                                    <input
                                        type="number"
                                        className="input"
                                        value={form.pageWidth}
                                        onChange={(e) => setForm({ ...form, pageWidth: Number(e.target.value) })}
                                        style={styles.input}
                                    />
                                </div>

                                <div style={styles.field}>
                                    <label style={styles.label}>页面高度 (pt)</label>
                                    <input
                                        type="number"
                                        className="input"
                                        value={form.pageHeight}
                                        onChange={(e) => setForm({ ...form, pageHeight: Number(e.target.value) })}
                                        style={styles.input}
                                    />
                                </div>
                            </div>

                            <div style={styles.field}>
                                <label style={styles.label}>状态</label>
                                <select
                                    className="input"
                                    value={form.status}
                                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                                    style={styles.input}
                                >
                                    <option value="draft">草稿</option>
                                    <option value="active">启用</option>
                                    <option value="archived">归档</option>
                                </select>
                            </div>

                            <div style={styles.field}>
                                <label style={styles.label}>说明</label>
                                <textarea
                                    className="input"
                                    value={form.description}
                                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                                    placeholder="模板说明"
                                    style={{ ...styles.input, minHeight: 60 }}
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
                                    {saving ? '保存中...' : (editingTemplate ? '更新' : '创建')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 布局预览对话框 */}
            {previewLayout && (
                <div style={styles.modal}>
                    <div style={{ ...styles.modalContent, maxWidth: 900 }}>
                        <h2 style={styles.modalTitle}>
                            {previewLayout.side === 'front' ? '正面布局' : '背面布局'} 预览
                        </h2>
                        <div style={styles.previewContainer}>
                            <canvas
                                ref={(canvas) => {
                                    if (canvas && previewLayout.layout) {
                                        renderLayoutPreview(canvas, previewLayout.layout);
                                    }
                                }}
                                style={styles.previewCanvas}
                            />
                        </div>
                        <div style={styles.modalActions}>
                            <button
                                className="btn btn--ghost"
                                onClick={() => setPreviewLayout(null)}
                            >
                                关闭
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

/**
 * 渲染布局预览到 Canvas
 */
function renderLayoutPreview(canvas, layout) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const scale = 1.5; // 放大显示
    const width = layout.pageWidth * scale;
    const height = layout.pageHeight * scale;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 清空画布
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    // 绘制边框
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);

    // 绘制字段
    if (layout.fields && Array.isArray(layout.fields)) {
        for (const field of layout.fields) {
            if (!field.visible) continue;

            const bx = field.box.xRatio * width;
            const by = field.box.yRatio * height;
            const bw = field.box.widthRatio * width;
            const bh = field.box.heightRatio * height;

            // 绘制字段边框
            ctx.strokeStyle = field.color || '#3B82F6';
            ctx.lineWidth = 2;
            ctx.strokeRect(bx, by, bw, bh);

            // 绘制字段标签
            ctx.fillStyle = '#6B7280';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(field.label || field.key, bx + 4, by + 4);

            // 绘制类型标识
            ctx.fillStyle = field.color || '#3B82F6';
            ctx.beginPath();
            ctx.arc(bx + bw - 12, by + 12, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const typeIcon = getTypeIcon(field.type);
            ctx.fillText(typeIcon, bx + bw - 12, by + 12);
        }
    }
}

function getTypeIcon(type) {
    const icons = {
        text: 'T',
        rect: 'R',
        image: 'I',
        qr: 'Q',
        accessLegend: 'A',
        mapImage: 'M',
        hotline: 'H',
        serialNo: 'S',
    };
    return icons[type] || '?';
}

function getStatusColor(status) {
    switch (status) {
        case 'active': return '#DCFCE7'
        case 'draft': return '#F3F4F6'
        case 'archived': return '#FEF3C7'
        default: return '#F3F4F6'
    }
}

function getStatusLabel(status) {
    switch (status) {
        case 'active': return '启用'
        case 'draft': return '草稿'
        case 'archived': return '归档'
        default: return status
    }
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
    filterBar: {
        display: 'flex',
        gap: 24,
        marginBottom: 24,
        padding: '16px 20px',
        background: '#FFFFFF',
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    },
    filterGroup: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
    },
    filterLabel: {
        fontSize: 14,
        fontWeight: 500,
        color: '#374151',
    },
    select: {
        padding: '8px 12px',
        border: '1px solid #D1D5DB',
        borderRadius: 6,
        fontSize: 14,
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: 20,
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
    card: {
        background: '#FFFFFF',
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
    },
    cardHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 20px',
        borderBottom: '1px solid #F3F4F6',
    },
    cardTitle: {
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
    },
    cardName: {
        fontSize: 16,
        fontWeight: 600,
        color: '#1F2937',
        margin: 0,
    },
    cardCode: {
        fontSize: 12,
        color: '#6B7280',
    },
    statusBadge: {
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 500,
    },
    cardBody: {
        padding: '16px 20px',
        flex: 1,
    },
    infoRow: {
        display: 'flex',
        gap: 12,
        marginBottom: 8,
        fontSize: 14,
    },
    infoLabel: {
        color: '#6B7280',
        fontWeight: 500,
    },
    infoValue: {
        color: '#374151',
    },
    description: {
        fontSize: 13,
        color: '#6B7280',
        marginTop: 12,
        lineHeight: 1.5,
    },
    layoutPreview: {
        display: 'flex',
        gap: 8,
        marginTop: 16,
    },
    cardFooter: {
        display: 'flex',
        gap: 8,
        padding: '12px 20px',
        borderTop: '1px solid #F3F4F6',
    },
    modal: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
    },
    modalContent: {
        background: '#FFFFFF',
        borderRadius: 12,
        padding: 24,
        width: '100%',
        maxWidth: 600,
        maxHeight: '90vh',
        overflowY: 'auto',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 600,
        marginBottom: 20,
    },
    form: {
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
    },
    formGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
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
    formActions: {
        display: 'flex',
        gap: 12,
        justifyContent: 'flex-end',
        marginTop: 8,
    },
    previewContainer: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        background: '#F3F4F6',
        borderRadius: 8,
        marginBottom: 20,
    },
    previewCanvas: {
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        background: '#FFFFFF',
    },
}

export default CredentialStylePage
