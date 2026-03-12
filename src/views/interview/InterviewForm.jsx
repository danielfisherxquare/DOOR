import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import useInterviewStore, { CRITERIA_DATA, SCENARIO_DATA } from '../../stores/interviewStore';

function InterviewForm() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const editId = searchParams.get('edit');
    const chartRef = useRef(null);
    const chartInstance = useRef(null);

    const {
        scores, candidateName, interviewDate, interviewer, notes, editingId, isLoading,
        setScore, setCandidateName, setInterviewDate, setInterviewer, setNotes,
        getTier, getTotalScore, getBaseScore, getBonusScore,
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
                            backgroundColor: 'rgba(79, 70, 229, 0.2)',
                            borderColor: 'rgba(79, 70, 229, 1)',
                            pointBackgroundColor: 'rgba(79, 70, 229, 1)',
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
                                pointLabels: { font: { size: 11, weight: '600' }, color: '#57534e' },
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
    }, [scores]);

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

    const tierConfig = {
        '?': { bg: 'bg-stone-50', border: 'border-stone-200', badge: 'bg-stone-200', text: 'text-stone-600', title: '等待评估' },
        'S': { bg: 'bg-indigo-50', border: 'border-indigo-200', badge: 'bg-indigo-600', text: 'text-indigo-900', title: 'S级 - 强烈推荐录用' },
        'A': { bg: 'bg-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-500', text: 'text-emerald-900', title: 'A级 - 建议录用' },
        'B': { bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-500', text: 'text-amber-900', title: 'B级 - 作为备选' },
        'C': { bg: 'bg-rose-50', border: 'border-rose-200', badge: 'bg-rose-500', text: 'text-rose-900', title: 'C级 - 建议淘汰' }
    };

    const currentTier = tierConfig[tier];

    return (
        <div className="interview-form">
            <style>{`
                .interview-form { min-height: 100vh; background: #fafaf9; }
                .interview-form .score-btn { transition: all 0.2s ease-in-out; }
                .interview-form .accordion-content { transition: max-height 0.3s ease-in-out; max-height: 0; overflow: hidden; }
                .interview-form .accordion-content.open { max-height: 500px; }
            `}</style>

            <nav className="bg-white border-b border-stone-200 sticky top-0 z-50 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16 items-center">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">🏅</span>
                            <h1 className="text-xl font-bold text-stone-900 tracking-tight">平面设计师评估系统</h1>
                        </div>
                        <div className="flex items-center gap-4 text-sm font-medium">
                            <Link to="/interview/records" className="text-stone-500 hover:text-indigo-600 transition-colors">面试记录</Link>
                            <Link to="/interview/compare" className="text-stone-500 hover:text-indigo-600 transition-colors">候选人对比</Link>
                        </div>
                    </div>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
                <header className="bg-white rounded-2xl p-6 shadow-sm border border-stone-200">
                    <h2 className="text-lg font-bold mb-4 text-stone-800">基本信息</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-stone-500 mb-1">候选人姓名 *</label>
                            <input
                                type="text"
                                value={candidateName}
                                onChange={e => setCandidateName(e.target.value)}
                                placeholder="输入姓名..."
                                className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-stone-500 mb-1">面试日期 *</label>
                            <input
                                type="date"
                                value={interviewDate}
                                onChange={e => setInterviewDate(e.target.value)}
                                className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-stone-500 mb-1">面试官</label>
                            <input
                                type="text"
                                value={interviewer}
                                onChange={e => setInterviewer(e.target.value)}
                                placeholder="您的名字..."
                                className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                            />
                        </div>
                    </div>
                    <p className="mt-4 text-sm text-stone-500 bg-stone-50 p-3 rounded-lg border border-stone-100">
                        💡 <strong>评估说明：</strong> 可直接阅读打分板上的 <strong>【速问】</strong> 对候选人进行摸底提问，并参考下方的分数判定标准进行快速打分。底部"实战场景提问指南"可用于深度抗压考察。
                    </p>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-7 xl:col-span-8 space-y-6">
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="text-xl font-bold text-stone-800">专业技能打分板 (1-5分)</h2>
                        </div>

                        <div className="space-y-4">
                            {CRITERIA_DATA.filter(c => c.type === 'core').map(item => (
                                <CriteriaCard key={item.id} item={item} score={scores[item.id]} onScore={setScore} />
                            ))}
                        </div>

                        <h3 className="text-lg font-bold text-stone-800 pt-6 border-t border-stone-200 mt-8 mb-4">高阶加分项</h3>
                        <div className="space-y-4">
                            {CRITERIA_DATA.filter(c => c.type === 'bonus').map(item => (
                                <CriteriaCard key={item.id} item={item} score={scores[item.id]} onScore={setScore} />
                            ))}
                        </div>

                        <div className="bg-white rounded-xl p-4 border border-stone-200">
                            <label className="block text-sm font-medium text-stone-500 mb-2">备注</label>
                            <textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                placeholder="其他备注信息..."
                                rows={3}
                                className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none"
                            />
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={handleSave}
                                disabled={isLoading}
                                className="flex-1 py-3 px-6 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                            >
                                {isLoading ? '保存中...' : (editingId ? '更新面试记录' : '保存面试记录')}
                            </button>
                            <button
                                onClick={resetForm}
                                className="py-3 px-6 bg-stone-100 text-stone-700 font-medium rounded-lg hover:bg-stone-200 transition-colors"
                            >
                                重置
                            </button>
                        </div>
                    </div>

                    <div className="lg:col-span-5 xl:col-span-4">
                        <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6 sticky top-24">
                            <h3 className="text-lg font-bold text-stone-800 mb-6 border-b border-stone-100 pb-2">能力雷达模型</h3>

                            <div className="relative w-full" style={{ height: 300 }}>
                                <canvas ref={chartRef}></canvas>
                            </div>

                            <div className="mt-8 pt-6 border-t border-stone-100">
                                <div className="flex justify-between items-end mb-2">
                                    <span className="text-sm font-medium text-stone-500">总分 / 40</span>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-4xl font-extrabold text-indigo-600 tracking-tight">{totalScore}</span>
                                        <span className="text-stone-400 font-medium">分</span>
                                    </div>
                                </div>
                                <div className="flex justify-between text-xs text-stone-400 mb-6">
                                    <span>基础: {baseScore}/30</span>
                                    <span>加分: {bonusScore}/10</span>
                                </div>

                                <div className={`rounded-xl p-5 border transition-colors duration-300 ${currentTier.bg} ${currentTier.border}`}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full ${currentTier.badge} text-white font-bold text-lg`}>{tier}</span>
                                        <h4 className={`font-bold ${currentTier.text}`}>{currentTier.title}</h4>
                                    </div>
                                    <p className="text-sm text-stone-600 leading-relaxed mt-2">
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

                <section className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6 lg:p-8 mt-12">
                    <div className="mb-8">
                        <h2 className="text-2xl font-bold text-stone-800 mb-2">深度实战场景提问 (防忽悠专用)</h2>
                        <p className="text-stone-500">当无法通过速问准确判断候选人水平时，抛出以下极限抗压场景，快速识破落地经验。</p>
                    </div>
                    <ScenarioAccordions />
                </section>
            </main>

            <footer className="bg-stone-900 text-stone-400 py-8 text-center mt-12">
                <p className="text-sm">体育赛事公司内部用表 · 数字化互动打分系统</p>
            </footer>
        </div>
    );
}

function CriteriaCard({ item, score, onScore }) {
    return (
        <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
            <div className={`absolute top-0 left-0 w-1 h-full ${item.type === 'core' ? 'bg-indigo-500' : 'bg-amber-500'} opacity-0 group-hover:opacity-100 transition-opacity`}></div>
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5">
                <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">{item.icon}</span>
                        <h4 className="font-bold text-stone-800">{item.title}</h4>
                        <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md font-semibold ${item.type === 'core' ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-700'}`}>
                            {item.weight}
                        </span>
                    </div>
                    <p className="text-sm text-stone-500 leading-relaxed">{item.desc}</p>
                    <div className="bg-indigo-50/40 p-3 rounded-lg border border-indigo-100/50 flex items-start gap-2">
                        <span className="text-indigo-400 mt-0.5 text-xs">💬</span>
                        <p className="text-xs text-stone-700 font-medium leading-relaxed">
                            <span className="text-indigo-600 font-bold mr-1">速问:</span>{item.question}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[10px] mt-2">
                        <span className="px-2 py-1 bg-stone-50 text-stone-600 rounded border border-stone-200">
                            <strong className="text-rose-500 mr-1">1分:</strong>{item.levels[1]}
                        </span>
                        <span className="px-2 py-1 bg-stone-50 text-stone-600 rounded border border-stone-200">
                            <strong className="text-amber-500 mr-1">3分:</strong>{item.levels[3]}
                        </span>
                        <span className="px-2 py-1 bg-stone-50 text-stone-600 rounded border border-stone-200">
                            <strong className="text-emerald-500 mr-1">5分:</strong>{item.levels[5]}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 pt-2 sm:pt-0">
                    {[1, 2, 3, 4, 5].map(i => (
                        <button
                            key={i}
                            onClick={() => onScore(item.id, i)}
                            className={`score-btn w-10 h-10 rounded-lg border font-medium focus:outline-none flex items-center justify-center shrink-0 ${
                                score === i
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-inner'
                                    : 'border-stone-200 text-stone-600 hover:border-indigo-500 hover:text-indigo-600'
                            }`}
                        >
                            {i}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

function ScenarioAccordions() {
    const [openIndex, setOpenIndex] = useState(null);

    return (
        <div className="space-y-4">
            {SCENARIO_DATA.map((s, idx) => (
                <div key={idx} className="border border-stone-200 rounded-xl overflow-hidden bg-stone-50/50">
                    <button
                        onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
                        className="w-full text-left px-6 py-4 bg-white hover:bg-stone-50 transition-colors focus:outline-none flex justify-between items-center"
                    >
                        <div>
                            <h3 className="font-bold text-stone-800 text-lg">{s.title}</h3>
                            <span className="text-xs text-stone-500 font-medium">{s.target}</span>
                        </div>
                        <span className={`text-stone-400 text-2xl transform transition-transform ${openIndex === idx ? 'rotate-180' : ''}`}>▾</span>
                    </button>
                    <div className={`accordion-content bg-white px-6 ${openIndex === idx ? 'open' : ''}`}>
                        <div className="py-4 border-t border-stone-100 space-y-4">
                            <div className="bg-stone-100/70 p-4 rounded-lg border border-stone-200">
                                <span className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1 block">面试官提问</span>
                                <p className="text-stone-800 italic">"{s.q}"</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-100">
                                    <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2 block">高分抓手 (4-5分)</span>
                                    <ul className="space-y-2">
                                        {s.green.map((g, i) => (
                                            <li key={i} className="flex items-start gap-2 text-emerald-700 text-sm">
                                                <span className="mt-0.5 text-emerald-500">🟢</span>
                                                <span>{g}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="bg-rose-50 p-4 rounded-lg border border-rose-100">
                                    <span className="text-xs font-bold text-rose-600 uppercase tracking-wider mb-2 block">避坑红线 (1-2分)</span>
                                    <ul className="space-y-2">
                                        {s.red.map((r, i) => (
                                            <li key={i} className="flex items-start gap-2 text-rose-700 text-sm">
                                                <span className="mt-0.5 text-rose-500">🔴</span>
                                                <span>{r}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

export default InterviewForm;