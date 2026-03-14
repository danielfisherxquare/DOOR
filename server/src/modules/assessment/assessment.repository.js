import knex from '../../db/knex.js';

function serializeJsonb(value) {
    return typeof value === 'string' ? value : JSON.stringify(value);
}

const CAMPAIGN_FIELDS = [
    'assessment_campaigns.id',
    'assessment_campaigns.org_id',
    'assessment_campaigns.race_id',
    'assessment_campaigns.name',
    'assessment_campaigns.year',
    'assessment_campaigns.status',
    'assessment_campaigns.published_at',
    'assessment_campaigns.created_at',
    'assessment_campaigns.updated_at',
    'races.name as race_name',
    'races.date as race_date',
    'races.location as race_location',
];

export async function listCampaigns() {
    return knex('assessment_campaigns')
        .leftJoin('races', 'assessment_campaigns.race_id', 'races.id')
        .select(
            ...CAMPAIGN_FIELDS,
            knex('assessment_members')
                .whereRaw('assessment_members.campaign_id = assessment_campaigns.id')
                .count('*')
                .as('member_count'),
            knex('assessment_invite_codes')
                .whereRaw('assessment_invite_codes.campaign_id = assessment_campaigns.id')
                .count('*')
                .as('invite_code_count'),
        )
        .orderBy('assessment_campaigns.created_at', 'desc');
}

export async function findCampaignById(id) {
    return knex('assessment_campaigns')
        .leftJoin('races', 'assessment_campaigns.race_id', 'races.id')
        .select(CAMPAIGN_FIELDS)
        .where('assessment_campaigns.id', id)
        .first();
}

export async function findCampaignByRaceId(raceId) {
    return knex('assessment_campaigns').where({ race_id: raceId }).first();
}

export async function createCampaign(data) {
    const [row] = await knex('assessment_campaigns').insert(data).returning('*');
    return row;
}

export async function updateCampaign(id, data) {
    const [row] = await knex('assessment_campaigns')
        .where({ id })
        .update({ ...data, updated_at: knex.fn.now() })
        .returning('*');
    return row;
}

export async function getLatestTemplateSnapshot(campaignId) {
    return knex('assessment_template_snapshots')
        .where({ campaign_id: campaignId })
        .orderBy('version_no', 'desc')
        .first();
}

export async function createTemplateSnapshot(data) {
    const [row] = await knex('assessment_template_snapshots')
        .insert({
            ...data,
            items_json: serializeJsonb(data.items_json),
        })
        .returning('*');
    return row;
}

export async function replaceMembers(campaignId, members) {
    return knex.transaction(async (trx) => {
        await trx('assessment_member_report_snapshots').where({ campaign_id: campaignId }).del();
        await trx('assessment_submissions').where({ campaign_id: campaignId }).del();
        await trx('assessment_drafts').where({ campaign_id: campaignId }).del();
        await trx('assessment_sessions').where({ campaign_id: campaignId }).del();
        await trx('assessment_invite_codes').where({ campaign_id: campaignId }).del();
        await trx('assessment_members').where({ campaign_id: campaignId }).del();
        if (members.length === 0) return [];
        return trx('assessment_members').insert(members).returning('*');
    });
}

export async function listMembers(campaignId) {
    return knex('assessment_members as members')
        .leftJoin('team_members as team_members', 'members.team_member_id', 'team_members.id')
        .select(
            'members.*',
            'team_members.external_engagement_type as team_external_engagement_type',
        )
        .where({ campaign_id: campaignId })
        .orderBy([{ column: 'sort_order', order: 'asc' }, { column: 'created_at', order: 'asc' }]);
}

export async function findMember(campaignId, memberId) {
    return knex('assessment_members as members')
        .leftJoin('team_members as team_members', 'members.team_member_id', 'team_members.id')
        .select(
            'members.*',
            'team_members.external_engagement_type as team_external_engagement_type',
        )
        .where({ 'members.campaign_id': campaignId, 'members.id': memberId })
        .first();
}

export async function createInviteCodes(rows) {
    return knex('assessment_invite_codes').insert(rows).returning('*');
}

export async function listInviteCodes(campaignId) {
    return knex('assessment_invite_codes').where({ campaign_id: campaignId }).orderBy('created_at', 'desc');
}

export async function findInviteCodeByHash(campaignId, codeHash) {
    return knex('assessment_invite_codes')
        .where({ campaign_id: campaignId, code_hash: codeHash })
        .first();
}

export async function findInviteCodeById(id) {
    return knex('assessment_invite_codes').where({ id }).first();
}

export async function updateInviteCode(id, data) {
    const [row] = await knex('assessment_invite_codes')
        .where({ id })
        .update({ ...data, updated_at: knex.fn.now() })
        .returning('*');
    return row;
}

export async function createSession(data) {
    const [row] = await knex('assessment_sessions').insert(data).returning('*');
    return row;
}

export async function touchSession(id, data = {}) {
    const [row] = await knex('assessment_sessions')
        .where({ id })
        .update({ last_seen_at: knex.fn.now(), ...data })
        .returning('*');
    return row;
}

export async function expireSessionsForInviteCode(inviteCodeId) {
    return knex('assessment_sessions')
        .where({ invite_code_id: inviteCodeId, status: 'active' })
        .update({ status: 'expired', last_seen_at: knex.fn.now() });
}

export async function findDraft(campaignId, memberId, inviteCodeId) {
    return knex('assessment_drafts')
        .where({ campaign_id: campaignId, member_id: memberId, invite_code_id: inviteCodeId })
        .first();
}

export async function upsertDraft(data) {
    const [row] = await knex('assessment_drafts')
        .insert(data)
        .onConflict(['campaign_id', 'member_id', 'invite_code_id'])
        .merge({
            session_id: data.session_id,
            payload_ciphertext: data.payload_ciphertext,
            payload_iv: data.payload_iv,
            payload_auth_tag: data.payload_auth_tag,
            updated_at: knex.fn.now(),
        })
        .returning('*');
    return row;
}

export async function deleteDraft(campaignId, memberId, inviteCodeId) {
    return knex('assessment_drafts')
        .where({ campaign_id: campaignId, member_id: memberId, invite_code_id: inviteCodeId })
        .del();
}

export async function listDraftsForInviteCode(campaignId, inviteCodeId) {
    return knex('assessment_drafts')
        .where({ campaign_id: campaignId, invite_code_id: inviteCodeId })
        .select('id', 'member_id', 'updated_at');
}

export async function createSubmission(data) {
    const [row] = await knex('assessment_submissions').insert(data).returning('*');
    return row;
}

export async function findSubmission(campaignId, memberId, inviteCodeId) {
    return knex('assessment_submissions')
        .where({ campaign_id: campaignId, member_id: memberId, invite_code_id: inviteCodeId })
        .first();
}

export async function listSubmissionsForMember(campaignId, memberId) {
    return knex('assessment_submissions')
        .where({ campaign_id: campaignId, member_id: memberId })
        .orderBy('submitted_at', 'asc');
}

export async function listMemberReportSnapshots(campaignId) {
    return knex('assessment_member_report_snapshots').where({ campaign_id: campaignId });
}

export async function upsertMemberReportSnapshot(data) {
    const [row] = await knex('assessment_member_report_snapshots')
        .insert(data)
        .onConflict(['campaign_id', 'member_id'])
        .merge({
            submission_count: data.submission_count,
            report_ciphertext: data.report_ciphertext,
            report_iv: data.report_iv,
            report_auth_tag: data.report_auth_tag,
            updated_at: knex.fn.now(),
        })
        .returning('*');
    return row;
}

export async function findMemberReportSnapshot(campaignId, memberId) {
    return knex('assessment_member_report_snapshots')
        .where({ campaign_id: campaignId, member_id: memberId })
        .first();
}

export async function listCampaignsForEmployeeCode(employeeCode) {
    return knex('assessment_members as members')
        .innerJoin('assessment_campaigns as campaigns', 'members.campaign_id', 'campaigns.id')
        .leftJoin('races', 'campaigns.race_id', 'races.id')
        .select(
            'members.id as member_id',
            'members.campaign_id',
            'members.employee_code',
            'members.employee_name',
            'members.position',
            'campaigns.year',
            'campaigns.name as campaign_name',
            'campaigns.status as campaign_status',
            'campaigns.published_at',
            'races.name as race_name',
        )
        .where('members.employee_code', employeeCode)
        .orderBy([{ column: 'campaigns.year', order: 'asc' }, { column: 'campaigns.created_at', order: 'asc' }]);
}

export async function listLatestKnownMembersByCodes(employeeCodes) {
    if (!Array.isArray(employeeCodes) || employeeCodes.length === 0) return [];

    return knex
        .select('employee_code', 'employee_name')
        .from(
            knex('assessment_members')
                .select(
                    'employee_code',
                    'employee_name',
                    knex.raw(
                        'row_number() over (partition by employee_code order by updated_at desc, created_at desc) as row_num',
                    ),
                )
                .whereIn('employee_code', employeeCodes)
                .as('latest_members'),
        )
        .where('row_num', 1);
}

export async function listCampaignTeamCandidates(campaignId, keyword = '') {
    const campaign = await knex('assessment_campaigns').where({ id: campaignId }).first('id', 'org_id');
    if (!campaign?.org_id) return [];

    const query = knex('team_members')
        .where({ org_id: campaign.org_id })
        .whereIn('status', ['active', 'inactive'])
        .select(
            'id',
            'employee_code',
            'employee_name',
            'position',
            'department',
            'member_type',
            'external_engagement_type',
            'status',
            'created_at',
        )
        .orderBy([{ column: 'employee_code', order: 'asc' }, { column: 'created_at', order: 'asc' }]);

    if (keyword) {
        query.andWhere((builder) => {
            builder
                .where('employee_code', 'ilike', `%${keyword}%`)
                .orWhere('employee_name', 'ilike', `%${keyword}%`)
                .orWhere('department', 'ilike', `%${keyword}%`)
                .orWhere('position', 'ilike', `%${keyword}%`);
        });
    }

    return query;
}

export async function listTeamMembersByIds(orgId, teamMemberIds) {
    if (!Array.isArray(teamMemberIds) || teamMemberIds.length === 0) return [];

    return knex('team_members')
        .where({ org_id: orgId })
        .whereIn('id', teamMemberIds)
        .whereIn('status', ['active', 'inactive'])
        .select(
            'id',
            'org_id',
            'employee_code',
            'employee_name',
            'position',
            'department',
            'member_type',
            'external_engagement_type',
            'status',
        );
}
