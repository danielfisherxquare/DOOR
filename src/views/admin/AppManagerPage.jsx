import { useState, useEffect, useRef } from 'react'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import useAuthStore from '../../stores/authStore'

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

function AppManagerPage() {
    const [appInfo, setAppInfo] = useState(null)
    const [loading, setLoading] = useState(true)
    const [uploading, setUploading] = useState(false)
    const [message, setMessage] = useState(null) // { type: 'success' | 'error', text: '' }
    const fileInputRef = useRef(null)

    const fetchAppInfo = () => {
        setLoading(true)
        fetch(`${API_BASE}/admin/tools/app-info`, {
            headers: {
                Authorization: `Bearer ${useAuthStore.getState().token || ''}`,
            },
        })
            .then((r) => r.json())
            .then((res) => {
                if (res.success) setAppInfo(res.data)
            })
            .catch(() => { })
            .finally(() => setLoading(false))
    }

    useEffect(() => {
        fetchAppInfo()
    }, [])

    const formatSize = (bytes) => {
        if (!bytes) return '未知'
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    const handleUpload = async (e) => {
        const file = e.target.files?.[0]
        if (!file) return

        setUploading(true)
        setMessage(null)

        try {
            const formData = new FormData()
            formData.append('file', file)

            const res = await fetch(`${API_BASE}/admin/tools/upload-app`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${useAuthStore.getState().token || ''}`,
                },
                body: formData,
            })

            const data = await res.json()

            if (data.success) {
                setMessage({ type: 'success', text: `✅ ${data.message || '上传成功'}` })
                fetchAppInfo()
            } else {
                setMessage({ type: 'error', text: `❌ ${data.message || '上传失败'}` })
            }
        } catch (err) {
            setMessage({ type: 'error', text: `❌ 上传失败: ${err.message}` })
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const handleDelete = async () => {
        if (!confirm('确定要删除当前安装包吗？')) return

        try {
            const res = await fetch(`${API_BASE}/admin/tools/delete-app`, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${useAuthStore.getState().token || ''}`,
                },
            })
            const data = await res.json()
            if (data.success) {
                setMessage({ type: 'success', text: '✅ 安装包已删除' })
                fetchAppInfo()
            } else {
                setMessage({ type: 'error', text: `❌ ${data.message || '删除失败'}` })
            }
        } catch (err) {
            setMessage({ type: 'error', text: `❌ 删除失败: ${err.message}` })
        }
    }

    const cardStyle = {
        background: 'var(--color-bg-primary, #ffffff)',
        borderRadius: 16,
        padding: 32,
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        marginBottom: 24,
    }

    return (
        <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary, #111)', marginBottom: 24 }}>
                📥 应用管理
            </h1>

            {/* 消息 */}
            {message && (
                <div style={{
                    padding: '12px 16px',
                    borderRadius: 10,
                    marginBottom: 16,
                    fontSize: 14,
                    background: message.type === 'success'
                        ? 'var(--badge-green-bg, #dcfce7)'
                        : 'var(--badge-red-bg, #fee2e2)',
                    color: message.type === 'success'
                        ? 'var(--badge-green-text, #166534)'
                        : 'var(--badge-red-text, #991b1b)',
                }}>
                    {message.text}
                </div>
            )}

            {/* 当前状态 */}
            <div style={cardStyle}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--color-text-primary, #111)' }}>
                    当前安装包状态
                </h3>

                {loading ? (
                    <p style={{ color: 'var(--color-text-muted, #999)' }}>加载中...</p>
                ) : appInfo?.available ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            flex: 1,
                            minWidth: 200,
                        }}>
                            <div style={{
                                width: 48,
                                height: 48,
                                borderRadius: 12,
                                background: 'linear-gradient(135deg, var(--color-accent, #E2FF66), #00e676)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 24,
                                flexShrink: 0,
                            }}>
                                📦
                            </div>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--color-text-primary, #111)' }}>
                                    {appInfo.filename}
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--color-text-secondary, #666)', marginTop: 2 }}>
                                    {formatSize(appInfo.size)} · 更新于 {new Date(appInfo.updatedAt).toLocaleString('zh-CN')}
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={handleDelete}
                            style={{
                                padding: '8px 16px',
                                borderRadius: 8,
                                border: '1px solid var(--color-danger)',
                                background: 'transparent',
                                color: 'var(--color-danger)',
                                fontSize: 13,
                                cursor: 'pointer',
                                transition: 'all 150ms',
                            }}
                            onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.05)' }}
                            onMouseOut={(e) => { e.currentTarget.style.background = 'transparent' }}
                        >
                            🗑️ 删除
                        </button>
                    </div>
                ) : (
                    <div style={{
                        padding: '16px 20px',
                        borderRadius: 10,
                        background: 'var(--color-bg-secondary, #f5f5f5)',
                        color: 'var(--color-text-secondary, #666)',
                        fontSize: 14,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                    }}>
                        <ExclamationTriangleIcon className="w-5 h-5 text-yellow-500" />
                        尚未上传任何安装包
                    </div>
                )}
            </div>

            {/* 上传区域 */}
            <div style={cardStyle}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--color-text-primary, #111)' }}>
                    上传 / 更新安装包
                </h3>

                <div
                    onClick={() => !uploading && fileInputRef.current?.click()}
                    style={{
                        border: '2px dashed var(--color-border, #d1d5db)',
                        borderRadius: 14,
                        padding: '48px 32px',
                        textAlign: 'center',
                        cursor: uploading ? 'wait' : 'pointer',
                        transition: 'all 200ms ease',
                        background: uploading ? 'var(--color-bg-secondary, #f5f5f5)' : 'transparent',
                    }}
                    onMouseOver={(e) => {
                        if (!uploading) e.currentTarget.style.borderColor = 'var(--color-accent, #E2FF66)'
                    }}
                    onMouseOut={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-border, #d1d5db)'
                    }}
                >
                    {uploading ? (
                        <>
                            <div style={{
                                width: 40,
                                height: 40,
                                border: '3px solid var(--color-bg-secondary, #e5e7eb)',
                                borderTopColor: 'var(--color-accent, #E2FF66)',
                                borderRadius: '50%',
                                animation: 'spin 0.8s linear infinite',
                                margin: '0 auto 16px',
                            }}></div>
                            <p style={{ color: 'var(--color-text-secondary, #666)', fontSize: 15 }}>正在上传...</p>
                        </>
                    ) : (
                        <>
                            <div style={{ fontSize: 40, marginBottom: 12 }}>📤</div>
                            <p style={{
                                fontWeight: 600,
                                fontSize: 15,
                                color: 'var(--color-text-primary, #111)',
                                marginBottom: 4,
                            }}>
                                点击选择文件上传
                            </p>
                            <p style={{
                                fontSize: 13,
                                color: 'var(--color-text-muted, #999)',
                            }}>
                                文件将被保存为 "管理器.exe"（覆盖已有版本）
                            </p>
                        </>
                    )}
                </div>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".exe,.msi,.zip,.7z"
                    onChange={handleUpload}
                    style={{ display: 'none' }}
                />
            </div>

            <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    )
}

export default AppManagerPage
