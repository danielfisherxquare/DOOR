import knex from '../../db/knex.js';
import * as repo from './assessment.repository.js';
import {
    buildSessionExpiry,
    createAssessmentSessionToken,
    createInviteCodeValue,
    decryptJson,
    encryptJson,
    hashFingerprint,
    hashInviteCode,
} from './assessment-crypto.js';

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

const CLEAN_DEFAULT_TEMPLATE_ITEMS = [
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

function badRequest(message) {
    return Object.assign(new Error(message), { status: 400, expose: true });
}

function notFound(message) {
    return Object.assign(new Error(message), { status: 404, expose: true });
}

function forbidden(message) {
    return Object.assign(new Error(message), { status: 403, expose: true });
}

function normalizeScoreBounds(item) {
    const scoreMax = Number(item?.scoreMax ?? 10);
    const rawScoreMin = item?.scoreMin;
    let scoreMin = Number(rawScoreMin ?? 0);
    if (scoreMax === 10 && (rawScoreMin === undefined || rawScoreMin === null || scoreMin === 1)) {
        scoreMin = 0;
    }
    return {
        scoreMin,
        scoreMax,
    };
}

function getDefaultTemplateTitle(campaignName) {
    const trimmedName = String(campaignName || '').trim();
    return trimmedName ? `${trimmedName}考评表` : '赛事考评表';
}

function serializeCampaign(row) {
    if (!row) return null;
    return {
        id: row.id,
        orgId: row.org_id,
        raceId: Number(row.race_id),
        name: row.name,
        year: row.year,
        status: row.status,
        publishedAt: row.published_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        raceName: row.race_name,
        raceDate: row.race_date,
        raceLocation: row.race_location,
    };
}

function serializeTemplate(row) {
    if (!row) return null;
    const items = (typeof row.items_json === 'string' ? JSON.parse(row.items_json) : row.items_json)
        .map((item) => ({
            ...item,
            ...normalizeScoreBounds(item),
        }));
    return {
        id: row.id,
        campaignId: row.campaign_id,
        versionNo: row.version_no,
        title: row.title,
        instructions: row.instructions,
        items,
        createdAt: row.created_at,
    };
}

function serializeMember(row) {
    if (!row) return null;
    return {
        id: row.id,
        campaignId: row.campaign_id,
        teamMemberId: row.team_member_id || null,
        sourceType: row.source_type || 'team_member',
        employeeCode: row.employee_code,
        employeeName: row.employee_name,
        position: row.position,
        department: row.department,
        memberType: row.member_type || 'employee',
        externalEngagementType: row.team_external_engagement_type || null,
        sortOrder: row.sort_order,
        status: row.status,
    };
}

function serializeMemberPreview(row) {
    if (!row) return null;
    return {
        id: row.id,
        employeeCode: row.employee_code,
        employeeName: row.employee_name,
        position: row.position,
    };
}

function serializePublicMember(row) {
    if (!row) return null;
    return {
        id: row.id,
        employeeCode: row.employee_code,
        employeeName: row.employee_name,
        position: row.position,
    };
}

function serializeTeamCandidate(row) {
    if (!row) return null;
    return {
        id: row.id,
        employeeCode: row.employee_code,
        employeeName: row.employee_name,
        position: row.position,
        department: row.department,
        memberType: row.member_type,
        externalEngagementType: row.external_engagement_type || null,
        status: row.status,
    };
}

function serializeInviteCode(row) {
    if (!row) return null;
    
    let plainCode = null;
    if (row.plain_code_ciphertext && row.plain_code_iv && row.plain_code_auth_tag) {
        try {
            const decrypted = decryptJson({
                ciphertext: Buffer.from(row.plain_code_ciphertext, 'base64'),
                iv: row.plain_code_iv,
                authTag: row.plain_code_auth_tag,
            });
            plainCode = decrypted.plainCode;
        } catch (error) {
            console.error('Failed to decrypt invite code:', error.message);
        }
    }
    
    return {
        id: row.id,
        campaignId: row.campaign_id,
        status: row.status,
        activatedAt: row.activated_at,
        lastLoginAt: row.last_login_at,
        completedAt: row.completed_at,
        lastMemberId: row.last_member_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        plainCode,
    };
}

function normalizeTemplateItems(items) {
    const source = Array.isArray(items) && items.length > 0 ? items : CLEAN_DEFAULT_TEMPLATE_ITEMS;
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

function normalizeRosterRows(rows, knownNameMap = new Map()) {
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
        if (knownName && knownName !== importedName) {
            inheritedNameCount += 1;
        }
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

function normalizeScores(inputScores, templateItems) {
    if (!Array.isArray(inputScores) || inputScores.length !== templateItems.length) {
        throw badRequest('评分项数量与模板不一致');
    }
    return templateItems.map((item, index) => {
        const scoreRow = inputScores[index];
        const score = Number(scoreRow?.score);
        if (!Number.isInteger(score) || score < item.scoreMin || score > item.scoreMax) {
            throw badRequest(`${item.title} 分数必须在 ${item.scoreMin}-${item.scoreMax} 之间`);
        }
        return {
            itemId: item.id,
            title: item.title,
            score,
        };
    });
}

async function ensureCampaignEditable(campaignId) {
    const campaign = await repo.findCampaignById(campaignId);
    if (!campaign) throw notFound('未找到考评活动');
    if (campaign.status !== 'draft') throw forbidden('只有草稿状态才允许编辑');
    return campaign;
}

async function getCampaignTemplate(campaignId) {
    const campaign = await repo.findCampaignById(campaignId);
    if (!campaign) throw notFound('未找到考评活动');

    let template = await repo.getLatestTemplateSnapshot(campaignId);
    if (!template) {
        try {
            template = await repo.createTemplateSnapshot({
                campaign_id: campaignId,
                version_no: 1,
                title: String(campaign.name || '').trim() ? `${String(campaign.name || '').trim()}考评表` : '赛事考评表',
                instructions: '',
                items_json: CLEAN_DEFAULT_TEMPLATE_ITEMS,
            });
        } catch (error) {
            if (error?.code !== '23505') throw error;
            template = await repo.getLatestTemplateSnapshot(campaignId);
        }
    }
    if (!template) throw notFound('未找到考评模板');
    return serializeTemplate(template);
}

async function buildProgress(campaignId, inviteCodeId) {
    const [members, drafts, submissions] = await Promise.all([
        repo.listMembers(campaignId),
        repo.listDraftsForInviteCode(campaignId, inviteCodeId),
        knex('assessment_submissions')
            .where({ campaign_id: campaignId, invite_code_id: inviteCodeId })
            .select('member_id', 'submitted_at'),
    ]);

    const draftMap = new Map(drafts.map((row) => [row.member_id, row]));
    const submissionMap = new Map(submissions.map((row) => [row.member_id, row]));
    const items = members.map((member) => {
        let progressStatus = 'pending';
        if (submissionMap.has(member.id)) progressStatus = 'submitted';
        else if (draftMap.has(member.id)) progressStatus = 'draft';

        return {
            ...serializeMember(member),
            progressStatus,
            submittedAt: submissionMap.get(member.id)?.submitted_at || null,
            draftUpdatedAt: draftMap.get(member.id)?.updated_at || null,
        };
    });
    const nextPending = items.find((item) => item.progressStatus !== 'submitted') || null;

    return {
        items,
        totalCount: items.length,
        completedCount: items.filter((item) => item.progressStatus === 'submitted').length,
        nextPendingMemberId: nextPending?.id || null,
    };
}

async function refreshInviteCodeStatus(campaignId, inviteCodeId) {
    const progress = await buildProgress(campaignId, inviteCodeId);
    const status = progress.completedCount >= progress.totalCount && progress.totalCount > 0
        ? 'completed'
        : 'active';

    await repo.updateInviteCode(inviteCodeId, {
        status,
        last_member_id: progress.nextPendingMemberId,
        completed_at: status === 'completed' ? knex.fn.now() : null,
    });

    return { ...progress, status };
}

async function refreshMemberReportSnapshot(campaignId, memberId) {
    const [member, template, submissions] = await Promise.all([
        repo.findMember(campaignId, memberId),
        getCampaignTemplate(campaignId),
        repo.listSubmissionsForMember(campaignId, memberId),
    ]);
    if (!member) throw notFound('未找到考评成员');

    const decoded = submissions.map((row) => decryptJson({
        ciphertext: row.payload_ciphertext,
        iv: row.payload_iv,
        authTag: row.payload_auth_tag,
    }));

    const itemAverages = template.items.map((item) => {
        const scores = decoded
            .map((entry) => entry.scores.find((score) => score.itemId === item.id)?.score)
            .filter((value) => Number.isFinite(value));
        const averageScore = scores.length > 0
            ? scores.reduce((sum, value) => sum + value, 0) / scores.length
            : 0;
        return {
            itemId: item.id,
            title: item.title,
            averageScore: Number(averageScore.toFixed(2)),
        };
    });

    const totals = decoded.map((entry) => entry.scores.reduce((sum, score) => sum + score.score, 0));
    const averageScore = totals.length > 0
        ? Number((totals.reduce((sum, value) => sum + value, 0) / totals.length).toFixed(2))
        : 0;
    const variance = totals.length > 1
        ? Number((totals.reduce((sum, value) => sum + ((value - averageScore) ** 2), 0) / totals.length).toFixed(2))
        : 0;

    const redLineResult = checkRedLines(itemAverages);
    const payload = {
        memberId,
        employeeCode: member.employee_code,
        employeeName: member.employee_name,
        position: member.position,
        sampleCount: decoded.length,
        averageScore,
        variance,
        itemAverages,
        comments: decoded.map((entry) => String(entry.comment || '').trim()).filter(Boolean),
        tierResult: buildTierResultWithRedLineCheck(averageScore, itemAverages, redLineResult),
    };

    const encrypted = encryptJson(payload);
    await repo.upsertMemberReportSnapshot({
        campaign_id: campaignId,
        member_id: memberId,
        submission_count: decoded.length,
        report_ciphertext: encrypted.ciphertext,
        report_iv: encrypted.iv,
        report_auth_tag: encrypted.authTag,
    });

    return payload;
}

function deserializeReportSnapshot(snapshot) {
    if (!snapshot) return null;
    return decryptJson({
        ciphertext: snapshot.report_ciphertext,
        iv: snapshot.report_iv,
        authTag: snapshot.report_auth_tag,
    });
}

function buildCampaignReportOverview(campaign, members, inviteCodes, snapshots) {
    const snapshotMap = new Map(snapshots.map((row) => [row.member_id, row]));
    return {
        campaign: serializeCampaign(campaign),
        inviteCodeTotal: inviteCodes.length,
        inviteCodeActivated: inviteCodes.filter((item) => item.activated_at).length,
        inviteCodeCompleted: inviteCodes.filter((item) => item.status === 'completed').length,
        members: members.map((member) => ({
            ...serializeMember(member),
            report: deserializeReportSnapshot(snapshotMap.get(member.id)),
        })),
    };
}

export function getRosterTemplate() {
    return {
        fileName: 'assessment_roster_template.xlsx',
        columns: [
            { key: 'employeeCode', title: '工号', required: true },
            { key: 'employeeName', title: '姓名', required: false, note: '首次导入必填，已存在员工可留空并自动继承' },
            { key: 'position', title: '岗位', required: true },
            { key: 'teamName', title: '团队', required: false },
            { key: 'department', title: '部门', required: false },
            { key: 'sortOrder', title: '排序', required: false },
        ],
        sampleRows: [
            {
                employeeCode: 'A001',
                employeeName: '张三',
                position: '现场执行',
                teamName: '执行一组',
                department: '赛事运营',
                sortOrder: 1,
            },
        ],
    };
}

export async function listCampaigns() {
    const campaigns = await repo.listCampaigns();
    return campaigns.map((campaign) => ({
        ...serializeCampaign(campaign),
        memberCount: Number(campaign.member_count || 0),
        inviteCodeCount: Number(campaign.invite_code_count || 0),
    }));
}

export async function getCampaignDetail(campaignId) {
    const campaign = await repo.findCampaignById(campaignId);
    if (!campaign) throw notFound('未找到考评活动');

    const [template, members, inviteCodes, snapshots] = await Promise.all([
        getCampaignTemplate(campaignId),
        repo.listMembers(campaignId),
        repo.listInviteCodes(campaignId),
        repo.listMemberReportSnapshots(campaignId),
    ]);

    return {
        campaign: serializeCampaign(campaign),
        template,
        members: members.map(serializeMember),
        inviteCodes: inviteCodes.map(serializeInviteCode),
        report: buildCampaignReportOverview(campaign, members, inviteCodes, snapshots),
    };
}

export async function createCampaign({ raceId, name, year, templateTitle, templateInstructions, templateItems }) {
    const numericRaceId = Number(raceId);
    if (!Number.isInteger(numericRaceId) || numericRaceId <= 0) throw badRequest('请选择赛事');

    const existing = await repo.findCampaignByRaceId(numericRaceId);
    if (existing) throw badRequest('该赛事已经创建过考评活动');

    const race = await knex('races').where({ id: numericRaceId }).first();
    if (!race) throw notFound('未找到赛事');

    const items = normalizeTemplateItems(templateItems);
    const normalizedYear = Number.isInteger(Number(year))
        ? Number(year)
        : Number(String(race.date || '').slice(0, 4)) || new Date().getFullYear();
    const normalizedName = String(name || race.name || '').trim() || race.name;

    const campaignId = await knex.transaction(async (trx) => {
        const [campaign] = await trx('assessment_campaigns')
            .insert({
                org_id: race.org_id,
                race_id: numericRaceId,
                name: normalizedName,
                year: normalizedYear,
                status: 'draft',
            })
            .returning('*');

        await trx('assessment_template_snapshots').insert({
            campaign_id: campaign.id,
            version_no: 1,
            title: String(templateTitle || '').trim() || (normalizedName ? `${normalizedName}考评表` : '赛事考评表'),
            instructions: String(templateInstructions || '').trim(),
            items_json: JSON.stringify(items),
        });

        return campaign.id;
    });

    return getCampaignDetail(campaignId);
}

export async function updateCampaign(campaignId, { name, year, templateTitle, templateInstructions, templateItems }) {
    await ensureCampaignEditable(campaignId);

    const patch = {};
    if (name !== undefined) {
        const trimmed = String(name || '').trim();
        if (!trimmed) throw badRequest('考评名称不能为空');
        patch.name = trimmed;
    }
    if (year !== undefined) {
        const normalizedYear = Number(year);
        if (!Number.isInteger(normalizedYear) || normalizedYear < 2000 || normalizedYear > 2100) {
            throw badRequest('年份格式不正确');
        }
        patch.year = normalizedYear;
    }
    if (Object.keys(patch).length > 0) {
        await repo.updateCampaign(campaignId, patch);
    }

    if (templateTitle !== undefined || templateInstructions !== undefined || templateItems !== undefined) {
        const latestTemplate = await getCampaignTemplate(campaignId);
        await repo.createTemplateSnapshot({
            campaign_id: campaignId,
            version_no: Number(latestTemplate.versionNo || 0) + 1,
            title: templateTitle !== undefined ? String(templateTitle || '').trim() : latestTemplate.title,
            instructions: templateInstructions !== undefined ? String(templateInstructions || '').trim() : latestTemplate.instructions,
            items_json: normalizeTemplateItems(templateItems ?? latestTemplate.items),
        });
    }

    return getCampaignDetail(campaignId);
}

export async function publishCampaign(campaignId) {
    await ensureCampaignEditable(campaignId);
    const memberCount = await knex('assessment_members').where({ campaign_id: campaignId }).count('* as count').first();
    if (Number(memberCount?.count || 0) === 0) throw badRequest('发布前请先导入名单');

    await repo.updateCampaign(campaignId, { status: 'published', published_at: knex.fn.now() });
    return getCampaignDetail(campaignId);
}

export async function closeCampaign(campaignId) {
    const campaign = await repo.findCampaignById(campaignId);
    if (!campaign) throw notFound('未找到考评活动');

    await repo.updateCampaign(campaignId, { status: 'closed' });
    await knex('assessment_sessions')
        .where({ campaign_id: campaignId, status: 'active' })
        .update({ status: 'expired' });

    return getCampaignDetail(campaignId);
}

export async function deleteCampaign(campaignId) {
    const campaign = await repo.findCampaignById(campaignId);
    if (!campaign) throw notFound('未找到考评活动');

    await repo.deleteCampaign(campaignId);
    return {
        id: campaignId,
        name: campaign.name,
    };
}

export async function previewRosterImport(campaignId, rows) {
    await ensureCampaignEditable(campaignId);
    const employeeCodes = (Array.isArray(rows) ? rows : [])
        .map((row) => String(row?.employeeCode || row?.employee_code || '').trim())
        .filter(Boolean);
    const knownMembers = await repo.listLatestKnownMembersByCodes(employeeCodes);
    const knownNameMap = new Map(knownMembers.map((member) => [member.employee_code, member.employee_name]));
    const normalized = normalizeRosterRows(rows, knownNameMap);
    const duplicates = [];
    const seen = new Set();
    for (const row of normalized.rows) {
        if (seen.has(row.employeeCode)) duplicates.push(row.employeeCode);
        seen.add(row.employeeCode);
    }
    return {
        rows: normalized.rows,
        rowCount: normalized.rows.length,
        inheritedNameCount: normalized.inheritedNameCount,
        duplicateEmployeeCodes: [...new Set(duplicates)],
    };
}

export async function commitRosterImport(campaignId, rows) {
    const preview = await previewRosterImport(campaignId, rows);
    if (preview.duplicateEmployeeCodes.length > 0) {
        throw badRequest(`工号重复：${preview.duplicateEmployeeCodes.join(', ')}`);
    }

    const inserted = await repo.replaceMembers(campaignId, preview.rows.map((row) => ({
        campaign_id: campaignId,
        employee_code: row.employeeCode,
        employee_name: row.employeeName,
        position: row.position,
        team_name: row.teamName || null,
        department: row.department || null,
        sort_order: row.sortOrder,
        status: 'active',
    })));

    return inserted.map(serializeMember);
}

export async function listCampaignTeamCandidates(campaignId, keyword = '') {
    const campaign = await repo.findCampaignById(campaignId);
    if (!campaign) throw notFound('未找到考评活动');

    const candidates = await repo.listCampaignTeamCandidates(campaignId, String(keyword || '').trim());
    return candidates.map(serializeTeamCandidate);
}

export async function setCampaignMembers(campaignId, teamMemberIds) {
    const campaign = await ensureCampaignEditable(campaignId);
    const rawMembers = Array.isArray(teamMemberIds)
        ? teamMemberIds.map((item) => (typeof item === 'object' && item !== null ? item : { teamMemberId: item }))
        : [];
    const normalizedIds = [...new Set(rawMembers.map((item) => String(item.teamMemberId || '').trim()).filter(Boolean))];
    if (normalizedIds.length === 0) {
        throw badRequest('请选择至少一名团队成员');
    }

    const members = await repo.listTeamMembersByIds(campaign.org_id, normalizedIds);
    if (members.length !== normalizedIds.length) {
        const existingIds = new Set(members.map((item) => item.id));
        const missing = normalizedIds.filter((item) => !existingIds.has(item));
        throw badRequest(`存在不可用的团队成员：${missing.join(', ')}`);
    }

    const memberInputMap = new Map(
        rawMembers
            .map((item) => ({
                teamMemberId: String(item.teamMemberId || '').trim(),
                position: String(item.position || '').trim(),
            }))
            .filter((item) => item.teamMemberId)
            .map((item) => [item.teamMemberId, item]),
    );

    const inserted = await repo.replaceMembers(campaignId, members.map((member, index) => ({
        campaign_id: campaignId,
        source_type: 'team_member',
        team_member_id: member.id,
        member_type: member.member_type,
        employee_code: member.employee_code,
        employee_name: member.employee_name,
        position: memberInputMap.get(String(member.id))?.position || member.position || null,
        team_name: null,
        department: member.department || null,
        sort_order: index + 1,
        status: member.status === 'archived' ? 'archived' : 'active',
    })));

    return inserted.map(serializeMember);
}

export async function generateInviteCodes(campaignId, count = 1) {
    const campaign = await repo.findCampaignById(campaignId);
    if (!campaign) throw notFound('未找到考评活动');
    if (campaign.status === 'closed') throw forbidden('活动已关闭，无法继续生成邀请码');

    const normalizedCount = Number(count);
    if (!Number.isInteger(normalizedCount) || normalizedCount <= 0 || normalizedCount > 500) {
        throw badRequest('邀请码数量必须在 1 到 500 之间');
    }

    const plainCodes = [];
    const rows = [];
    for (let i = 0; i < normalizedCount; i += 1) {
        const plainCode = createInviteCodeValue(8);
        plainCodes.push(plainCode);
        const encrypted = encryptJson({ plainCode });
        rows.push({
            campaign_id: campaignId,
            code_hash: hashInviteCode(plainCode),
            status: 'unused',
            plain_code_ciphertext: Buffer.from(encrypted.ciphertext).toString('base64'),
            plain_code_iv: encrypted.iv,
            plain_code_auth_tag: encrypted.authTag,
        });
    }

    const created = await repo.createInviteCodes(rows);
    return {
        inviteCodes: created.map((row, index) => ({
            ...serializeInviteCode(row),
            plainCode: plainCodes[index],
        })),
    };
}

export async function resetInviteCodeProgress(inviteCodeId) {
    const inviteCode = await repo.findInviteCodeById(inviteCodeId);
    if (!inviteCode) throw notFound('未找到邀请码');

    await knex.transaction(async (trx) => {
        await trx('assessment_drafts').where({ invite_code_id: inviteCodeId }).del();
        await trx('assessment_submissions').where({ invite_code_id: inviteCodeId }).del();
        await trx('assessment_sessions').where({ invite_code_id: inviteCodeId }).update({ status: 'expired' });
        await trx('assessment_invite_codes').where({ id: inviteCodeId }).update({
            status: 'unused',
            activated_at: null,
            last_login_at: null,
            completed_at: null,
            device_fingerprint_hash: null,
            last_member_id: null,
            updated_at: knex.fn.now(),
        });
    });

    const members = await repo.listMembers(inviteCode.campaign_id);
    for (const member of members) {
        await refreshMemberReportSnapshot(inviteCode.campaign_id, member.id);
    }

    return { success: true };
}

export async function revokeInviteCode(inviteCodeId) {
    const inviteCode = await repo.findInviteCodeById(inviteCodeId);
    if (!inviteCode) throw notFound('未找到邀请码');

    await repo.updateInviteCode(inviteCodeId, { status: 'revoked' });
    await knex('assessment_sessions')
        .where({ invite_code_id: inviteCodeId, status: 'active' })
        .update({ status: 'revoked' });

    return { success: true };
}

export async function getCampaignReportOverview(campaignId) {
    const campaign = await repo.findCampaignById(campaignId);
    if (!campaign) throw notFound('未找到考评活动');

    const [members, inviteCodes, snapshots] = await Promise.all([
        repo.listMembers(campaignId),
        repo.listInviteCodes(campaignId),
        repo.listMemberReportSnapshots(campaignId),
    ]);

    return buildCampaignReportOverview(campaign, members, inviteCodes, snapshots);
}

export async function getMemberReport(campaignId, memberId) {
    const member = await repo.findMember(campaignId, memberId);
    if (!member) throw notFound('未找到考评成员');

    return {
        member: serializeMember(member),
        report: await refreshMemberReportSnapshot(campaignId, memberId),
    };
}

export async function getGrowthReport(employeeCode) {
    const history = await repo.listCampaignsForEmployeeCode(employeeCode);
    const timeline = [];

    for (const item of history) {
        const snapshot = await repo.findMemberReportSnapshot(item.campaign_id, item.member_id);
        if (!snapshot) continue;

        const report = decryptJson({
            ciphertext: snapshot.report_ciphertext,
            iv: snapshot.report_iv,
            authTag: snapshot.report_auth_tag,
        });
        timeline.push({
            campaignId: item.campaign_id,
            year: item.year,
            campaignName: item.campaign_name,
            raceName: item.race_name,
            averageScore: report.averageScore,
            sampleCount: report.sampleCount,
            itemAverages: report.itemAverages,
            tierResult: report.tierResult || buildTierResult(report.averageScore, report.itemAverages),
        });
    }

    return { employeeCode, timeline };
}

export async function getPublicCampaignMeta(campaignId) {
    const campaign = await repo.findCampaignById(campaignId);
    if (!campaign) throw notFound('未找到考评活动');

    const members = await repo.listMembers(campaignId);
    return {
        campaign: serializeCampaign(campaign),
        memberCount: members.length,
        membersPreview: members.map(serializeMemberPreview),
    };
}

export async function loginWithInviteCode(campaignId, { inviteCode, deviceFingerprint, ip, userAgent }) {
    const campaign = await repo.findCampaignById(campaignId);
    if (!campaign) throw notFound('未找到考评活动');
    if (!['published', 'closed'].includes(campaign.status)) throw forbidden('当前活动暂未开放评分');

    const normalizedCode = String(inviteCode || '').trim().toUpperCase();
    if (!normalizedCode) throw badRequest('请输入邀请码');

    const invite = await repo.findInviteCodeByHash(campaignId, hashInviteCode(normalizedCode));
    if (!invite) throw forbidden('邀请码无效');
    if (['revoked', 'expired'].includes(invite.status)) throw forbidden('邀请码不可用');

    await repo.expireSessionsForInviteCode(invite.id);
    const session = await repo.createSession({
        campaign_id: campaignId,
        invite_code_id: invite.id,
        device_fingerprint_hash: hashFingerprint(deviceFingerprint),
        ip_hash: hashFingerprint(ip),
        user_agent_hash: hashFingerprint(userAgent),
        status: 'active',
        expires_at: buildSessionExpiry(),
    });

    await repo.updateInviteCode(invite.id, {
        status: invite.status === 'completed' ? 'completed' : 'active',
        activated_at: invite.activated_at || knex.fn.now(),
        last_login_at: knex.fn.now(),
        device_fingerprint_hash: hashFingerprint(deviceFingerprint),
    });

    return {
        accessToken: createAssessmentSessionToken({ campaignId, inviteCodeId: invite.id, sessionId: session.id }),
        inviteCode: serializeInviteCode(await repo.findInviteCodeById(invite.id)),
        progress: await getProgress(campaignId, invite.id),
    };
}

export async function getProgress(campaignId, inviteCodeId) {
    const [progress, inviteCode] = await Promise.all([
        buildProgress(campaignId, inviteCodeId),
        repo.findInviteCodeById(inviteCodeId),
    ]);
    return {
        ...progress,
        items: (progress.items || []).map((item) => ({
            id: item.id,
            employeeCode: item.employeeCode,
            employeeName: item.employeeName,
            position: item.position,
            progressStatus: item.progressStatus,
            submittedAt: item.submittedAt,
            draftUpdatedAt: item.draftUpdatedAt,
        })),
        inviteCode: serializeInviteCode(inviteCode),
    };
}

export async function listPublicMembers(campaignId, inviteCodeId) {
    return getProgress(campaignId, inviteCodeId);
}

export async function getMemberForm(campaignId, memberId, inviteCodeId) {
    const [member, template, draft, submission] = await Promise.all([
        repo.findMember(campaignId, memberId),
        getCampaignTemplate(campaignId),
        repo.findDraft(campaignId, memberId, inviteCodeId),
        repo.findSubmission(campaignId, memberId, inviteCodeId),
    ]);

    if (!member) throw notFound('未找到考评成员');
    return {
        member: serializePublicMember(member),
        template,
        isSubmitted: !!submission,
        draft: draft
            ? decryptJson({
                ciphertext: draft.payload_ciphertext,
                iv: draft.payload_iv,
                authTag: draft.payload_auth_tag,
            })
            : null,
        updatedAt: draft?.updated_at || null,
    };
}

export async function getDraft(campaignId, memberId, inviteCodeId) {
    const [draft, submission] = await Promise.all([
        repo.findDraft(campaignId, memberId, inviteCodeId),
        repo.findSubmission(campaignId, memberId, inviteCodeId),
    ]);
    return {
        submitted: !!submission,
        draft: draft
            ? decryptJson({
                ciphertext: draft.payload_ciphertext,
                iv: draft.payload_iv,
                authTag: draft.payload_auth_tag,
            })
            : null,
        updatedAt: draft?.updated_at || null,
    };
}

export async function saveDraft(campaignId, memberId, inviteCodeId, sessionId, { scores, comment = '' }) {
    const campaign = await repo.findCampaignById(campaignId);
    if (!campaign) throw notFound('未找到考评活动');
    if (campaign.status !== 'published') throw forbidden('当前活动不允许继续编辑');

    const [member, template, existingSubmission] = await Promise.all([
        repo.findMember(campaignId, memberId),
        getCampaignTemplate(campaignId),
        repo.findSubmission(campaignId, memberId, inviteCodeId),
    ]);

    if (!member) throw notFound('未找到考评成员');
    if (existingSubmission) throw forbidden('该成员已经提交，不能再次保存草稿');

    const partialScores = template.items.map((item, index) => {
        const scoreRow = scores?.[index];
        const score = scoreRow?.score === null || scoreRow?.score === undefined || scoreRow?.score === ''
            ? null
            : Number(scoreRow.score);
        if (score !== null && (!Number.isInteger(score) || score < item.scoreMin || score > item.scoreMax)) {
            throw badRequest(`${item.title} 分数必须为空或在 ${item.scoreMin}-${item.scoreMax} 之间`);
        }
        return { itemId: item.id, title: item.title, score };
    });

    const encrypted = encryptJson({
        memberId,
        scores: partialScores,
        comment: String(comment || ''),
        updatedAt: new Date().toISOString(),
    });

    await repo.upsertDraft({
        campaign_id: campaignId,
        member_id: memberId,
        invite_code_id: inviteCodeId,
        session_id: sessionId,
        payload_ciphertext: encrypted.ciphertext,
        payload_iv: encrypted.iv,
        payload_auth_tag: encrypted.authTag,
    });
    await repo.updateInviteCode(inviteCodeId, { last_member_id: memberId });

    return { success: true };
}

export async function submitMemberScore(campaignId, memberId, inviteCodeId, sessionId, { scores, comment = '' }) {
    const campaign = await repo.findCampaignById(campaignId);
    if (!campaign) throw notFound('未找到考评活动');
    if (campaign.status !== 'published') throw forbidden('当前活动不允许继续提交');

    const [member, template, existingSubmission] = await Promise.all([
        repo.findMember(campaignId, memberId),
        getCampaignTemplate(campaignId),
        repo.findSubmission(campaignId, memberId, inviteCodeId),
    ]);

    if (!member) throw notFound('未找到考评成员');
    if (existingSubmission) throw forbidden('该成员已经提交过评分');

    const encrypted = encryptJson({
        memberId,
        scores: normalizeScores(scores, template.items),
        comment: String(comment || ''),
        submittedAt: new Date().toISOString(),
    });

    await repo.createSubmission({
        campaign_id: campaignId,
        member_id: memberId,
        invite_code_id: inviteCodeId,
        session_id: sessionId,
        payload_ciphertext: encrypted.ciphertext,
        payload_iv: encrypted.iv,
        payload_auth_tag: encrypted.authTag,
    });
    await repo.deleteDraft(campaignId, memberId, inviteCodeId);
    await refreshMemberReportSnapshot(campaignId, memberId);

    return {
        success: true,
        progress: await refreshInviteCodeStatus(campaignId, inviteCodeId),
    };
}

export async function logoutSession(sessionId) {
    await repo.touchSession(sessionId, { status: 'expired' });
    return { success: true };
}

const CORE_ITEM_IDS = ['skill', 'quality', 'execution'];
const RED_LINE_THRESHOLD = 4;

const TIER_CONFIG = {
    'S': { title: 'S级 - 应提拔', color: '#FFD700', priority: 5 },
    'A': { title: 'A级 - 应培养', color: '#6366F1', priority: 4 },
    'B': { title: 'B级 - 稳定贡献', color: '#10B981', priority: 3 },
    'C': { title: 'C级 - 需关注', color: '#F59E0B', priority: 2 },
    'D': { title: 'D级 - 应淘汰', color: '#EF4444', priority: 1 }
};

const TIER_DESCRIPTIONS = {
    'S': '核心能力突出，具备带领团队的潜质，建议纳入人才梯队培养计划。',
    'A': '表现优异，是部门骨干力量，可考虑赋予更多责任和挑战性任务。',
    'B': '能胜任当前岗位要求，建议持续关注其成长轨迹。',
    'C': '存在明显短板，需制定针对性提升计划，建议1-3个月后复评。',
    'D': '能力严重不足或多项核心指标不达标，建议调整岗位或启动淘汰流程。'
};

function checkRedLines(itemAverages) {
    const itemMap = new Map(itemAverages.map(item => [item.itemId, item.averageScore]));
    const warnings = [];
    let redLineCount = 0;

    CORE_ITEM_IDS.forEach(itemId => {
        const score = itemMap.get(itemId);
        if (score !== undefined && score <= RED_LINE_THRESHOLD) {
            redLineCount++;
            const itemTitle = itemAverages.find(i => i.itemId === itemId)?.title || itemId;
            warnings.push(`${itemTitle} 得分 ${score.toFixed(1)} 分，低于合格线`);
        }
    });

    return { redLineCount, warnings, hasRedLine: redLineCount > 0 };
}

function calculateEmployeeTier(averageScore, itemAverages) {
    const { redLineCount } = checkRedLines(itemAverages);
    
    if (redLineCount >= 2) return 'D';
    if (redLineCount >= 1 && averageScore < 60) return 'D';
    if (redLineCount >= 1) return 'C';
    
    if (averageScore >= 90) {
        const highScores = itemAverages.filter(item => item.averageScore >= 9).length;
        return highScores >= 3 ? 'S' : 'A';
    }
    if (averageScore >= 75) return 'A';
    if (averageScore >= 60) return 'B';
    if (averageScore >= 40) return 'C';
    return 'D';
}

function buildTierResult(averageScore, itemAverages) {
    const tier = calculateEmployeeTier(averageScore, itemAverages);
    const { redLineCount, warnings } = checkRedLines(itemAverages);
    
    return {
        tier,
        tierTitle: TIER_CONFIG[tier].title,
        tierColor: TIER_CONFIG[tier].color,
        tierDescription: TIER_DESCRIPTIONS[tier],
        redLineCount,
        redLineWarnings: warnings,
        hasRedLine: redLineCount > 0
    };
}

function buildTierResultWithRedLineCheck(averageScore, itemAverages, redLineResult) {
    const tier = calculateEmployeeTierWithRedLineCheck(averageScore, itemAverages, redLineResult);
    
    return {
        tier,
        tierTitle: TIER_CONFIG[tier].title,
        tierColor: TIER_CONFIG[tier].color,
        tierDescription: TIER_DESCRIPTIONS[tier],
        redLineCount: redLineResult.redLineCount,
        redLineWarnings: redLineResult.warnings,
        hasRedLine: redLineResult.hasRedLine
    };
}

function calculateEmployeeTierWithRedLineCheck(averageScore, itemAverages, redLineResult) {
    const { redLineCount } = redLineResult;
    
    if (redLineCount >= 2) return 'D';
    if (redLineCount >= 1 && averageScore < 60) return 'D';
    if (redLineCount >= 1) return 'C';
    
    if (averageScore >= 90) {
        const highScores = itemAverages.filter(item => item.averageScore >= 9).length;
        return highScores >= 3 ? 'S' : 'A';
    }
    if (averageScore >= 75) return 'A';
    if (averageScore >= 60) return 'B';
    if (averageScore >= 40) return 'C';
    return 'D';
}
