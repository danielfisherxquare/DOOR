import { useState, useEffect } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

function AppDownload() {
    const [appInfo, setAppInfo] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetch(`${API_BASE}/tools/app-info`)
            .then((r) => r.json())
            .then((res) => {
                if (res.success) setAppInfo(res.data)
            })
            .catch(() => { })
            .finally(() => setLoading(false))
    }, [])

    const formatSize = (bytes) => {
        if (!bytes) return '未知'
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    const handleDownload = () => {
        window.open(`${API_BASE}/tools/download-app`, '_blank')
    }

    return (
        <div style={{ padding: '24px 0' }}>
            <div style={{
                maxWidth: 520,
                margin: '0 auto',
                background: 'var(--color-bg-primary, #ffffff)',
                borderRadius: 20,
                padding: '48px 40px',
                boxShadow: 'var(--shadow-md)',
                textAlign: 'center',
            }}>
                {/* 应用图标 */}
                <div style={{
                    width: 88,
                    height: 88,
                    borderRadius: 22,
                    background: 'linear-gradient(135deg, var(--color-accent, #E2FF66) 0%, #00e676 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 42,
                    margin: '0 auto 24px',
                    boxShadow: '0 8px 24px rgba(226, 255, 102, 0.3)',
                }}>
                    🏃
                </div>

                {/* 标题和描述 */}
                <h2 style={{
                    fontSize: 24,
                    fontWeight: 700,
                    color: 'var(--color-text-primary, #111)',
                    marginBottom: 8,
                }}>
                    本地马拉松报名数据管理器
                </h2>
                <p style={{
                    color: 'var(--color-text-secondary, #666)',
                    fontSize: 14,
                    lineHeight: 1.6,
                    marginBottom: 32,
                }}>
                    专业的本地化报名数据管理工具，支持数据导入、清洗、
                    抽签、号码布分配等完整工作流程。双击即用，无需安装额外依赖。
                </p>

                {/* 系统要求 */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: 24,
                    marginBottom: 32,
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 16px',
                        borderRadius: 12,
                        background: 'var(--color-bg-secondary, #f5f5f5)',
                        fontSize: 13,
                        color: 'var(--color-text-secondary, #666)',
                    }}>
                        <span>🪟</span> Windows 10+
                    </div>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 16px',
                        borderRadius: 12,
                        background: 'var(--color-bg-secondary, #f5f5f5)',
                        fontSize: 13,
                        color: 'var(--color-text-secondary, #666)',
                    }}>
                        <span>💾</span> {loading ? '...' : formatSize(appInfo?.size)}
                    </div>
                </div>

                {/* 下载按钮 */}
                {loading ? (
                    <div style={{ color: 'var(--color-text-muted, #999)', fontSize: 14 }}>
                        正在检查安装包信息...
                    </div>
                ) : appInfo?.available ? (
                    <>
                        <button
                            onClick={handleDownload}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 10,
                                padding: '14px 40px',
                                borderRadius: 14,
                                border: 'none',
                                background: 'linear-gradient(135deg, var(--color-accent, #E2FF66) 0%, #00e676 100%)',
                                color: 'var(--color-accent-text)',
                                fontWeight: 700,
                                fontSize: 16,
                                cursor: 'pointer',
                                boxShadow: '0 4px 16px rgba(57, 255, 20, 0.35)',
                                transition: 'all 200ms ease',
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.transform = 'translateY(-2px)'
                                e.currentTarget.style.boxShadow = '0 8px 24px rgba(226, 255, 102, 0.45)'
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)'
                                e.currentTarget.style.boxShadow = '0 4px 16px rgba(226, 255, 102, 0.35)'
                            }}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            下载 管理器.exe
                        </button>
                        {appInfo.updatedAt && (
                            <p style={{
                                marginTop: 16,
                                fontSize: 12,
                                color: 'var(--color-text-muted, #999)',
                            }}>
                                更新时间: {new Date(appInfo.updatedAt).toLocaleString('zh-CN')}
                            </p>
                        )}
                    </>
                ) : (
                    <div style={{
                        padding: '16px 24px',
                        borderRadius: 12,
                        background: 'var(--color-bg-secondary, #f5f5f5)',
                        color: 'var(--color-text-secondary, #666)',
                        fontSize: 14,
                    }}>
                        ⏳ 安装包正在准备中，请稍后再来
                    </div>
                )}

                {/* 功能亮点 */}
                <div style={{
                    marginTop: 40,
                    borderTop: '1px solid var(--color-border, #e5e7eb)',
                    paddingTop: 32,
                    textAlign: 'left',
                }}>
                    <h3 style={{
                        fontSize: 15,
                        fontWeight: 600,
                        color: 'var(--color-text-primary, #111)',
                        marginBottom: 16,
                        textAlign: 'center',
                    }}>
                        ✨ 功能亮点
                    </h3>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 12,
                    }}>
                        {[
                            { icon: '📊', title: '数据导入', desc: 'Excel/CSV 一键导入' },
                            { icon: '🧹', title: '数据清洗', desc: '自动去重、格式校验' },
                            { icon: '🎲', title: '智能抽签', desc: '支持多种抽签策略' },
                            { icon: '🏷️', title: '号码分配', desc: 'Bib 号段智能管理' },
                            { icon: '🗺️', title: '地图工具', desc: '赛道规划与管理' },
                            { icon: '📄', title: 'PDF 生成', desc: '批量证书/签到表' },
                        ].map((f, i) => (
                            <div key={i} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                padding: '10px 12px',
                                borderRadius: 10,
                                background: 'var(--color-bg-secondary, #f5f5f5)',
                            }}>
                                <span style={{ fontSize: 20 }}>{f.icon}</span>
                                <div>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary, #111)' }}>{f.title}</div>
                                    <div style={{ fontSize: 11, color: 'var(--color-text-muted, #999)' }}>{f.desc}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default AppDownload
