import { CRITERIA_DATA } from '../../stores/interviewStore'

export const TIER_META = {
  '?': {
    label: '待评估',
    title: '等待评分',
    description: '先完成核心维度和场景压测，系统会自动生成推荐评级。',
    tone: 'neutral',
  },
  S: {
    label: 'S级',
    title: '强烈推荐录用',
    description: '核心能力、场景应对和工程化意识都稳定，适合直接承担高压交付。',
    tone: 'elite',
  },
  A: {
    label: 'A级',
    title: '建议录用',
    description: '基础能力完整，可直接进入业务实战，但仍有少量提升空间。',
    tone: 'positive',
  },
  B: {
    label: 'B级',
    title: '保留观察',
    description: '具备一定专业基础，但大型赛事物料和抗压场景仍需强化训练。',
    tone: 'warning',
  },
  C: {
    label: 'C级',
    title: '谨慎考虑',
    description: '当前存在明显短板或工程化风险，进入正式交付前需要大量辅导。',
    tone: 'danger',
  },
}

export const COMPARE_SWATCHES = [
  { border: '#2563eb', bg: 'rgba(37, 99, 235, 0.14)' },
  { border: '#059669', bg: 'rgba(5, 150, 105, 0.14)' },
  { border: '#d97706', bg: 'rgba(217, 119, 6, 0.14)' },
  { border: '#dc2626', bg: 'rgba(220, 38, 38, 0.14)' },
  { border: '#7c3aed', bg: 'rgba(124, 58, 237, 0.14)' },
]

export function getTierMeta(tier) {
  return TIER_META[tier] || TIER_META['?']
}

export function parseScoreArray(value, fallback = []) {
  if (Array.isArray(value)) return value

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : fallback
    } catch {
      return fallback
    }
  }

  return fallback
}

export function summarizeInterview(interview) {
  const scores = parseScoreArray(interview?.scores, new Array(CRITERIA_DATA.length).fill(0))
  const scenarioScores = parseScoreArray(interview?.scenario_scores, [0, 0, 0, 0])

  const baseScore = scores.reduce((sum, value, index) => (
    sum + (CRITERIA_DATA[index]?.type === 'core' ? Number(value || 0) : 0)
  ), 0)

  const bonusScore = scores.reduce((sum, value, index) => (
    sum + (CRITERIA_DATA[index]?.type === 'bonus' ? Number(value || 0) : 0)
  ), 0)

  const primaryTotal = Number(
    interview?.total_score ?? scores.reduce((sum, value) => sum + Number(value || 0), 0),
  )
  const scenarioTotal = scenarioScores.reduce((sum, value) => sum + Number(value || 0), 0)

  return {
    scores,
    scenarioScores,
    baseScore,
    bonusScore,
    primaryTotal,
    scenarioTotal,
    grandTotal: primaryTotal + scenarioTotal,
    tierMeta: getTierMeta(interview?.tier),
  }
}

export function getScoreTone(score) {
  if (score >= 4) return 'positive'
  if (score >= 3) return 'warning'
  if (score > 0) return 'danger'
  return 'neutral'
}

export function average(values) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length
}
