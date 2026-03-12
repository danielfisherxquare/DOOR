import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import useInterviewStore, { CRITERIA_DATA } from '../../stores/interviewStore';

const COLORS = [
    { bg: 'rgba(79, 70, 229, 0.2)', border: 'rgba(79, 70, 229, 1)', point: 'rgba(79, 70, 229, 1)' },
    { bg: 'rgba(16, 185, 129, 0.2)', border: 'rgba(16, 185, 129, 1)', point: 'rgba(16, 185, 129, 1)' },
    { bg: 'rgba(245, 158, 11, 0.2)', border: 'rgba(245, 158, 11, 1)', point: 'rgba(245, 158, 11, 1)' },
    { bg: 'rgba(239, 68, 68, 0.2)', border: 'rgba(239, 68, 68, 1)', point: 'rgba(239, 68, 68, 1)' },
    { bg: 'rgba(139, 92, 246, 0.2)', border: 'rgba(139, 92, 246, 1)', point: 'rgba(139, 92, 246, 1)' },
];

function InterviewCompare() {
    const { interviews, fetchInterviews } = useInterviewStore();
    const [selectedIds, setSelectedIds] = useState([]);
    const [compareData, setCompareData] = useState([]);
    const chartRef = useRef(null);
    const chartInstance = useRef(null);

    useEffect(() => {
        fetchInterviews();
    }, []);

    useEffect(() => {
        if (selectedIds.length > 0 && chartRef.current && window.Chart) {
            const datasets = compareData.map((interview, idx) => {
                const color = COLORS[idx % COLORS.length];
                const scores = typeof interview.scores === 'string' ? JSON.parse(interview.scores) : interview.scores;
                return {
                    label: interview.candidate_name,
                    data: scores,
                    backgroundColor: color.bg,
                    borderColor: color.border,
                    pointBackgroundColor: color.point,
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
                            pointLabels: { font: { size: 12, weight: '600' }, color: '#57534e' },
                            ticks: { display: false, stepSize: 1 },
                            min: 0,
                            max: 5
                        }
                    },
                    plugins: {
                        legend: { position: 'bottom' }
                    }
                }
            });
        }
    }, [compareData]);

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
        'S': { bg: 'bg-indigo-100', text: 'text-indigo-700' },
        'A': { bg: 'bg-emerald-100', text: 'text-emerald-700' },
        'B': { bg: 'bg-amber-100', text: 'text-amber-700' },
        'C': { bg: 'bg-rose-100', text: 'text-rose-700' },
        '?': { bg: 'bg-stone-100', text: 'text-stone-600' }
    };

    return (
        <div className="interview-compare-page" style={{ minHeight: '100vh', background: '#fafaf9' }}>
            <nav className="bg-white border-b border-stone-200 sticky top-0 z-50 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16 items-center">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">🏅</span>
                            <h1 className="text-xl font-bold text-stone-900 tracking-tight">候选人对比</h1>
                        </div>
                        <div className="flex items-center gap-4 text-sm font-medium">
                            <Link to="/interview" className="text-stone-500 hover:text-indigo-600 transition-colors">新建面试</Link>
                            <Link to="/interview/records" className="text-stone-500 hover:text-indigo-600 transition-colors">面试记录</Link>
                        </div>
                    </div>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-1">
                        <div className="bg-white rounded-xl border border-stone-200 p-5 sticky top-24">
                            <h3 className="font-bold text-lg mb-4 text-stone-800">选择候选人 (最多5人)</h3>
                            <div className="space-y-2 max-h-96 overflow-y-auto">
                                {interviews.map(interview => {
                                    const isSelected = selectedIds.includes(interview.id);
                                    const tier = tierConfig[interview.tier] || tierConfig['?'];
                                    return (
                                        <button
                                            key={interview.id}
                                            onClick={() => handleSelect(interview.id)}
                                            disabled={!isSelected && selectedIds.length >= 5}
                                            className={`w-full text-left p-3 rounded-lg border transition-colors ${
                                                isSelected
                                                    ? 'border-indigo-500 bg-indigo-50'
                                                    : 'border-stone-200 hover:border-indigo-300 hover:bg-stone-50'
                                            } ${!isSelected && selectedIds.length >= 5 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        >
                                            <div className="flex justify-between items-center">
                                                <span className="font-medium text-stone-800">{interview.candidate_name}</span>
                                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${tier.bg} ${tier.text}`}>
                                                    {interview.tier}级
                                                </span>
                                            </div>
                                            <div className="text-sm text-stone-500 mt-1">
                                                {interview.total_score}分 · {interview.interview_date}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-2 space-y-6">
                        {selectedIds.length === 0 ? (
                            <div className="bg-white rounded-xl border border-stone-200 p-12 text-center">
                                <p className="text-stone-500">请在左侧选择候选人进行对比</p>
                            </div>
                        ) : (
                            <>
                                <div className="bg-white rounded-xl border border-stone-200 p-6">
                                    <h3 className="font-bold text-lg mb-4 text-stone-800">能力雷达对比</h3>
                                    <div style={{ height: 400 }}>
                                        <canvas ref={chartRef}></canvas>
                                    </div>
                                </div>

                                <div className="bg-white rounded-xl border border-stone-200 p-6">
                                    <h3 className="font-bold text-lg mb-4 text-stone-800">得分对比</h3>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b border-stone-200">
                                                    <th className="text-left py-3 px-4 font-medium text-stone-500">维度</th>
                                                    {compareData.map((d, idx) => (
                                                        <th key={d.id} className="text-center py-3 px-4 font-medium">
                                                            <span style={{ color: COLORS[idx % COLORS.length].border }}>
                                                                {d.candidate_name}
                                                            </span>
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {CRITERIA_DATA.map((criteria, idx) => (
                                                    <tr key={criteria.id} className="border-b border-stone-100">
                                                        <td className="py-3 px-4 text-stone-700">
                                                            {criteria.icon} {criteria.title}
                                                        </td>
                                                        {compareData.map(d => {
                                                            const scores = typeof d.scores === 'string' ? JSON.parse(d.scores) : d.scores;
                                                            return (
                                                                <td key={d.id} className="text-center py-3 px-4">
                                                                    <span className={`inline-block px-2 py-1 rounded ${
                                                                        scores[idx] >= 4 ? 'bg-emerald-100 text-emerald-700' :
                                                                        scores[idx] >= 3 ? 'bg-amber-100 text-amber-700' :
                                                                        scores[idx] > 0 ? 'bg-rose-100 text-rose-700' : 'bg-stone-100 text-stone-500'
                                                                    }`}>
                                                                        {scores[idx] || '-'}
                                                                    </span>
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                ))}
                                                <tr className="font-bold">
                                                    <td className="py-3 px-4 text-stone-800">总分</td>
                                                    {compareData.map(d => (
                                                        <td key={d.id} className="text-center py-3 px-4 text-indigo-600 text-lg">
                                                            {d.total_score}
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