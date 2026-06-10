const baseFields = [
    { key: 'requirementText', label: '具体需求', type: 'textarea', required: true },
    { key: 'referenceAssets', label: '参考样例', type: 'files', required: false },
    { key: 'sizeSpec', label: '尺寸', type: 'text', required: true },
    { key: 'materialSpec', label: '材质', type: 'text', required: true },
    { key: 'dueAt', label: '需求时间', type: 'datetime', required: true },
];

export const EVENT_TYPES = ['marathon', 'trail', 'aquatic', 'orienteering', 'general'];

export const DEFAULT_DESIGN_TEMPLATES = {
    marathon: {
        id: 'default-marathon-core',
        eventType: 'marathon',
        name: '马拉松赛事视觉物料',
        description: '覆盖奖牌、号码布、指示牌、背景板、社媒海报等马拉松常见物料。',
        fields: [
            ...baseFields,
            { key: 'raceSegment', label: '赛事组别', type: 'text', required: false },
            { key: 'brandPlacement', label: '赞助露出要求', type: 'textarea', required: false },
        ],
        samplePayload: {
            title: '完赛奖牌主视觉延展',
            sizeSpec: '海报 1080x1920，背景板 6m x 3m',
            materialSpec: '喷绘布、覆膜贴纸、金属奖牌盒',
        },
        isDefault: true,
    },
    trail: {
        id: 'default-trail-core',
        eventType: 'trail',
        name: '越野赛视觉物料',
        description: '覆盖路线海报、补给点标识、号码布、海拔图、完赛服等越野赛物料。',
        fields: [
            ...baseFields,
            { key: 'distanceGroup', label: '距离组别', type: 'text', required: false },
            { key: 'terrainMood', label: '地形和氛围', type: 'textarea', required: false },
        ],
        samplePayload: {
            title: '50km 组路线视觉',
            sizeSpec: '路线图 A3，补给点立牌 60cm x 90cm',
            materialSpec: '户外写真、KT 板、耐水贴纸',
        },
        isDefault: true,
    },
    aquatic: {
        id: 'default-aquatic-core',
        eventType: 'aquatic',
        name: '水上项目视觉物料',
        description: '覆盖泳道、码头、浮标区、救援指引、证件和领奖区物料。',
        fields: [
            ...baseFields,
            { key: 'waterArea', label: '水域区域', type: 'text', required: false },
            { key: 'safetyNotice', label: '安全提示', type: 'textarea', required: false },
        ],
        samplePayload: {
            title: '公开水域指示系统',
            sizeSpec: '浮标贴 40cm x 20cm，码头指示牌 80cm x 120cm',
            materialSpec: '防水贴、PVC 板、反光膜',
        },
        isDefault: true,
    },
    orienteering: {
        id: 'default-orienteering-core',
        eventType: 'orienteering',
        name: '定向赛视觉物料',
        description: '覆盖打卡点、地图边栏、任务卡、城市活动指引和招商露出。',
        fields: [
            ...baseFields,
            { key: 'checkpointType', label: '点位类型', type: 'text', required: false },
            { key: 'cityStory', label: '城市主题', type: 'textarea', required: false },
        ],
        samplePayload: {
            title: '城市定向赛点位打卡牌',
            sizeSpec: '打卡牌 60cm x 90cm，任务卡 A6',
            materialSpec: '户外写真、亚克力牌、手卡铜版纸',
        },
        isDefault: true,
    },
    general: {
        id: 'default-general-core',
        eventType: 'general',
        name: '通用设计需求',
        description: '适用于未分类赛事和临时设计需求。',
        fields: baseFields,
        samplePayload: {
            title: '通用活动物料',
            sizeSpec: '按实际场景填写',
            materialSpec: '按制作方式填写',
        },
        isDefault: true,
    },
};

export function getDefaultTemplate(eventType = 'general') {
    return DEFAULT_DESIGN_TEMPLATES[eventType] || DEFAULT_DESIGN_TEMPLATES.general;
}

export function listDefaultTemplates(eventType) {
    if (eventType) return [getDefaultTemplate(eventType)];
    return EVENT_TYPES.map((type) => DEFAULT_DESIGN_TEMPLATES[type]);
}
