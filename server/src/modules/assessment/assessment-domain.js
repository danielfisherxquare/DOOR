const DEFAULT_TEMPLATE_ITEMS = [
    {
        id: 'skill',
        title: '业务技能与专业度',
        description: '个人硬技能扎实，能熟练操作负责的设备或精准提供对应服务，无低级业务失误。',
        weight: 1,
        scoreMin: 0,
        scoreMax: 10,
        required: true,
    },
    {
        id: 'quality',
        title: '工作质量与完成度',
        description: '负责的具体工作按质、按量完成，交付结果达到赛事标准，无明显偷工减料或敷衍。',
        weight: 1,
        scoreMin: 0,
        scoreMax: 10,
        required: true,
    },
    {
        id: 'schedule',
        title: '进度把控与履约',
        description: '个人动作迅速，进场、彩排、正赛、撤场等环节严守时间节点，不拖团队后腿。',
        weight: 1,
        scoreMin: 0,
        scoreMax: 10,
        required: true,
    },
    {
        id: 'coordination',
        title: '协同配合与大局观',
        description: '与团队内外部人员顺畅对接，互相补位，服从现场统一调度，不推诿扯皮。',
        weight: 1,
        scoreMin: 0,
        scoreMax: 10,
        required: true,
    },
    {
        id: 'execution',
        title: '需求理解与执行力',
        description: '对甲方或总控下达的指令能一次性听懂，不跑偏，并迅速转化为实际行动。',
        weight: 1,
        scoreMin: 0,
        scoreMax: 10,
        required: true,
    },
    {
        id: 'feedback',
        title: '信息反馈与响应',
        description: '保持通讯畅通，遇到问题、进度受阻或完成任务时，能第一时间真实汇报，不隐瞒。',
        weight: 1,
        scoreMin: 0,
        scoreMax: 10,
        required: true,
    },
    {
        id: 'discipline',
        title: '工作纪律与风貌',
        description: '精神面貌积极饱满，严格遵守赛场纪律，不迟到早退，不酒后上岗，不擅自离岗。',
        weight: 1,
        scoreMin: 0,
        scoreMax: 10,
        required: true,
    },
    {
        id: 'ownership',
        title: '服务意识与责任心',
        description: '具备主人翁意识，眼里有活，能主动发现并填补负责区域内的服务、安全或执行盲区。',
        weight: 1,
        scoreMin: 0,
        scoreMax: 10,
        required: true,
    },
    {
        id: 'risk',
        title: '风险意识与敏锐度',
        description: '能够敏锐察觉自己点位上的安全隐患、设备异常、极端天气前兆等问题并预警。',
        weight: 1,
        scoreMin: 0,
        scoreMax: 10,
        required: true,
    },
    {
        id: 'pressure',
        title: '突发应变与抗压能力',
        description: '面对现场高压、突发状况或临时加派的任务，能保持情绪稳定，反应迅速且处理得当。',
        weight: 1,
        scoreMin: 0,
        scoreMax: 10,
        required: true,
    },
];

const CORE_ITEM_IDS = ['skill', 'quality', 'execution'];
const RED_LINE_THRESHOLD = 4;
const TIER_CONFIG = {
    S: { title: 'S级 - 应提拔', color: '#FFD700' },
    A: { title: 'A级 - 应培养', color: '#6366F1' },
    B: { title: 'B级 - 稳定贡献', color: '#10B981' },
    C: { title: 'C级 - 需关注', color: '#F59E0B' },
    D: { title: 'D级 - 应淘汰', color: '#EF4444' },
};
const TIER_DESCRIPTIONS = {
    S: '核心能力突出，具备带领团队的潜质，建议纳入人才梯队培养计划。',
    A: '表现优异，是部门骨干力量，可考虑赋予更多责任和挑战性任务。',
    B: '能胜任当前岗位要求，建议持续关注其成长轨迹。',
    C: '存在明显短板，需制定针对性提升计划，建议1-3个月后复评。',
    D: '能力严重不足或多项核心指标不达标，建议调整岗位或启动淘汰流程。',
};

function badRequest(message) {
    return Object.assign(new Error(message), { status: 400, expose: true });
}

export function getDefaultTemplateItems() {
    return DEFAULT_TEMPLATE_ITEMS.map((item) => ({ ...item }));
}

export function normalizeScoreBounds(item) {
    const scoreMax = Number(item?.scoreMax ?? 10);
    const rawScoreMin = item?.scoreMin;
    let scoreMin = Number(rawScoreMin ?? 0);
    if (scoreMax === 10 && (rawScoreMin === undefined || rawScoreMin === null || scoreMin === 1)) {
        scoreMin = 0;
    }
    return { scoreMin, scoreMax };
}

export function getDefaultTemplateTitle(campaignName) {
    const trimmedName = String(campaignName || '').trim();
    return trimmedName ? `${trimmedName}考评表` : '赛事考评表';
}

export function normalizeTemplateItems(items) {
    const source = Array.isArray(items) && items.length > 0 ? items : getDefaultTemplateItems();
    return source.map((item, index) => {
        const title = String(item?.title || '').trim();
        if (!title) throw badRequest(`templateItems[${index}].title is required`);
        const { scoreMin, scoreMax } = normalizeScoreBounds(item);
        return {
            id: String(item?.id || `item_${index + 1}`),
            title,
            description: String(item?.description || '').trim(),
            weight: Number(item?.weight ?? 1),
            scoreMin,
            scoreMax,
            required: item?.required !== false,
        };
    });
}

export function normalizeRosterRows(rows, knownNameMap = new Map()) {
    if (!Array.isArray(rows) || rows.length === 0) throw badRequest('名单不能为空');
    let inheritedNameCount = 0;
    const normalizedRows = rows.map((row, index) => {
        const employeeCode = String(row?.employeeCode || row?.employee_code || '').trim();
        const importedName = String(row?.employeeName || row?.employee_name || '').trim();
        const position = String(row?.position || '').trim();
        const knownName = knownNameMap.get(employeeCode) || '';
        const employeeName = knownName || importedName;
        if (!employeeCode || !employeeName || !position) {
            throw badRequest(`第 ${index + 1} 行缺少必填字段`);
        }
        if (knownName && knownName !== importedName) inheritedNameCount += 1;
        return {
            employeeCode,
            employeeName,
            position,
            teamName: row?.teamName ? String(row.teamName).trim() : '',
            department: row?.department ? String(row.department).trim() : '',
            sortOrder: Number.isFinite(Number(row?.sortOrder)) ? Number(row.sortOrder) : index + 1,
        };
    });
    return { rows: normalizedRows, inheritedNameCount };
}

export function normalizeScores(inputScores, templateItems) {
    if (!Array.isArray(inputScores) || inputScores.length !== templateItems.length) {
        throw badRequest('评分项数量与模板不一致');
    }
    return templateItems.map((item, index) => {
        const score = Number(inputScores[index]?.score);
        if (!Number.isInteger(score) || score < item.scoreMin || score > item.scoreMax) {
            throw badRequest(`${item.title} 分数必须在 ${item.scoreMin}-${item.scoreMax} 之间`);
        }
        return { itemId: item.id, title: item.title, score };
    });
}

export function checkRedLines(itemAverages) {
    const itemMap = new Map(itemAverages.map((item) => [item.itemId, item.averageScore]));
    const warnings = [];
    for (const itemId of CORE_ITEM_IDS) {
        const score = itemMap.get(itemId);
        if (score !== undefined && score <= RED_LINE_THRESHOLD) {
            const itemTitle = itemAverages.find((item) => item.itemId === itemId)?.title || itemId;
            warnings.push(`${itemTitle} 得分 ${score.toFixed(1)} 分，低于合格线`);
        }
    }
    return { redLineCount: warnings.length, warnings, hasRedLine: warnings.length > 0 };
}

export function calculateEmployeeTier(averageScore, itemAverages, redLineResult = checkRedLines(itemAverages)) {
    const { redLineCount } = redLineResult;
    if (redLineCount >= 2) return 'D';
    if (redLineCount >= 1 && averageScore < 60) return 'D';
    if (redLineCount >= 1) return 'C';
    if (averageScore >= 90) {
        return itemAverages.filter((item) => item.averageScore >= 9).length >= 3 ? 'S' : 'A';
    }
    if (averageScore >= 75) return 'A';
    if (averageScore >= 60) return 'B';
    if (averageScore >= 40) return 'C';
    return 'D';
}

export function buildTierResult(averageScore, itemAverages) {
    const redLineResult = checkRedLines(itemAverages);
    const tier = calculateEmployeeTier(averageScore, itemAverages, redLineResult);
    return {
        tier,
        tierTitle: TIER_CONFIG[tier].title,
        tierColor: TIER_CONFIG[tier].color,
        tierDescription: TIER_DESCRIPTIONS[tier],
        redLineCount: redLineResult.redLineCount,
        redLineWarnings: redLineResult.warnings,
        hasRedLine: redLineResult.hasRedLine,
    };
}

export function buildMemberReport({ member, templateItems, submissions }) {
    const itemAverages = templateItems.map((item) => {
        const scores = submissions
            .map((entry) => entry.scores.find((score) => score.itemId === item.id)?.score)
            .filter((value) => Number.isFinite(value));
        const averageScore = scores.length > 0
            ? scores.reduce((sum, value) => sum + value, 0) / scores.length
            : 0;
        return { itemId: item.id, title: item.title, averageScore: Number(averageScore.toFixed(2)) };
    });
    const totals = submissions.map((entry) => entry.scores.reduce((sum, score) => sum + score.score, 0));
    const averageScore = totals.length > 0
        ? Number((totals.reduce((sum, value) => sum + value, 0) / totals.length).toFixed(2))
        : 0;
    const variance = totals.length > 1
        ? Number((totals.reduce((sum, value) => sum + ((value - averageScore) ** 2), 0) / totals.length).toFixed(2))
        : 0;
    return {
        memberId: member.id,
        employeeCode: member.employee_code,
        employeeName: member.employee_name,
        position: member.position,
        sampleCount: submissions.length,
        averageScore,
        variance,
        itemAverages,
        comments: submissions.map((entry) => String(entry.comment || '').trim()).filter(Boolean),
        tierResult: buildTierResult(averageScore, itemAverages),
    };
}
