import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useInterviewStore from '../../stores/interviewStore';

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

// 响应式断点
const BREAKPOINTS = {
  mobile: 640,
  tablet: 1024,
  desktop: 1280,
};

function InterviewList() {
    const navigate = useNavigate();
    const { interviews, isLoading, fetchInterviews, deleteInterview } = useInterviewStore();
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);

    useEffect(() => {
        fetchInterviews();
    }, []);

    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const isMobile = windowWidth < BREAKPOINTS.mobile;
    const isTablet = windowWidth >= BREAKPOINTS.mobile && windowWidth < BREAKPOINTS.tablet;

    const handleDelete = async (id) => {
        const result = await deleteInterview(id);
        if (result.success) {
            setDeleteConfirm(null);
        } else {
            alert(result.error || '删除失败');
        }
    };

    const tierConfig = {
        'S': { bg: DESIGN_TOKENS.indigoLight, text: '#3730a3', label: 'S级', color: DESIGN_TOKENS.indigo },
        'A': { bg: DESIGN_TOKENS.emeraldLight, text: '#065f46', label: 'A级', color: DESIGN_TOKENS.emerald },
        'B': { bg: DESIGN_TOKENS.amberLight, text: '#92400e', label: 'B级', color: DESIGN_TOKENS.amber },
        'C': { bg: DESIGN_TOKENS.roseLight, text: '#991b1b', label: 'C级', color: DESIGN_TOKENS.rose },
        '?': { bg: DESIGN_TOKENS.stoneLight, text: DESIGN_TOKENS.stone, label: '待评', color: DESIGN_TOKENS.stone }
    };

    const getGridColumns = () => {
        if (isMobile) return '1fr';
        if (isTablet) return 'repeat(2, 1fr)';
        return 'repeat(3, 1fr)';
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
        header: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: isMobile ? DESIGN_TOKENS.spacingMd : DESIGN_TOKENS.spacingLg,
            flexDirection: isMobile ? 'column' : 'row',
            gap: isMobile ? DESIGN_TOKENS.spacingSm : '0',
        },
        title: {
            fontSize: isMobile ? '1.25rem' : '1.5rem',
            fontWeight: 700,
            color: DESIGN_TOKENS.textPrimary,
        },
        newButton: {
            padding: isMobile ? '0.5rem 1rem' : '0.625rem 1.25rem',
            backgroundColor: DESIGN_TOKENS.indigo,
            color: 'white',
            fontWeight: 600,
            fontSize: isMobile ? '0.875rem' : '0.9375rem',
            borderRadius: DESIGN_TOKENS.radiusMd,
            border: 'none',
            cursor: 'pointer',
            textDecoration: 'none',
            transition: 'all 0.2s ease',
            width: isMobile ? '100%' : 'auto',
            textAlign: 'center',
        },
        grid: {
            display: 'grid',
            gridTemplateColumns: getGridColumns(),
            gap: isMobile ? DESIGN_TOKENS.spacingMd : DESIGN_TOKENS.spacingLg,
        },
        card: {
            backgroundColor: DESIGN_TOKENS.bgCard,
            borderRadius: DESIGN_TOKENS.radiusMd,
            border: `1px solid ${DESIGN_TOKENS.borderColor}`,
            boxShadow: DESIGN_TOKENS.shadowSm,
            overflow: 'hidden',
            transition: 'all 0.2s ease',
        },
        cardContent: {
            padding: isMobile ? DESIGN_TOKENS.spacingMd : DESIGN_TOKENS.spacingLg,
        },
        cardHeader: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: isMobile ? DESIGN_TOKENS.spacingSm : DESIGN_TOKENS.spacingMd,
            flexDirection: isMobile ? 'column' : 'row',
            gap: isMobile ? DESIGN_TOKENS.spacingSm : '0',
        },
        candidateName: {
            fontSize: isMobile ? '1rem' : '1.125rem',
            fontWeight: 700,
            color: DESIGN_TOKENS.textPrimary,
            marginBottom: '4px',
        },
        interviewDate: {
            fontSize: '0.875rem',
            color: DESIGN_TOKENS.textSecondary,
        },
        tierBadge: (tier) => ({
            padding: '4px 12px',
            borderRadius: DESIGN_TOKENS.radiusFull,
            fontSize: '0.875rem',
            fontWeight: 600,
            backgroundColor: tierConfig[tier]?.bg || tierConfig['?'].bg,
            color: tierConfig[tier]?.text || tierConfig['?'].text,
            alignSelf: isMobile ? 'flex-start' : 'auto',
        }),
        scoreSection: {
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? DESIGN_TOKENS.spacingMd : DESIGN_TOKENS.spacingLg,
            marginBottom: isMobile ? DESIGN_TOKENS.spacingMd : DESIGN_TOKENS.spacingLg,
        },
        scoreBox: {
            textAlign: 'center',
        },
        scoreValue: {
            fontSize: isMobile ? '1.5rem' : '1.75rem',
            fontWeight: 700,
            color: DESIGN_TOKENS.indigo,
        },
        scoreLabel: {
            fontSize: '0.75rem',
            color: DESIGN_TOKENS.textMuted,
        },
        interviewer: {
            fontSize: '0.875rem',
            color: DESIGN_TOKENS.textSecondary,
        },
        actions: {
            display: 'flex',
            gap: DESIGN_TOKENS.spacingSm,
        },
        editButton: {
            flex: 1,
            padding: isMobile ? '0.625rem' : '0.5rem 0.75rem',
            fontSize: isMobile ? '0.9375rem' : '0.875rem',
            fontWeight: 500,
            backgroundColor: DESIGN_TOKENS.bgSecondary,
            color: DESIGN_TOKENS.textSecondary,
            borderRadius: DESIGN_TOKENS.radiusMd,
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            minHeight: isMobile ? '44px' : 'auto',
        },
        deleteButton: {
            padding: isMobile ? '0.625rem' : '0.5rem 0.75rem',
            fontSize: isMobile ? '0.9375rem' : '0.875rem',
            fontWeight: 500,
            backgroundColor: DESIGN_TOKENS.roseLight,
            color: DESIGN_TOKENS.rose,
            borderRadius: DESIGN_TOKENS.radiusMd,
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            minHeight: isMobile ? '44px' : 'auto',
        },
        emptyState: {
            textAlign: 'center',
            padding: `${isMobile ? DESIGN_TOKENS.spacingXl : DESIGN_TOKENS.spacing2xl} 0`,
            color: DESIGN_TOKENS.textSecondary,
        },
        loadingState: {
            textAlign: 'center',
            padding: `${isMobile ? DESIGN_TOKENS.spacingXl : DESIGN_TOKENS.spacing2xl} 0`,
            color: DESIGN_TOKENS.textSecondary,
        },
        modal: {
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: isMobile ? DESIGN_TOKENS.spacingMd : '0',
        },
        modalContent: {
            backgroundColor: DESIGN_TOKENS.bgCard,
            borderRadius: DESIGN_TOKENS.radiusLg,
            padding: isMobile ? DESIGN_TOKENS.spacingLg : DESIGN_TOKENS.spacingXl,
            maxWidth: '400px',
            width: isMobile ? '100%' : '90%',
            boxShadow: DESIGN_TOKENS.shadowMd,
        },
        modalTitle: {
            fontSize: isMobile ? '1.125rem' : '1.25rem',
            fontWeight: 700,
            marginBottom: DESIGN_TOKENS.spacingMd,
            color: DESIGN_TOKENS.textPrimary,
        },
        modalText: {
            fontSize: isMobile ? '0.875rem' : '1rem',
            color: DESIGN_TOKENS.textSecondary,
            marginBottom: DESIGN_TOKENS.spacingLg,
        },
        modalActions: {
            display: 'flex',
            gap: DESIGN_TOKENS.spacingMd,
        },
        cancelButton: {
            flex: 1,
            padding: isMobile ? '0.75rem' : '0.75rem 1rem',
            backgroundColor: DESIGN_TOKENS.bgSecondary,
            color: DESIGN_TOKENS.textSecondary,
            fontWeight: 600,
            borderRadius: DESIGN_TOKENS.radiusMd,
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            fontSize: isMobile ? '0.9375rem' : '1rem',
            minHeight: isMobile ? '48px' : 'auto',
        },
        confirmButton: {
            flex: 1,
            padding: isMobile ? '0.75rem' : '0.75rem 1rem',
            backgroundColor: DESIGN_TOKENS.rose,
            color: 'white',
            fontWeight: 600,
            borderRadius: DESIGN_TOKENS.radiusMd,
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            fontSize: isMobile ? '0.9375rem' : '1rem',
            minHeight: isMobile ? '48px' : 'auto',
        },
    };

    return (
        <div style={styles.container}>
            <nav style={styles.nav}>
                <div style={styles.navInner}>
                    <div style={styles.navBrand}>
                        <span style={{ fontSize: isMobile ? '1.25rem' : '1.5rem' }}>🏅</span>
                        <h1 style={styles.navTitle}>面试记录管理</h1>
                    </div>
                    <div style={styles.navLinks}>
                        <Link to="/interview" style={styles.navLink}>新建面试</Link>
                        <Link to="/interview/compare" style={styles.navLink}>候选人对比</Link>
                    </div>
                </div>
            </nav>

            <main style={styles.main}>
                <div style={styles.header}>
                    <h2 style={styles.title}>面试记录 ({interviews.length})</h2>
                    <Link to="/interview" style={styles.newButton}>
                        + 新建面试
                    </Link>
                </div>

                {isLoading ? (
                    <div style={styles.loadingState}>加载中...</div>
                ) : interviews.length === 0 ? (
                    <div style={styles.emptyState}>
                        <p style={{ marginBottom: DESIGN_TOKENS.spacingMd }}>暂无面试记录</p>
                        <Link to="/interview" style={{ color: DESIGN_TOKENS.indigo, textDecoration: 'none' }}>
                            创建第一条记录
                        </Link>
                    </div>
                ) : (
                    <div style={styles.grid}>
                        {interviews.map(interview => {
                            const tier = tierConfig[interview.tier] || tierConfig['?'];
                            return (
                                <div 
                                    key={interview.id} 
                                    style={styles.card}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.boxShadow = DESIGN_TOKENS.shadowMd;
                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.boxShadow = DESIGN_TOKENS.shadowSm;
                                        e.currentTarget.style.transform = 'translateY(0)';
                                    }}
                                >
                                    <div style={styles.cardContent}>
                                        <div style={styles.cardHeader}>
                                            <div>
                                                <h3 style={styles.candidateName}>{interview.candidate_name}</h3>
                                                <p style={styles.interviewDate}>{interview.interview_date}</p>
                                            </div>
                                            <span style={styles.tierBadge(interview.tier)}>
                                                {tier.label}
                                            </span>
                                        </div>

                                        <div style={styles.scoreSection}>
                                            <div style={styles.scoreBox}>
                                                <p style={styles.scoreValue}>{interview.total_score}</p>
                                                <p style={styles.scoreLabel}>总分/40</p>
                                            </div>
                                            {interview.interviewer && (
                                                <p style={styles.interviewer}>
                                                    面试官: {interview.interviewer}
                                                </p>
                                            )}
                                        </div>

                                        <div style={styles.actions}>
                                            <button
                                                onClick={() => navigate(`/interview?edit=${interview.id}`)}
                                                style={styles.editButton}
                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e5e7eb'}
                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = DESIGN_TOKENS.bgSecondary}
                                            >
                                                编辑
                                            </button>
                                            <button
                                                onClick={() => setDeleteConfirm(interview.id)}
                                                style={styles.deleteButton}
                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fecaca'}
                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = DESIGN_TOKENS.roseLight}
                                            >
                                                删除
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>

            {deleteConfirm && (
                <div style={styles.modal} onClick={() => setDeleteConfirm(null)}>
                    <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                        <h3 style={styles.modalTitle}>确认删除</h3>
                        <p style={styles.modalText}>确定要删除这条面试记录吗？此操作不可恢复。</p>
                        <div style={styles.modalActions}>
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                style={styles.cancelButton}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e5e7eb'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = DESIGN_TOKENS.bgSecondary}
                            >
                                取消
                            </button>
                            <button
                                onClick={() => handleDelete(deleteConfirm)}
                                style={styles.confirmButton}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = DESIGN_TOKENS.rose}
                            >
                                删除
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default InterviewList;
