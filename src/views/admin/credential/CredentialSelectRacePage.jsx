import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import racesApi from '../../../api/races'

export default function CredentialSelectRacePage() {
    const [searchParams] = useSearchParams()
    const orgId = searchParams.get('orgId')

    const [races, setRaces] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        if (!orgId) {
            setRaces([])
            setError('')
            setLoading(false)
            return
        }

        const loadRaces = async () => {
            setLoading(true)
            setError('')

            try {
                const res = await racesApi.getAll({ orgId })
                if (res.success) {
                    const raceItems = Array.isArray(res.data)
                        ? res.data
                        : (Array.isArray(res.data?.items) ? res.data.items : [])
                    setRaces(raceItems)
                } else {
                    setError(res.message || '获取赛事列表失败')
                }
            } catch (err) {
                setError(err.message || '获取赛事列表失败')
            } finally {
                setLoading(false)
            }
        }

        void loadRaces()
    }, [orgId])

    if (!orgId) {
        return (
            <div style={styles.container}>
                <div style={styles.empty}>请先在侧边栏选择所属机构</div>
            </div>
        )
    }

    if (loading) {
        return <div style={styles.container}>正在加载赛事...</div>
    }

    if (error) {
        return <div style={styles.container}><div style={styles.error}>{error}</div></div>
    }

    return (
        <div style={styles.container}>
            <h1 style={styles.title}>证件管理 - 选择赛事</h1>
            <p style={styles.subtitle}>请选择一个赛事以开始配置证件信息</p>

            {races.length === 0 ? (
                <div style={styles.empty}>该机构下暂无赛事</div>
            ) : (
                <div style={styles.grid}>
                    {races.map((race) => (
                        <Link
                            key={race.id}
                            to={`/admin/credential/zones?orgId=${orgId}&raceId=${race.id}`}
                            style={styles.card}
                            className="bento-card"
                        >
                            <div style={styles.raceName}>{race.name}</div>
                            <div style={styles.raceMeta}>
                                <span>{race.startDate || race.date || '未定日期'}</span>
                                {race.location && <span style={styles.dot}>·</span>}
                                <span>{race.location}</span>
                            </div>
                            <div style={styles.cardArrow}>进入管理 →</div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}

const styles = {
    container: {
        padding: '40px 24px',
        maxWidth: 1000,
        margin: '0 auto',
    },
    title: {
        fontSize: '28px',
        fontWeight: 700,
        marginBottom: '8px',
        color: '#111827',
    },
    subtitle: {
        fontSize: '16px',
        color: '#6B7280',
        marginBottom: '40px',
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: '24px',
    },
    card: {
        display: 'flex',
        flexDirection: 'column',
        padding: '24px',
        background: '#fff',
        borderRadius: '16px',
        textDecoration: 'none',
        color: 'inherit',
        transition: 'all 0.2s',
        border: '1px solid #E5E7EB',
        position: 'relative',
        overflow: 'hidden',
    },
    raceName: {
        fontSize: '18px',
        fontWeight: 600,
        marginBottom: '8px',
        color: '#111827',
    },
    raceMeta: {
        fontSize: '14px',
        color: '#6B7280',
        marginBottom: '16px',
    },
    dot: {
        margin: '0 6px',
    },
    cardArrow: {
        fontSize: '14px',
        fontWeight: 500,
        color: 'var(--color-primary, #3B82F6)',
        marginTop: 'auto',
    },
    empty: {
        textAlign: 'center',
        padding: '80px 0',
        color: '#9CA3AF',
        fontSize: '16px',
    },
    error: {
        color: '#EF4444',
        padding: '16px',
        background: '#FEF2F2',
        borderRadius: '8px',
    },
}
