import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useInterviewStore from '../../stores/interviewStore';

function InterviewList() {
    const navigate = useNavigate();
    const { interviews, isLoading, fetchInterviews, deleteInterview } = useInterviewStore();
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    useEffect(() => {
        fetchInterviews();
    }, []);

    const handleDelete = async (id) => {
        const result = await deleteInterview(id);
        if (result.success) {
            setDeleteConfirm(null);
        } else {
            alert(result.error || '删除失败');
        }
    };

    const tierConfig = {
        'S': { bg: 'bg-indigo-100', text: 'text-indigo-700', label: 'S级' },
        'A': { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'A级' },
        'B': { bg: 'bg-amber-100', text: 'text-amber-700', label: 'B级' },
        'C': { bg: 'bg-rose-100', text: 'text-rose-700', label: 'C级' },
        '?': { bg: 'bg-stone-100', text: 'text-stone-600', label: '待评' }
    };

    return (
        <div className="interview-list-page" style={{ minHeight: '100vh', background: '#fafaf9' }}>
            <nav className="bg-white border-b border-stone-200 sticky top-0 z-50 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16 items-center">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">🏅</span>
                            <h1 className="text-xl font-bold text-stone-900 tracking-tight">面试记录管理</h1>
                        </div>
                        <div className="flex items-center gap-4 text-sm font-medium">
                            <Link to="/interview" className="text-stone-500 hover:text-indigo-600 transition-colors">新建面试</Link>
                            <Link to="/interview/compare" className="text-stone-500 hover:text-indigo-600 transition-colors">候选人对比</Link>
                        </div>
                    </div>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-stone-800">面试记录 ({interviews.length})</h2>
                    <Link
                        to="/interview"
                        className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                        + 新建面试
                    </Link>
                </div>

                {isLoading ? (
                    <div className="text-center py-12 text-stone-500">加载中...</div>
                ) : interviews.length === 0 ? (
                    <div className="text-center py-12 text-stone-500">
                        <p className="mb-4">暂无面试记录</p>
                        <Link to="/interview" className="text-indigo-600 hover:underline">创建第一条记录</Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {interviews.map(interview => {
                            const tier = tierConfig[interview.tier] || tierConfig['?'];
                            return (
                                <div key={interview.id} className="bg-white rounded-xl border border-stone-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                                    <div className="p-5">
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <h3 className="font-bold text-lg text-stone-800">{interview.candidate_name}</h3>
                                                <p className="text-sm text-stone-500">{interview.interview_date}</p>
                                            </div>
                                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${tier.bg} ${tier.text}`}>
                                                {tier.label}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-4 mb-4">
                                            <div className="text-center">
                                                <p className="text-2xl font-bold text-indigo-600">{interview.total_score}</p>
                                                <p className="text-xs text-stone-400">总分/40</p>
                                            </div>
                                            {interview.interviewer && (
                                                <div className="text-sm text-stone-500">
                                                    面试官: {interview.interviewer}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => navigate(`/interview?edit=${interview.id}`)}
                                                className="flex-1 py-2 px-3 text-sm bg-stone-100 text-stone-700 rounded-lg hover:bg-stone-200 transition-colors"
                                            >
                                                编辑
                                            </button>
                                            <button
                                                onClick={() => setDeleteConfirm(interview.id)}
                                                className="py-2 px-3 text-sm bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 transition-colors"
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
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4">
                        <h3 className="font-bold text-lg mb-2">确认删除</h3>
                        <p className="text-stone-600 mb-4">确定要删除这条面试记录吗？此操作不可恢复。</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="flex-1 py-2 bg-stone-100 text-stone-700 rounded-lg hover:bg-stone-200 transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={() => handleDelete(deleteConfirm)}
                                className="flex-1 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors"
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