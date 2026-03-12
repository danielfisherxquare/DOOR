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

function normalizeScores(scores) {
    if (!Array.isArray(scores) || scores.length === 0) {
        return [0, 0, 0, 0, 0, 0, 0, 0];
    }

    return scores.map((score) => Number(score) || 0);
}

function normalizeScenarioScores(scenarioScores) {
    if (!Array.isArray(scenarioScores) || scenarioScores.length === 0) {
        return [0, 0, 0, 0];
    }

    return scenarioScores.map((score) => Number(score) || 0);
}

function calculateTier(scores, scenarioScores = [0, 0, 0, 0]) {
    if (!scores || scores.every((score) => score === 0)) return '?';

    let baseScore = 0;
    let bonusScore = 0;
    const scenarioTotal = scenarioScores.reduce((sum, score) => sum + (score || 0), 0);

    scores.forEach((score, index) => {
        if (CRITERIA_DATA[index].type === 'core') {
            baseScore += score;
        } else {
            bonusScore += score;
        }
    });

    const eightDimTotal = baseScore + bonusScore;
    const grandTotal = eightDimTotal + scenarioTotal;

    if (grandTotal >= 50 && eightDimTotal >= 35 && scenarioTotal >= 12) return 'S';
    if (grandTotal >= 40 && eightDimTotal >= 28 && scenarioTotal >= 10) return 'A';
    if (grandTotal >= 30 && eightDimTotal >= 21 && scenarioTotal >= 7) return 'B';
    if (grandTotal > 0) return 'C';
    return '?';
}

function calculateTotalScore(scores, scenarioScores = [0, 0, 0, 0]) {
    const scoreTotal = scores ? scores.reduce((sum, score) => sum + (score || 0), 0) : 0;
    const scenarioTotal = scenarioScores ? scenarioScores.reduce((sum, score) => sum + (score || 0), 0) : 0;
    return scoreTotal + scenarioTotal;
}

function normalizeStoredJson(value, fallback) {
    if (Array.isArray(value)) {
        return value;
    }

    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : fallback;
        } catch {
            return fallback;
        }
    }

    return fallback;
}

export const InterviewService = {
    async list(options = {}) {
        return InterviewRepository.findAll(options);
    },

    async getById(id) {
        return InterviewRepository.findById(id);
    },

    async create(data) {
        const scores = normalizeScores(data.scores);
        const scenarioScores = normalizeScenarioScores(data.scenario_scores);
        const tier = calculateTier(scores, scenarioScores);
        const totalScore = calculateTotalScore(scores, scenarioScores);

        return InterviewRepository.create({
            candidate_name: data.candidate_name,
            interview_date: data.interview_date,
            interviewer: data.interviewer,
            scores: JSON.stringify(scores),
            scenario_scores: JSON.stringify(scenarioScores),
            total_score: totalScore,
            tier,
            notes: data.notes
        });
    },

    async update(id, data) {
        const existing = await InterviewRepository.findById(id);
        if (!existing) {
            return null;
        }

        const updateData = { ...data };
        const scores = data.scores
            ? normalizeScores(data.scores)
            : normalizeScores(normalizeStoredJson(existing.scores, [0, 0, 0, 0, 0, 0, 0, 0]));
        const scenarioScores = data.scenario_scores
            ? normalizeScenarioScores(data.scenario_scores)
            : normalizeScenarioScores(normalizeStoredJson(existing.scenario_scores, [0, 0, 0, 0]));

        if (data.scores) {
            updateData.scores = JSON.stringify(scores);
        }

        if (data.scenario_scores) {
            updateData.scenario_scores = JSON.stringify(scenarioScores);
        }

        if (data.scores || data.scenario_scores) {
            updateData.tier = calculateTier(scores, scenarioScores);
            updateData.total_score = calculateTotalScore(scores, scenarioScores);
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
