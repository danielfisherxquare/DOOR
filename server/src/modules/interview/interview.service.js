import InterviewRepository from './interview.repository.js';

const CRITERIA_DATA = [
    { id: 0, type: 'core', title: '视觉基础与导视逻辑' },
    { id: 1, type: 'core', title: '软件效能与自动化' },
    { id: 2, type: 'core', title: '母版输出与海量分发' },
    { id: 3, type: 'core', title: '巨幅物料与材质工艺' },
    { id: 4, type: 'core', title: '长图文高压排版' },
    { id: 5, type: 'core', title: '色彩理论与印前落地' },
    { id: 6, type: 'bonus', title: '实体奖牌与3D表现' },
    { id: 7, type: 'bonus', title: '前沿AI辅助设计' }
];

function calculateTier(scores) {
    if (!scores || scores.every(s => s === 0)) return '?';
    
    let baseScore = 0;
    let bonusScore = 0;
    
    scores.forEach((s, i) => {
        if (CRITERIA_DATA[i].type === 'core') {
            baseScore += s;
        } else {
            bonusScore += s;
        }
    });
    
    const total = baseScore + bonusScore;
    let hasRedLine = false;
    for (let i = 0; i < 6; i++) {
        if (scores[i] > 0 && scores[i] <= 2) hasRedLine = true;
    }
    
    if (total >= 37 && baseScore === 30 && bonusScore >= 7) return 'S';
    if (baseScore >= 24 && !hasRedLine) return 'A';
    if (baseScore >= 18 && baseScore < 24) return 'B';
    return 'C';
}

function calculateTotalScore(scores) {
    return scores ? scores.reduce((sum, s) => sum + (s || 0), 0) : 0;
}

export const InterviewService = {
    async list(options = {}) {
        return InterviewRepository.findAll(options);
    },

    async getById(id) {
        return InterviewRepository.findById(id);
    },

    async create(data) {
        const scores = data.scores || [0, 0, 0, 0, 0, 0, 0, 0];
        const tier = calculateTier(scores);
        const totalScore = calculateTotalScore(scores);
        
        return InterviewRepository.create({
            candidate_name: data.candidate_name,
            interview_date: data.interview_date,
            interviewer: data.interviewer,
            scores: JSON.stringify(scores),
            total_score: totalScore,
            tier,
            notes: data.notes
        });
    },

    async update(id, data) {
        const updateData = { ...data };
        
        if (data.scores) {
            updateData.scores = JSON.stringify(data.scores);
            updateData.tier = calculateTier(data.scores);
            updateData.total_score = calculateTotalScore(data.scores);
        }
        
        return InterviewRepository.update(id, updateData);
    },

    async delete(id) {
        return InterviewRepository.delete(id);
    },

    async compare(ids) {
        return InterviewRepository.findByIds(ids);
    },

    getCriteriaData() {
        return CRITERIA_DATA;
    }
};

export default InterviewService;