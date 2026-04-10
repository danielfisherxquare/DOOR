import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import racesApi from '../../../api/races'

export default function CredentialSelectRacePage() {
    const [searchParams] = useSearchParams()
    const orgId = searchParams.get('orgId')
    const returnTo = searchParams.get('returnTo') || '/credential/access-areas'

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

    // 构建选择赛事后的跳转链接
    const buildRaceHref = (raceId) => {
        const params = new URLSearchParams()
        if (orgId) params.set('orgId', orgId)
        params.set('raceId', raceId)
        return `/admin${returnTo}?${params.toString()}`
    }

    if (!orgId) {
        return (
            <div style={styles.container}>
                <div style={styles.empty}>请先在顶部展开上下文栏，选择目标机构</div>
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
            <h1 style={styles.title}>选择赛事</h1>
            <p style={styles.subtitle}>当前功能依赖赛事上下文，请选择一个赛事继续操作</p>

            {races.length === 0 ? (
                <div style={styles.empty}>该机构下暂无赛事</div>
            ) : (
                <div style={styles.grid}>
                    {races.map((race) => (
                        <Link
                            key={race.id}
                            to={buildRaceHref(race.id)}
                            style={styles.card}
                        >
                            <div style={styles.raceName}>{race.name}</div>
                            <div style={styles.raceMeta}>
                                <span>{race.startDate || race.date || '未定日期'}</span>
                                {race.location && <span style={styles.dot}>·</span>}
                                <span>{race.location}</span>
                            </div>
                            <div style={styles.cardArrow}>选择并继续 →</div>
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
        color: 'var(--text-primary)',
    },
    subtitle: {
        fontSize: '16px',
        color: 'var(--text-secondary)',
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
        background: 'linear-gradient(180deg, color-mix(in srgb, var(--surface) 97%, transparent), var(--surface))',
        borderRadius: '0px',
        textDecoration: 'none',
        color: 'inherit',
        transition: 'all 0.2s',
        border: '1px solid var(--border)',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
    },
    raceName: {
        fontSize: '18px',
        fontWeight: 600,
        marginBottom: '8px',
        color: 'var(--text-primary)',
    },
    raceMeta: {
        fontSize: '14px',
        color: 'var(--text-secondary)',
        marginBottom: '16px',
    },
    dot: {
        margin: '0 6px',
    },
    cardArrow: {
        fontSize: '14px',
        fontWeight: 500,
        color: 'var(--accent)',
        marginTop: 'auto',
    },
    empty: {
        textAlign: 'center',
        padding: '80px 0',
        color: 'var(--text-muted)',
        fontSize: '16px',
    },
    error: {
        color: 'var(--danger)',
        padding: '16px',
        background: 'var(--danger-soft)',
        borderRadius: '0px',
        border: '1px solid color-mix(in srgb, var(--danger) 28%, transparent)',
    },
}
