import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import useInterviewStore, { CRITERIA_DATA } from '../../stores/interviewStore';
import { loadChartJs } from '../../utils/chartLoader';
import { normalizeInterviewDate } from '../../utils/beijingDate';

// 设计令牌
const DESIGN_TOKENS = {
  bgPrimary: '#F5F7FA',
  bgCard: '#FFFFFF',
  bgSecondary: '#F3F4F6',
  textPrimary: '#27272A',
  textSecondary: '#6B7280',
  textMuted: '#71717A',
  borderColor: '#E5E7EB',
  shadowSm: '0 2px 12px rgba(0, 0, 0, 0.06), 0 1px 4px rgba(0, 0, 0, 0.04)',
  shadowMd: '0 10px 30px -5px rgba(0, 0, 0, 0.05)',
  radiusSm: '0.5rem',
  radiusMd: '1rem',
  radiusLg: '1.5rem',
  radiusFull: '9999px',
  spacingXs: '0.25rem',
  spacingSm: '0.5rem',
  spacingMd: '1rem',
  spacingLg: '1.5rem',
  spacingXl: '2rem',
  spacing2xl: '3rem',
  indigo: '#6366f1',
  indigoLight: '#e0e7ff',
  emerald: '#10b981',
  emeraldLight: '#d1fae5',
  amber: '#f59e0b',
  amberLight: '#fef3c7',
  rose: '#ef4444',
  roseLight: '#fee2e2',
  stone: '#78716c',
  stoneLight: '#f5f5f4',
};

// 对比图表颜色
const COMPARE_COLORS = [
  { border: '#6366f1', bg: 'rgba(99, 102, 241, 0.2)' },
  { border: '#10b981', bg: 'rgba(16, 185, 129, 0.2)' },
  { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.2)' },
  { border: '#ef4444', bg: 'rgba(239, 68, 68, 0.2)' },
  { border: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.2)' },
];

// 响应式断点
const BREAKPOINTS = {
  mobile: 640,
  tablet: 1024,
  desktop: 1280,
};

function InterviewCompare() {
    const { interviews, fetchInterviews } = useInterviewStore();
    const [selectedIds, setSelectedIds] = useState([]);
    const [compareData, setCompareData] = useState([]);
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);
    const chartRef = useRef(null);
    const chartInstance = useRef(null);

    useEffect(() => {
        fetchInterviews();
    }, []);

    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        let cancelled = false;

        loadChartJs().then(Chart => {
            if (!cancelled) {
                window.Chart = Chart;
            }
        });

        return () => {
            cancelled = true;
        };
    }, []);

    const isMobile = windowWidth < BREAKPOINTS.mobile;
    const isTablet = windowWidth >= BREAKPOINTS.mobile && windowWidth < BREAKPOINTS.tablet;
    const isDesktop = windowWidth >= BREAKPOINTS.tablet;

    useEffect(() => {
        if (selectedIds.length > 0 && chartRef.current && window.Chart) {
            const datasets = compareData.map((interview, idx) => {
                const color = COMPARE_COLORS[idx % COMPARE_COLORS.length];
                const scores = typeof interview.scores === 'string' ? JSON.parse(interview.scores) : interview.scores;
                return {
                    label: interview.candidate_name,
                    data: scores,
                    backgroundColor: color.bg,
                    borderColor: color.border,
                    pointBackgroundColor: color.border,
                    borderWidth: 2,
                };
            });

            if (chartInstance.current) {
                chartInstance.current.destroy();
            }

            chartInstance.current = new window.Chart(chartRef.current, {
                type: 'radar',
                data: {
                    labels: CRITERIA_DATA.map(c => c.title.split('与')[0]),
                    datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        r: {
                            angleLines: { color: 'rgba(0, 0, 0, 0.1)' },
                            grid: { color: 'rgba(0, 0, 0, 0.1)' },
                            pointLabels: { 
                                font: { size: isMobile ? 9 : 12, weight: '600' }, 
                                color: '#57534e' 
                            },
                            ticks: { display: false, stepSize: 1 },
                            min: 0,
                            max: 5
                        }
                    },
                    plugins: {
                        legend: { 
                            position: isMobile ? 'bottom' : 'bottom',
                            labels: {
                                usePointStyle: true,
                                padding: isMobile ? 10 : 20,
                                font: { size: isMobile ? 10 : 12 },
                                boxWidth: isMobile ? 8 : 10,
                            }
                        }
                    }
                }
            });
        }
    }, [compareData, isMobile]);

    useEffect(() => {
        return () => {
            if (chartInstance.current) {
                chartInstance.current.destroy();
                chartInstance.current = null;
            }
        };
    }, []);

    const handleSelect = (id) => {
        const interview = interviews.find(i => i.id === id);
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(i => i !== id));
            setCompareData(compareData.filter(d => d.id !== id));
        } else if (selectedIds.length < 5) {
            setSelectedIds([...selectedIds, id]);
            setCompareData([...compareData, interview]);
        }
    };

    const tierConfig = {
        'S': { bg: DESIGN_TOKENS.indigoLight, text: '#3730a3' },
        'A': { bg: DESIGN_TOKENS.emeraldLight, text: '#065f46' },
        'B': { bg: DESIGN_TOKENS.amberLight, text: '#92400e' },
        'C': { bg: DESIGN_TOKENS.roseLight, text: '#991b1b' },
        '?': { bg: DESIGN_TOKENS.stoneLight, text: DESIGN_TOKENS.stone }
    };

    const styles = {
        container: {
            minHeight: '100vh',
            backgroundColor: DESIGN_TOKENS.bgPrimary,
            fontFamily: 'var(--font-family)',
        },
        nav: {
            backgroundColor: DESIGN_TOKENS.bgCard,
            borderBottom: `1px solid ${DESIGN_TOKENS.borderColor}`,
            position: 'sticky',
            top: 0,
            zIndex: 50,
            boxShadow: DESIGN_TOKENS.shadowSm,
        },
        navInner: {
            maxWidth: '1280px',
            margin: '0 auto',
            padding: isMobile ? `0 ${DESIGN_TOKENS.spacingMd}` : `0 ${DESIGN_TOKENS.spacingXl}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            height: isMobile ? '56px' : '64px',
        },
        navBrand: {
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? DESIGN_TOKENS.spacingSm : DESIGN_TOKENS.spacingMd,
        },
        navTitle: {
            fontSize: isMobile ? '1rem' : '1.25rem',
            fontWeight: 700,
            color: DESIGN_TOKENS.textPrimary,
            letterSpacing: '-0.025em',
        },
        navLinks: {
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? DESIGN_TOKENS.spacingMd : DESIGN_TOKENS.spacingLg,
            fontSize: '0.875rem',
            fontWeight: 500,
        },
        navLink: {
            color: DESIGN_TOKENS.textSecondary,
            textDecoration: 'none',
            transition: 'color 0.2s ease',
            fontSize: isMobile ? '0.75rem' : '0.875rem',
        },
        main: {
            maxWidth: '1280px',
            margin: '0 auto',
            padding: isMobile ? DESIGN_TOKENS.spacingMd : DESIGN_TOKENS.spacingXl,
        },
        grid: {
            display: 'flex',
            flexDirection: isDesktop ? 'row' : 'column',
            gap: isMobile ? DESIGN_TOKENS.spacingMd : DESIGN_TOKENS.spacingXl,
        },
        sidebar: {
            width: isDesktop ? '320px' : '100%',
            position: isDesktop ? 'sticky' : 'static',
            top: isDesktop ? '96px' : 'auto',
            height: isDesktop ? 'fit-content' : 'auto',
            order: isDesktop ? 1 : 2,
        },
        sidebarCard: {
            backgroundColor: DESIGN_TOKENS.bgCard,
            borderRadius: DESIGN_TOKENS.radiusMd,
            border: `1px solid ${DESIGN_TOKENS.borderColor}`,
            padding: isMobile ? DESIGN_TOKENS.spacingMd : DESIGN_TOKENS.spacingLg,
            boxShadow: DESIGN_TOKENS.shadowSm,
        },
        sidebarTitle: {
            fontSize: isMobile ? '1rem' : '1.125rem',
            fontWeight: 700,
            color: DESIGN_TOKENS.textPrimary,
            marginBottom: DESIGN_TOKENS.spacingMd,
        },
        candidateList: {
            display: 'flex',
            flexDirection: 'column',
            gap: DESIGN_TOKENS.spacingSm,
            maxHeight: isDesktop ? '500px' : '300px',
            overflowY: 'auto',
        },
        candidateItem: (isSelected) => ({
            width: '100%',
            textAlign: 'left',
            padding: isMobile ? DESIGN_TOKENS.spacingSm : DESIGN_TOKENS.spacingMd,
            borderRadius: DESIGN_TOKENS.radiusMd,
            border: `1px solid ${isSelected ? DESIGN_TOKENS.indigo : DESIGN_TOKENS.borderColor}`,
            backgroundColor: isSelected ? DESIGN_TOKENS.indigoLight : DESIGN_TOKENS.bgCard,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            opacity: selectedIds.length >= 5 && !isSelected ? 0.5 : 1,
        }),
        candidateHeader: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '4px',
        },
        candidateName: {
            fontWeight: 600,
            color: DESIGN_TOKENS.textPrimary,
            fontSize: isMobile ? '0.875rem' : '0.9375rem',
        },
        tierTag: (tier) => ({
            padding: '2px 8px',
            borderRadius: DESIGN_TOKENS.radiusSm,
            fontSize: '0.75rem',
            fontWeight: 600,
            backgroundColor: tierConfig[tier]?.bg || tierConfig['?'].bg,
            color: tierConfig[tier]?.text || tierConfig['?'].text,
        }),
        candidateMeta: {
            fontSize: '0.875rem',
            color: DESIGN_TOKENS.textSecondary,
        },
        content: {
            display: 'flex',
            flexDirection: 'column',
            gap: isMobile ? DESIGN_TOKENS.spacingMd : DESIGN_TOKENS.spacingLg,
            flex: 1,
            order: isDesktop ? 2 : 1,
        },
        emptyState: {
            backgroundColor: DESIGN_TOKENS.bgCard,
            borderRadius: DESIGN_TOKENS.radiusMd,
            border: `1px solid ${DESIGN_TOKENS.borderColor}`,
            padding: isMobile ? DESIGN_TOKENS.spacingXl : DESIGN_TOKENS.spacing2xl,
            textAlign: 'center',
            color: DESIGN_TOKENS.textSecondary,
        },
        chartCard: {
            backgroundColor: DESIGN_TOKENS.bgCard,
            borderRadius: DESIGN_TOKENS.radiusMd,
            border: `1px solid ${DESIGN_TOKENS.borderColor}`,
            padding: isMobile ? DESIGN_TOKENS.spacingMd : DESIGN_TOKENS.spacingLg,
            boxShadow: DESIGN_TOKENS.shadowSm,
        },
        chartTitle: {
            fontSize: isMobile ? '1rem' : '1.125rem',
            fontWeight: 700,
            color: DESIGN_TOKENS.textPrimary,
            marginBottom: isMobile ? DESIGN_TOKENS.spacingMd : DESIGN_TOKENS.spacingLg,
        },
        tableCard: {
            backgroundColor: DESIGN_TOKENS.bgCard,
            borderRadius: DESIGN_TOKENS.radiusMd,
            border: `1px solid ${DESIGN_TOKENS.borderColor}`,
            padding: isMobile ? DESIGN_TOKENS.spacingMd : DESIGN_TOKENS.spacingLg,
            boxShadow: DESIGN_TOKENS.shadowSm,
            overflow: 'hidden',
        },
        tableTitle: {
            fontSize: isMobile ? '1rem' : '1.125rem',
            fontWeight: 700,
            color: DESIGN_TOKENS.textPrimary,
            marginBottom: isMobile ? DESIGN_TOKENS.spacingMd : DESIGN_TOKENS.spacingLg,
        },
        tableWrapper: {
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
        },
        table: {
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: isMobile ? '0.8125rem' : '0.875rem',
            minWidth: isMobile ? '500px' : 'auto',
        },
        th: {
            textAlign: 'left',
            padding: isMobile ? `${DESIGN_TOKENS.spacingSm} ${DESIGN_TOKENS.spacingMd}` : `${DESIGN_TOKENS.spacingMd} ${DESIGN_TOKENS.spacingLg}`,
            fontWeight: 600,
            color: DESIGN_TOKENS.textSecondary,
            borderBottom: `1px solid ${DESIGN_TOKENS.borderColor}`,
            backgroundColor: DESIGN_TOKENS.bgSecondary,
            whiteSpace: 'nowrap',
        },
        thCenter: {
            textAlign: 'center',
            padding: isMobile ? `${DESIGN_TOKENS.spacingSm} ${DESIGN_TOKENS.spacingMd}` : `${DESIGN_TOKENS.spacingMd} ${DESIGN_TOKENS.spacingLg}`,
            fontWeight: 600,
            color: DESIGN_TOKENS.textSecondary,
            borderBottom: `1px solid ${DESIGN_TOKENS.borderColor}`,
            backgroundColor: DESIGN_TOKENS.bgSecondary,
            whiteSpace: 'nowrap',
        },
        td: {
            padding: isMobile ? `${DESIGN_TOKENS.spacingSm} ${DESIGN_TOKENS.spacingMd}` : `${DESIGN_TOKENS.spacingMd} ${DESIGN_TOKENS.spacingLg}`,
            color: DESIGN_TOKENS.textPrimary,
            borderBottom: `1px solid ${DESIGN_TOKENS.bgSecondary}`,
            whiteSpace: 'nowrap',
        },
        tdCenter: {
            padding: isMobile ? `${DESIGN_TOKENS.spacingSm} ${DESIGN_TOKENS.spacingMd}` : `${DESIGN_TOKENS.spacingMd} ${DESIGN_TOKENS.spacingLg}`,
            textAlign: 'center',
            borderBottom: `1px solid ${DESIGN_TOKENS.bgSecondary}`,
            whiteSpace: 'nowrap',
        },
        scoreBadge: (score) => {
            let bg, color;
            if (score >= 4) {
                bg = DESIGN_TOKENS.emeraldLight;
                color = '#065f46';
            } else if (score >= 3) {
                bg = DESIGN_TOKENS.amberLight;
                color = '#92400e';
            } else if (score > 0) {
                bg = DESIGN_TOKENS.roseLight;
                color = '#991b1b';
            } else {
                bg = DESIGN_TOKENS.bgSecondary;
                color = DESIGN_TOKENS.textMuted;
            }
            return {
                display: 'inline-block',
                padding: isMobile ? '3px 8px' : '4px 12px',
                borderRadius: DESIGN_TOKENS.radiusSm,
                backgroundColor: bg,
                color: color,
                fontWeight: 600,
                fontSize: isMobile ? '0.75rem' : '0.875rem',
            };
        },
        totalRow: {
            fontWeight: 700,
        },
        totalScore: {
            color: DESIGN_TOKENS.indigo,
            fontSize: isMobile ? '1rem' : '1.125rem',
        },
    };

    return (
        <div style={styles.container}>
            <nav style={styles.nav}>
                <div style={styles.navInner}>
                    <div style={styles.navBrand}>
                        <span style={{ fontSize: isMobile ? '1.25rem' : '1.5rem' }}>🏅</span>
                        <h1 style={styles.navTitle}>候选人对比</h1>
                    </div>
                    <div style={styles.navLinks}>
                        <Link to="/interview" style={styles.navLink}>新建面试</Link>
                        <Link to="/interview/records" style={styles.navLink}>面试记录</Link>
                    </div>
                </div>
            </nav>

            <main style={styles.main}>
                <div style={styles.grid}>
                    <div style={styles.sidebar}>
                        <div style={styles.sidebarCard}>
                            <h3 style={styles.sidebarTitle}>选择候选人 (最多5人)</h3>
                            <div style={styles.candidateList}>
                                {interviews.map(interview => {
                                    const isSelected = selectedIds.includes(interview.id);
                                    const tier = tierConfig[interview.tier] || tierConfig['?'];
                                    return (
                                        <button
                                            key={interview.id}
                                            onClick={() => handleSelect(interview.id)}
                                            disabled={!isSelected && selectedIds.length >= 5}
                                            style={styles.candidateItem(isSelected)}
                                        >
                                            <div style={styles.candidateHeader}>
                                                <span style={styles.candidateName}>{interview.candidate_name}</span>
                                                <span style={styles.tierTag(interview.tier)}>
                                                    {interview.tier}级
                                                </span>
                                            </div>
                                            <div style={styles.candidateMeta}>
                                                {interview.total_score}分 · {normalizeInterviewDate(interview.interview_date)}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div style={styles.content}>
                        {selectedIds.length === 0 ? (
                            <div style={styles.emptyState}>
                                <p>请在左侧选择候选人进行对比</p>
                            </div>
                        ) : (
                            <>
                                <div style={styles.chartCard}>
                                    <h3 style={styles.chartTitle}>能力雷达对比</h3>
                                    <div style={{ height: isMobile ? '300px' : '400px' }}>
                                        <canvas ref={chartRef}></canvas>
                                    </div>
                                </div>

                                <div style={styles.tableCard}>
                                    <h3 style={styles.tableTitle}>得分对比</h3>
                                    <div style={styles.tableWrapper}>
                                        <table style={styles.table}>
                                            <thead>
                                                <tr>
                                                    <th style={styles.th}>维度</th>
                                                    {compareData.map((d, idx) => (
                                                        <th key={d.id} style={styles.thCenter}>
                                                            <span style={{ color: COMPARE_COLORS[idx % COMPARE_COLORS.length].border }}>
                                                                {d.candidate_name}
                                                            </span>
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {CRITERIA_DATA.map((criteria, idx) => (
                                                    <tr key={criteria.id}>
                                                        <td style={styles.td}>
                                                            {criteria.icon} {criteria.title}
                                                        </td>
                                                        {compareData.map(d => {
                                                            const scores = typeof d.scores === 'string' ? JSON.parse(d.scores) : d.scores;
                                                            return (
                                                                <td key={d.id} style={styles.tdCenter}>
                                                                    <span style={styles.scoreBadge(scores[idx])}>
                                                                        {scores[idx] || '-'}
                                                                    </span>
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                ))}
                                                <tr style={styles.totalRow}>
                                                    <td style={{ ...styles.td, color: DESIGN_TOKENS.textPrimary }}>总分</td>
                                                    {compareData.map(d => (
                                                        <td key={d.id} style={styles.tdCenter}>
                                                            <span style={styles.totalScore}>{d.total_score}</span>
                                                        </td>
                                                    ))}
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}

export default InterviewCompare;
