import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import useInterviewStore, { CRITERIA_DATA, SCENARIO_DATA } from '../../stores/interviewStore';

// 设计令牌 - 对齐 soft-design.css
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

// 响应式断点
const BREAKPOINTS = {
  mobile: 640,
  tablet: 1024,
  desktop: 1280,
};

function InterviewForm() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const editId = searchParams.get('edit');
    const chartRef = useRef(null);
    const chartInstance = useRef(null);
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);

    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const isMobile = windowWidth < BREAKPOINTS.mobile;
    const isTablet = windowWidth >= BREAKPOINTS.mobile && windowWidth < BREAKPOINTS.tablet;
    const isDesktop = windowWidth >= BREAKPOINTS.tablet;

    const {
        scores, scenarioScores, candidateName, interviewDate, interviewer, notes, editingId, isLoading,
        setScore, setScenarioScore, setCandidateName, setInterviewDate, setInterviewer, setNotes,
        getTier, getTotalScore, getBaseScore, getBonusScore, getScenarioTotal, getGrandTotal,
        resetForm, loadForEdit, saveInterview, fetchInterview
    } = useInterviewStore();

    useEffect(() => {
        if (editId) {
            fetchInterview(editId).then(data => {
                if (data) loadForEdit(data);
            });
        }
        return () => resetForm();
    }, [editId]);

    useEffect(() => {
        if (chartRef.current && window.Chart) {
            if (!chartInstance.current) {
                chartInstance.current = new window.Chart(chartRef.current, {
                    type: 'radar',
                    data: {
                        labels: CRITERIA_DATA.map(c => c.title.split('与')[0]),
                        datasets: [{
                            label: '候选人得分',
                            data: scores,
                            backgroundColor: 'rgba(99, 102, 241, 0.2)',
                            borderColor: DESIGN_TOKENS.indigo,
                            pointBackgroundColor: DESIGN_TOKENS.indigo,
                            pointBorderColor: '#fff',
                            borderWidth: 2,
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            r: {
                                angleLines: { color: 'rgba(0, 0, 0, 0.05)' },
                                grid: { color: 'rgba(0, 0, 0, 0.05)' },
                                pointLabels: { 
                                    font: { size: isMobile ? 9 : 11, weight: '600' }, 
                                    color: '#57534e' 
                                },
                                ticks: { display: false, stepSize: 1 },
                                min: 0,
                                max: 5
                            }
                        },
                        plugins: { legend: { display: false } }
                    }
                });
            } else {
                chartInstance.current.data.datasets[0].data = scores;
                chartInstance.current.update();
            }
        }
    }, [scores, isMobile]);

    const handleSave = async () => {
        const result = await saveInterview();
        if (result.success) {
            navigate('/interview/records');
        } else {
            alert(result.error || '保存失败');
        }
    };

    const tier = getTier();
    const totalScore = getTotalScore();
    const baseScore = getBaseScore();
    const bonusScore = getBonusScore();
    const scenarioTotal = getScenarioTotal();
    const grandTotal = getGrandTotal();

    const tierConfig = {
        '?': { bg: DESIGN_TOKENS.stoneLight, border: DESIGN_TOKENS.borderColor, badge: DESIGN_TOKENS.stone, text: DESIGN_TOKENS.textSecondary, title: '等待评估' },
        'S': { bg: DESIGN_TOKENS.indigoLight, border: '#c7d2fe', badge: DESIGN_TOKENS.indigo, text: '#3730a3', title: 'S级 - 强烈推荐录用' },
        'A': { bg: DESIGN_TOKENS.emeraldLight, border: '#a7f3d0', badge: DESIGN_TOKENS.emerald, text: '#065f46', title: 'A级 - 建议录用' },
        'B': { bg: DESIGN_TOKENS.amberLight, border: '#fde68a', badge: DESIGN_TOKENS.amber, text: '#92400e', title: 'B级 - 作为备选' },
        'C': { bg: DESIGN_TOKENS.roseLight, border: '#fecaca', badge: DESIGN_TOKENS.rose, text: '#991b1b', title: 'C级 - 建议淘汰' }
    };

    const currentTier = tierConfig[tier];

    const styles = {
        container: {
            minHeight: '100vh',
            backgroundColor: DESIGN_TOKENS.bgPrimary,
            fontFamily: "'Noto Sans SC', 'Inter', sans-serif",
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
            gap: DESIGN_TOKENS.spacingSm,
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
            display: 'flex',
            flexDirection: 'column',
            gap: isMobile ? DESIGN_TOKENS.spacingMd : DESIGN_TOKENS.spacingXl,
        },
        headerCard: {
            backgroundColor: DESIGN_TOKENS.bgCard,
            borderRadius: DESIGN_TOKENS.radiusLg,
            padding: isMobile ? DESIGN_TOKENS.spacingMd : DESIGN_TOKENS.spacingLg,
            boxShadow: DESIGN_TOKENS.shadowSm,
            border: `1px solid ${DESIGN_TOKENS.borderColor}`,
        },
        headerTitle: {
            fontSize: isMobile ? '1rem' : '1.125rem',
            fontWeight: 700,
            marginBottom: DESIGN_TOKENS.spacingMd,
            color: DESIGN_TOKENS.textPrimary,
        },
        formGrid: {
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: isMobile ? DESIGN_TOKENS.spacingMd : DESIGN_TOKENS.spacingLg,
        },
        formGroup: {
            display: 'flex',
            flexDirection: 'column',
            gap: DESIGN_TOKENS.spacingXs,
        },
        label: {
            fontSize: '0.875rem',
            fontWeight: 500,
            color: DESIGN_TOKENS.textSecondary,
        },
        input: {
            padding: isMobile ? '0.625rem 0.875rem' : '0.75rem 1rem',
            backgroundColor: DESIGN_TOKENS.bgSecondary,
            border: `1px solid ${DESIGN_TOKENS.borderColor}`,
            borderRadius: DESIGN_TOKENS.radiusMd,
            fontSize: isMobile ? '1rem' : '0.875rem',
            color: DESIGN_TOKENS.textPrimary,
            outline: 'none',
            transition: 'all 0.15s ease',
            width: '100%',
        },
        infoBox: {
            marginTop: DESIGN_TOKENS.spacingMd,
            padding: isMobile ? DESIGN_TOKENS.spacingSm : DESIGN_TOKENS.spacingMd,
            backgroundColor: DESIGN_TOKENS.bgSecondary,
            borderRadius: DESIGN_TOKENS.radiusMd,
            border: `1px solid ${DESIGN_TOKENS.borderColor}`,
            fontSize: isMobile ? '0.75rem' : '0.875rem',
            color: DESIGN_TOKENS.textSecondary,
            lineHeight: '1.5',
        },
        contentGrid: {
            display: 'flex',
            flexDirection: isDesktop ? 'row' : 'column',
            gap: isMobile ? DESIGN_TOKENS.spacingMd : DESIGN_TOKENS.spacingXl,
        },
        leftColumn: {
            display: 'flex',
            flexDirection: 'column',
            gap: isMobile ? DESIGN_TOKENS.spacingMd : DESIGN_TOKENS.spacingLg,
            flex: 1,
        },
        sectionTitle: {
            fontSize: isMobile ? '1.125rem' : '1.25rem',
            fontWeight: 700,
            color: DESIGN_TOKENS.textPrimary,
            marginBottom: DESIGN_TOKENS.spacingMd,
        },
        divider: {
            borderTop: `1px solid ${DESIGN_TOKENS.borderColor}`,
            paddingTop: isMobile ? DESIGN_TOKENS.spacingMd : DESIGN_TOKENS.spacingLg,
            marginTop: isMobile ? DESIGN_TOKENS.spacingMd : DESIGN_TOKENS.spacingLg,
        },
        rightColumn: {
            position: isDesktop ? 'sticky' : 'static',
            top: isDesktop ? '96px' : 'auto',
            height: isDesktop ? 'fit-content' : 'auto',
            width: isDesktop ? '380px' : '100%',
            order: isDesktop ? 2 : -1,
        },
        radarCard: {
            backgroundColor: DESIGN_TOKENS.bgCard,
            borderRadius: DESIGN_TOKENS.radiusLg,
            padding: isMobile ? DESIGN_TOKENS.spacingMd : DESIGN_TOKENS.spacingLg,
            boxShadow: DESIGN_TOKENS.shadowSm,
            border: `1px solid ${DESIGN_TOKENS.borderColor}`,
        },
        radarTitle: {
            fontSize: isMobile ? '1rem' : '1.125rem',
            fontWeight: 700,
            marginBottom: isMobile ? DESIGN_TOKENS.spacingMd : DESIGN_TOKENS.spacingLg,
            color: DESIGN_TOKENS.textPrimary,
            borderBottom: `1px solid ${DESIGN_TOKENS.bgSecondary}`,
            paddingBottom: DESIGN_TOKENS.spacingMd,
        },
        scoreDisplay: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginBottom: DESIGN_TOKENS.spacingSm,
        },
        scoreLabel: {
            fontSize: '0.875rem',
            fontWeight: 500,
            color: DESIGN_TOKENS.textSecondary,
        },
        scoreValue: {
            fontSize: isMobile ? '2rem' : '2.5rem',
            fontWeight: 800,
            color: DESIGN_TOKENS.indigo,
            letterSpacing: '-0.025em',
        },
        scoreUnit: {
            fontSize: '1rem',
            color: DESIGN_TOKENS.textMuted,
            fontWeight: 500,
        },
        scoreBreakdown: {
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.75rem',
            color: DESIGN_TOKENS.textMuted,
            marginBottom: DESIGN_TOKENS.spacingLg,
        },
        tierBox: {
            borderRadius: DESIGN_TOKENS.radiusMd,
            padding: isMobile ? DESIGN_TOKENS.spacingMd : DESIGN_TOKENS.spacingLg,
            border: `1px solid ${currentTier.border}`,
            backgroundColor: currentTier.bg,
            transition: 'all 0.3s ease',
        },
        tierHeader: {
            display: 'flex',
            alignItems: 'center',
            gap: DESIGN_TOKENS.spacingMd,
            marginBottom: DESIGN_TOKENS.spacingSm,
        },
        tierBadge: {
            width: isMobile ? '28px' : '32px',
            height: isMobile ? '28px' : '32px',
            borderRadius: '50%',
            backgroundColor: currentTier.badge,
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: isMobile ? '0.875rem' : '1.125rem',
        },
        tierTitle: {
            fontWeight: 700,
            color: currentTier.text,
            fontSize: isMobile ? '0.875rem' : '1rem',
        },
        tierDesc: {
            fontSize: isMobile ? '0.75rem' : '0.875rem',
            color: DESIGN_TOKENS.textSecondary,
            lineHeight: '1.5',
            marginTop: DESIGN_TOKENS.spacingSm,
        },
        scenarioSection: {
            backgroundColor: DESIGN_TOKENS.bgCard,
            borderRadius: DESIGN_TOKENS.radiusLg,
            padding: isMobile ? `${DESIGN_TOKENS.spacingLg} ${DESIGN_TOKENS.spacingMd}` : `${DESIGN_TOKENS.spacingXl} ${DESIGN_TOKENS.spacingLg}`,
            boxShadow: DESIGN_TOKENS.shadowSm,
            border: `1px solid ${DESIGN_TOKENS.borderColor}`,
            marginTop: isMobile ? DESIGN_TOKENS.spacingMd : DESIGN_TOKENS.spacingLg,
        },
        scenarioTitle: {
            fontSize: isMobile ? '1.125rem' : '1.5rem',
            fontWeight: 700,
            color: DESIGN_TOKENS.textPrimary,
            marginBottom: DESIGN_TOKENS.spacingSm,
        },
        scenarioDesc: {
            fontSize: isMobile ? '0.875rem' : '1rem',
            color: DESIGN_TOKENS.textSecondary,
            marginBottom: isMobile ? DESIGN_TOKENS.spacingLg : DESIGN_TOKENS.spacingXl,
        },
        footer: {
            backgroundColor: '#292524',
            color: DESIGN_TOKENS.textMuted,
            padding: `${isMobile ? DESIGN_TOKENS.spacingLg : DESIGN_TOKENS.spacingXl} 0`,
            textAlign: 'center',
            marginTop: isMobile ? DESIGN_TOKENS.spacingXl : DESIGN_TOKENS.spacing2xl,
        },
        footerText: {
            fontSize: isMobile ? '0.75rem' : '0.875rem',
        },
    };

    return (
        <div style={styles.container}>
            <nav style={styles.nav}>
                <div style={styles.navInner}>
                    <div style={styles.navBrand}>
                        <span style={{ fontSize: isMobile ? '1.25rem' : '1.5rem' }}>🏅</span>
                        <h1 style={styles.navTitle}>平面设计师评估系统</h1>
                    </div>
                    <div style={styles.navLinks}>
                        <Link to="/interview/records" style={styles.navLink}>面试记录</Link>
                        <Link to="/interview/compare" style={styles.navLink}>候选人对比</Link>
                    </div>
                </div>
            </nav>

            <main style={styles.main}>
                <div style={styles.headerCard}>
                    <h2 style={styles.headerTitle}>基本信息</h2>
                    <div style={styles.formGrid}>
                        <div style={styles.formGroup}>
                            <label style={styles.label}>候选人姓名 *</label>
                            <input
                                type="text"
                                value={candidateName}
                                onChange={e => setCandidateName(e.target.value)}
                                placeholder="输入姓名..."
                                style={styles.input}
                            />
                        </div>
                        <div style={styles.formGroup}>
                            <label style={styles.label}>面试日期 *</label>
                            <input
                                type="date"
                                value={interviewDate}
                                onChange={e => setInterviewDate(e.target.value)}
                                style={styles.input}
                            />
                        </div>
                        <div style={styles.formGroup}>
                            <label style={styles.label}>面试官</label>
                            <input
                                type="text"
                                value={interviewer}
                                onChange={e => setInterviewer(e.target.value)}
                                placeholder="您的名字..."
                                style={styles.input}
                            />
                        </div>
                    </div>
                    <div style={styles.infoBox}>
                        💡 <strong>评估说明：</strong> 可直接阅读打分板上的 <strong>【速问】</strong> 对候选人进行摸底提问，并参考下方的分数判定标准进行快速打分。底部"实战场景提问指南"可用于深度抗压考察。
                    </div>
                </div>

                <div style={styles.contentGrid}>
                    <div style={styles.leftColumn}>
                        <div>
                            <h2 style={styles.sectionTitle}>专业技能打分板 (1-5分)</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? DESIGN_TOKENS.spacingSm : DESIGN_TOKENS.spacingMd }}>
                                {CRITERIA_DATA.filter(c => c.type === 'core').map(item => (
                                    <CriteriaCard key={item.id} item={item} score={scores[item.id]} onScore={setScore} isMobile={isMobile} />
                                ))}
                            </div>
                        </div>

                        <div style={styles.divider}>
                            <h3 style={{ ...styles.sectionTitle, fontSize: isMobile ? '1rem' : '1.125rem' }}>高阶加分项</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? DESIGN_TOKENS.spacingSm : DESIGN_TOKENS.spacingMd }}>
                                {CRITERIA_DATA.filter(c => c.type === 'bonus').map(item => (
                                    <CriteriaCard key={item.id} item={item} score={scores[item.id]} onScore={setScore} isMobile={isMobile} />
                                ))}
                            </div>
                        </div>

                        <div style={styles.headerCard}>
                            <label style={styles.label}>备注</label>
                            <textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                placeholder="其他备注信息..."
                                rows={3}
                                style={{ ...styles.input, resize: 'none', marginTop: DESIGN_TOKENS.spacingSm }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: isMobile ? DESIGN_TOKENS.spacingSm : DESIGN_TOKENS.spacingMd }}>
                            <button
                                onClick={handleSave}
                                disabled={isLoading}
                                style={{
                                    flex: 1,
                                    padding: isMobile ? '0.625rem 1rem' : '0.75rem 1.5rem',
                                    backgroundColor: DESIGN_TOKENS.indigo,
                                    color: 'white',
                                    fontWeight: 600,
                                    borderRadius: DESIGN_TOKENS.radiusMd,
                                    border: 'none',
                                    cursor: isLoading ? 'not-allowed' : 'pointer',
                                    opacity: isLoading ? 0.5 : 1,
                                    transition: 'all 0.2s ease',
                                    fontSize: isMobile ? '0.875rem' : '1rem',
                                }}
                            >
                                {isLoading ? '保存中...' : (editingId ? '更新面试记录' : '保存面试记录')}
                            </button>
                            <button
                                onClick={resetForm}
                                style={{
                                    padding: isMobile ? '0.625rem 1rem' : '0.75rem 1.5rem',
                                    backgroundColor: DESIGN_TOKENS.bgSecondary,
                                    color: DESIGN_TOKENS.textSecondary,
                                    fontWeight: 600,
                                    borderRadius: DESIGN_TOKENS.radiusMd,
                                    border: 'none',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    fontSize: isMobile ? '0.875rem' : '1rem',
                                }}
                            >
                                重置
                            </button>
                        </div>
                    </div>

                    <div style={styles.rightColumn}>
                        <div style={styles.radarCard}>
                            <h3 style={styles.radarTitle}>能力雷达模型</h3>
                            <div style={{ position: 'relative', width: '100%', height: isMobile ? '250px' : '300px' }}>
                                <canvas ref={chartRef}></canvas>
                            </div>

                            <div style={{ marginTop: isMobile ? DESIGN_TOKENS.spacingMd : DESIGN_TOKENS.spacingLg, paddingTop: isMobile ? DESIGN_TOKENS.spacingMd : DESIGN_TOKENS.spacingLg, borderTop: `1px solid ${DESIGN_TOKENS.bgSecondary}` }}>
                                <div style={styles.scoreDisplay}>
                                    <span style={styles.scoreLabel}>8维评分 / 40</span>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: DESIGN_TOKENS.spacingXs }}>
                                        <span style={styles.scoreValue}>{totalScore}</span>
                                        <span style={styles.scoreUnit}>分</span>
                                    </div>
                                </div>
                                <div style={styles.scoreBreakdown}>
                                    <span>基础: {baseScore}/30</span>
                                    <span>加分: {bonusScore}/10</span>
                                </div>
                                
                                <div style={{ marginTop: DESIGN_TOKENS.spacingMd, paddingTop: DESIGN_TOKENS.spacingMd, borderTop: `1px dashed ${DESIGN_TOKENS.borderColor}` }}>
                                    <div style={styles.scoreDisplay}>
                                        <span style={styles.scoreLabel}>场景题 / 20</span>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: DESIGN_TOKENS.spacingXs }}>
                                            <span style={{ ...styles.scoreValue, fontSize: isMobile ? '1.5rem' : '2rem', color: DESIGN_TOKENS.emerald }}>{scenarioTotal}</span>
                                            <span style={styles.scoreUnit}>分</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: DESIGN_TOKENS.textMuted, marginBottom: DESIGN_TOKENS.spacingMd }}>
                                        <span>4个场景平均分</span>
                                    </div>
                                </div>
                                
                                <div style={{ marginTop: DESIGN_TOKENS.spacingMd, paddingTop: DESIGN_TOKENS.spacingMd, borderTop: `2px solid ${DESIGN_TOKENS.indigo}` }}>
                                    <div style={styles.scoreDisplay}>
                                        <span style={{ ...styles.scoreLabel, fontWeight: 700, color: DESIGN_TOKENS.textPrimary }}>综合总分 / 60</span>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: DESIGN_TOKENS.spacingXs }}>
                                            <span style={{ ...styles.scoreValue, color: DESIGN_TOKENS.indigo }}>{grandTotal}</span>
                                            <span style={styles.scoreUnit}>分</span>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ ...styles.tierBox, marginTop: DESIGN_TOKENS.spacingLg }}>
                                    <div style={styles.tierHeader}>
                                        <span style={styles.tierBadge}>{tier}</span>
                                        <h4 style={styles.tierTitle}>{currentTier.title}</h4>
                                    </div>
                                    <p style={styles.tierDesc}>
                                        {tier === '?' && '请在左侧对各项能力进行打分，系统将自动计算评级推荐。'}
                                        {tier === 'S' && '具备全自动工业化排版能力，且有 3D/AI 前沿武器，能重塑部门工作流的顶级将才。'}
                                        {tier === 'A' && '核心能力无短板，能扛住"临时换Logo"、"巨幅输出"等高压，即插即用。'}
                                        {tier === 'B' && '会设计，但缺乏大型阵列物料及规范化印前经验，入职后需经历系统化培训。'}
                                        {tier === 'C' && '基础薄弱或踩中严重红线。缺乏工程化概念，易在印刷现场造成巨大事故。'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div style={styles.scenarioSection}>
                    <h2 style={styles.scenarioTitle}>深度实战场景提问 (防忽悠专用)</h2>
                    <p style={styles.scenarioDesc}>当无法通过速问准确判断候选人水平时，抛出以下极限抗压场景，快速识破落地经验。每个场景满分5分。</p>
                    <ScenarioAccordions 
                        isMobile={isMobile} 
                        scenarioScores={scenarioScores}
                        onScenarioScore={setScenarioScore}
                    />
                    
                    {/* 场景题统计面板 */}
                    <div style={{
                        marginTop: isMobile ? DESIGN_TOKENS.spacingMd : DESIGN_TOKENS.spacingLg,
                        padding: isMobile ? DESIGN_TOKENS.spacingMd : DESIGN_TOKENS.spacingLg,
                        backgroundColor: DESIGN_TOKENS.bgSecondary,
                        borderRadius: DESIGN_TOKENS.radiusMd,
                        border: `1px solid ${DESIGN_TOKENS.borderColor}`,
                    }}>
                        <h3 style={{
                            fontSize: isMobile ? '1rem' : '1.125rem',
                            fontWeight: 700,
                            color: DESIGN_TOKENS.textPrimary,
                            marginBottom: isMobile ? DESIGN_TOKENS.spacingSm : DESIGN_TOKENS.spacingMd,
                        }}>
                            场景题得分统计
                        </h3>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
                            gap: isMobile ? DESIGN_TOKENS.spacingSm : DESIGN_TOKENS.spacingMd,
                            marginBottom: isMobile ? DESIGN_TOKENS.spacingMd : DESIGN_TOKENS.spacingLg,
                        }}>
                            {SCENARIO_DATA.map((scenario, idx) => (
                                <div key={idx} style={{
                                    backgroundColor: DESIGN_TOKENS.bgCard,
                                    padding: isMobile ? DESIGN_TOKENS.spacingSm : DESIGN_TOKENS.spacingMd,
                                    borderRadius: DESIGN_TOKENS.radiusMd,
                                    border: `1px solid ${DESIGN_TOKENS.borderColor}`,
                                    textAlign: 'center',
                                }}>
                                    <div style={{
                                        fontSize: isMobile ? '0.625rem' : '0.75rem',
                                        color: DESIGN_TOKENS.textMuted,
                                        marginBottom: '4px',
                                    }}>
                                        场景{idx + 1}
                                    </div>
                                    <div style={{
                                        fontSize: isMobile ? '1.25rem' : '1.5rem',
                                        fontWeight: 700,
                                        color: scenarioScores[idx] >= 4 ? DESIGN_TOKENS.emerald : scenarioScores[idx] >= 3 ? DESIGN_TOKENS.amber : scenarioScores[idx] > 0 ? DESIGN_TOKENS.rose : DESIGN_TOKENS.textMuted,
                                    }}>
                                        {scenarioScores[idx]}
                                    </div>
                                    <div style={{
                                        fontSize: '0.625rem',
                                        color: DESIGN_TOKENS.textMuted,
                                    }}>
                                        /5分
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: isMobile ? DESIGN_TOKENS.spacingMd : DESIGN_TOKENS.spacingLg,
                            backgroundColor: DESIGN_TOKENS.bgCard,
                            borderRadius: DESIGN_TOKENS.radiusMd,
                            border: `2px solid ${DESIGN_TOKENS.indigo}`,
                        }}>
                            <div>
                                <div style={{
                                    fontSize: isMobile ? '0.875rem' : '1rem',
                                    fontWeight: 600,
                                    color: DESIGN_TOKENS.textPrimary,
                                }}>
                                    场景题总分
                                </div>
                                <div style={{
                                    fontSize: isMobile ? '0.75rem' : '0.875rem',
                                    color: DESIGN_TOKENS.textSecondary,
                                }}>
                                    4个场景平均权重
                                </div>
                            </div>
                            <div style={{
                                display: 'flex',
                                alignItems: 'baseline',
                                gap: DESIGN_TOKENS.spacingXs,
                            }}>
                                <span style={{
                                    fontSize: isMobile ? '1.75rem' : '2.25rem',
                                    fontWeight: 800,
                                    color: DESIGN_TOKENS.indigo,
                                }}>{scenarioTotal}</span>
                                <span style={{
                                    fontSize: isMobile ? '0.875rem' : '1rem',
                                    color: DESIGN_TOKENS.textMuted,
                                }}>/20分</span>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <footer style={styles.footer}>
                <p style={styles.footerText}>体育赛事公司内部用表 · 数字化互动打分系统</p>
            </footer>
        </div>
    );
}

function CriteriaCard({ item, score, onScore, isMobile }) {
    const isCore = item.type === 'core';
    
    const cardStyles = {
        backgroundColor: DESIGN_TOKENS.bgCard,
        border: `1px solid ${DESIGN_TOKENS.borderColor}`,
        borderRadius: DESIGN_TOKENS.radiusMd,
        padding: isMobile ? DESIGN_TOKENS.spacingMd : DESIGN_TOKENS.spacingLg,
        boxShadow: DESIGN_TOKENS.shadowSm,
        transition: 'all 0.2s ease',
        position: 'relative',
        overflow: 'hidden',
    };

    const accentBarStyles = {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '4px',
        height: '100%',
        backgroundColor: isCore ? DESIGN_TOKENS.indigo : DESIGN_TOKENS.amber,
        opacity: 0,
        transition: 'opacity 0.2s ease',
    };

    const headerStyles = {
        display: 'flex',
        alignItems: 'center',
        gap: DESIGN_TOKENS.spacingSm,
        marginBottom: DESIGN_TOKENS.spacingSm,
    };

    const titleStyles = {
        fontWeight: 700,
        color: DESIGN_TOKENS.textPrimary,
        fontSize: isMobile ? '0.9375rem' : '1rem',
    };

    const badgeStyles = {
        fontSize: '0.625rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        padding: '2px 8px',
        borderRadius: DESIGN_TOKENS.radiusSm,
        fontWeight: 600,
        backgroundColor: isCore ? DESIGN_TOKENS.indigoLight : DESIGN_TOKENS.amberLight,
        color: isCore ? '#3730a3' : '#92400e',
    };

    const descStyles = {
        fontSize: isMobile ? '0.8125rem' : '0.875rem',
        color: DESIGN_TOKENS.textSecondary,
        lineHeight: '1.5',
        marginBottom: DESIGN_TOKENS.spacingSm,
    };

    const questionBoxStyles = {
        backgroundColor: 'rgba(99, 102, 241, 0.08)',
        padding: isMobile ? DESIGN_TOKENS.spacingSm : DESIGN_TOKENS.spacingMd,
        borderRadius: DESIGN_TOKENS.radiusMd,
        border: `1px solid rgba(99, 102, 241, 0.2)`,
        display: 'flex',
        alignItems: 'flex-start',
        gap: DESIGN_TOKENS.spacingSm,
        marginBottom: DESIGN_TOKENS.spacingSm,
    };

    const levelsStyles = {
        display: 'flex',
        flexWrap: 'wrap',
        gap: DESIGN_TOKENS.spacingSm,
        fontSize: isMobile ? '0.625rem' : '0.75rem',
    };

    const levelTagStyles = {
        padding: isMobile ? '3px 6px' : '4px 8px',
        backgroundColor: DESIGN_TOKENS.bgSecondary,
        color: DESIGN_TOKENS.textSecondary,
        borderRadius: DESIGN_TOKENS.radiusSm,
        border: `1px solid ${DESIGN_TOKENS.borderColor}`,
    };

    const scoreButtonsStyles = {
        display: 'flex',
        alignItems: 'center',
        gap: isMobile ? '8px' : '10px',
        paddingTop: DESIGN_TOKENS.spacingSm,
    };

    return (
        <div 
            style={cardStyles}
            onMouseEnter={(e) => e.currentTarget.querySelector('.accent-bar').style.opacity = '1'}
            onMouseLeave={(e) => e.currentTarget.querySelector('.accent-bar').style.opacity = '0'}
        >
            <div className="accent-bar" style={accentBarStyles}></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: DESIGN_TOKENS.spacingSm }}>
                <div style={headerStyles}>
                    <span style={{ fontSize: isMobile ? '1.125rem' : '1.25rem' }}>{item.icon}</span>
                    <h4 style={titleStyles}>{item.title}</h4>
                    <span style={badgeStyles}>{item.weight}</span>
                </div>
                
                <p style={descStyles}>{item.desc}</p>
                
                <div style={questionBoxStyles}>
                    <span style={{ color: DESIGN_TOKENS.indigo, marginTop: '2px', fontSize: isMobile ? '0.625rem' : '0.75rem' }}>💬</span>
                    <p style={{ fontSize: isMobile ? '0.6875rem' : '0.75rem', color: DESIGN_TOKENS.textPrimary, fontWeight: 500, lineHeight: '1.4' }}>
                        <span style={{ color: DESIGN_TOKENS.indigo, fontWeight: 700, marginRight: '4px' }}>速问:</span>
                        {item.question}
                    </p>
                </div>
                
                <div style={levelsStyles}>
                    <span style={levelTagStyles}>
                        <strong style={{ color: DESIGN_TOKENS.rose, marginRight: '4px' }}>1分:</strong>
                        {item.levels[1]}
                    </span>
                    <span style={levelTagStyles}>
                        <strong style={{ color: DESIGN_TOKENS.amber, marginRight: '4px' }}>3分:</strong>
                        {item.levels[3]}
                    </span>
                    <span style={levelTagStyles}>
                        <strong style={{ color: DESIGN_TOKENS.emerald, marginRight: '4px' }}>5分:</strong>
                        {item.levels[5]}
                    </span>
                </div>
                
                <div style={scoreButtonsStyles}>
                    {[1, 2, 3, 4, 5].map(i => (
                        <button
                            key={i}
                            onClick={() => onScore(item.id, i)}
                            style={{
                                width: isMobile ? '40px' : '44px',
                                height: isMobile ? '40px' : '44px',
                                borderRadius: '50%',
                                border: score === i ? 'none' : `2px solid ${DESIGN_TOKENS.borderColor}`,
                                backgroundColor: score === i ? DESIGN_TOKENS.indigo : 'transparent',
                                color: score === i ? 'white' : DESIGN_TOKENS.textSecondary,
                                fontWeight: 700,
                                fontSize: isMobile ? '1rem' : '1.125rem',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                minWidth: isMobile ? '44px' : '48px',
                                minHeight: isMobile ? '44px' : '48px',
                            }}
                        >
                            {i}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

function ScenarioAccordions({ isMobile, scenarioScores, onScenarioScore }) {
    const [openIndex, setOpenIndex] = useState(null);

    const accordionStyles = {
        border: `1px solid ${DESIGN_TOKENS.borderColor}`,
        borderRadius: DESIGN_TOKENS.radiusMd,
        overflow: 'hidden',
        backgroundColor: DESIGN_TOKENS.bgSecondary,
    };

    const buttonStyles = {
        width: '100%',
        textAlign: 'left',
        padding: isMobile ? `${DESIGN_TOKENS.spacingMd} ${DESIGN_TOKENS.spacingMd}` : `${DESIGN_TOKENS.spacingMd} ${DESIGN_TOKENS.spacingLg}`,
        backgroundColor: DESIGN_TOKENS.bgCard,
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        transition: 'background-color 0.2s ease',
    };

    const contentStyles = (isOpen) => ({
        maxHeight: isOpen ? '800px' : '0',
        overflow: 'hidden',
        transition: 'max-height 0.3s ease-in-out',
        backgroundColor: DESIGN_TOKENS.bgCard,
    });

    const getScoreColor = (score) => {
        if (score >= 4) return DESIGN_TOKENS.emerald;
        if (score >= 3) return DESIGN_TOKENS.amber;
        if (score > 0) return DESIGN_TOKENS.rose;
        return DESIGN_TOKENS.textMuted;
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? DESIGN_TOKENS.spacingSm : DESIGN_TOKENS.spacingMd }}>
            {SCENARIO_DATA.map((s, idx) => {
                const currentScore = scenarioScores[idx];
                const scoreColor = getScoreColor(currentScore);
                
                return (
                    <div key={idx} style={accordionStyles}>
                        <button
                            onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
                            style={buttonStyles}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = DESIGN_TOKENS.bgSecondary}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = DESIGN_TOKENS.bgCard}
                        >
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: DESIGN_TOKENS.spacingSm }}>
                                    <h3 style={{ fontWeight: 700, color: DESIGN_TOKENS.textPrimary, fontSize: isMobile ? '0.9375rem' : '1.125rem' }}>
                                        {s.title}
                                    </h3>
                                    {currentScore > 0 && (
                                        <span style={{
                                            padding: '2px 8px',
                                            borderRadius: DESIGN_TOKENS.radiusFull,
                                            fontSize: '0.75rem',
                                            fontWeight: 700,
                                            backgroundColor: scoreColor + '20',
                                            color: scoreColor,
                                        }}>
                                            {currentScore}分
                                        </span>
                                    )}
                                </div>
                                <span style={{ fontSize: '0.75rem', color: DESIGN_TOKENS.textMuted, fontWeight: 500 }}>
                                    {s.target}
                                </span>
                            </div>
                            <span style={{
                                color: DESIGN_TOKENS.textMuted,
                                fontSize: isMobile ? '1.25rem' : '1.5rem',
                                transform: openIndex === idx ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 0.3s ease',
                            }}>▾</span>
                        </button>
                        <div style={contentStyles(openIndex === idx)}>
                            <div style={{ padding: isMobile ? `${DESIGN_TOKENS.spacingMd} ${DESIGN_TOKENS.spacingMd}` : `${DESIGN_TOKENS.spacingMd} ${DESIGN_TOKENS.spacingLg}`, borderTop: `1px solid ${DESIGN_TOKENS.bgSecondary}` }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? DESIGN_TOKENS.spacingSm : DESIGN_TOKENS.spacingMd }}>
                                    <div style={{
                                        backgroundColor: DESIGN_TOKENS.bgSecondary,
                                        padding: isMobile ? DESIGN_TOKENS.spacingSm : DESIGN_TOKENS.spacingMd,
                                        borderRadius: DESIGN_TOKENS.radiusMd,
                                        border: `1px solid ${DESIGN_TOKENS.borderColor}`,
                                    }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: DESIGN_TOKENS.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', display: 'block' }}>
                                            面试官提问
                                        </span>
                                        <p style={{ color: DESIGN_TOKENS.textPrimary, fontStyle: 'italic', fontSize: isMobile ? '0.875rem' : '1rem' }}>"{s.q}"</p>
                                    </div>
                                    
                                    {/* 打分区域 */}
                                    <div style={{
                                        backgroundColor: DESIGN_TOKENS.bgSecondary,
                                        padding: isMobile ? DESIGN_TOKENS.spacingSm : DESIGN_TOKENS.spacingMd,
                                        borderRadius: DESIGN_TOKENS.radiusMd,
                                        border: `1px solid ${DESIGN_TOKENS.borderColor}`,
                                    }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: DESIGN_TOKENS.textMuted, marginBottom: DESIGN_TOKENS.spacingSm }}>
                                            场景打分 (1-5分)
                                        </div>
                                        <div style={{ display: 'flex', gap: isMobile ? '8px' : '10px', flexWrap: 'wrap' }}>
                                            {[1, 2, 3, 4, 5].map(score => (
                                                <button
                                                    key={score}
                                                    onClick={() => onScenarioScore(idx, score)}
                                                    style={{
                                                        width: isMobile ? '40px' : '44px',
                                                        height: isMobile ? '40px' : '44px',
                                                        borderRadius: '50%',
                                                        border: currentScore === score ? 'none' : `2px solid ${DESIGN_TOKENS.borderColor}`,
                                                        backgroundColor: currentScore === score ? scoreColor : 'transparent',
                                                        color: currentScore === score ? 'white' : DESIGN_TOKENS.textSecondary,
                                                        fontWeight: 700,
                                                        fontSize: isMobile ? '1rem' : '1.125rem',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s ease',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        minWidth: isMobile ? '44px' : '48px',
                                                        minHeight: isMobile ? '44px' : '48px',
                                                    }}
                                                >
                                                    {score}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? DESIGN_TOKENS.spacingSm : DESIGN_TOKENS.spacingMd }}>
                                        {/* 高分抓手 - 4-5分时高亮 */}
                                        <div style={{
                                            backgroundColor: currentScore >= 4 ? DESIGN_TOKENS.emeraldLight : DESIGN_TOKENS.bgSecondary,
                                            padding: isMobile ? DESIGN_TOKENS.spacingSm : DESIGN_TOKENS.spacingMd,
                                            borderRadius: DESIGN_TOKENS.radiusMd,
                                            border: `1px solid ${currentScore >= 4 ? DESIGN_TOKENS.emerald + '40' : DESIGN_TOKENS.borderColor}`,
                                            flex: 1,
                                            opacity: currentScore === 0 || currentScore >= 3 ? 1 : 0.5,
                                            transition: 'all 0.2s ease',
                                        }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: DESIGN_TOKENS.emerald, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: DESIGN_TOKENS.spacingSm, display: 'block' }}>
                                                高分抓手 (4-5分)
                                            </span>
                                            <ul style={{ display: 'flex', flexDirection: 'column', gap: DESIGN_TOKENS.spacingSm }}>
                                                {s.green.map((g, i) => (
                                                    <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: DESIGN_TOKENS.spacingSm, color: '#065f46', fontSize: isMobile ? '0.8125rem' : '0.875rem' }}>
                                                        <span style={{ color: DESIGN_TOKENS.emerald, marginTop: '2px' }}>🟢</span>
                                                        <span>{g}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                        
                                        {/* 避坑红线 - 1-2分时高亮 */}
                                        <div style={{
                                            backgroundColor: currentScore <= 2 && currentScore > 0 ? DESIGN_TOKENS.roseLight : DESIGN_TOKENS.bgSecondary,
                                            padding: isMobile ? DESIGN_TOKENS.spacingSm : DESIGN_TOKENS.spacingMd,
                                            borderRadius: DESIGN_TOKENS.radiusMd,
                                            border: `1px solid ${currentScore <= 2 && currentScore > 0 ? DESIGN_TOKENS.rose + '40' : DESIGN_TOKENS.borderColor}`,
                                            flex: 1,
                                            opacity: currentScore === 0 || currentScore <= 3 ? 1 : 0.5,
                                            transition: 'all 0.2s ease',
                                        }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: DESIGN_TOKENS.rose, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: DESIGN_TOKENS.spacingSm, display: 'block' }}>
                                                避坑红线 (1-2分)
                                            </span>
                                            <ul style={{ display: 'flex', flexDirection: 'column', gap: DESIGN_TOKENS.spacingSm }}>
                                                {s.red.map((r, i) => (
                                                    <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: DESIGN_TOKENS.spacingSm, color: '#991b1b', fontSize: isMobile ? '0.8125rem' : '0.875rem' }}>
                                                        <span style={{ color: DESIGN_TOKENS.rose, marginTop: '2px' }}>🔴</span>
                                                        <span>{r}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );

}

export default InterviewForm;
