import bcrypt from 'bcryptjs';
import knex from '../../db/knex.js';
import * as repo from './team.repository.js';
import { buildTeamMemberEmail, buildTeamMemberUsername, createInitialPassword } from './team-password.js';
import { decryptField, encryptField } from './team-crypto.js';
import {
    deleteTeamMemberPhotoFile,
    getTeamMemberPhotoAbsolutePath,
    validateTeamMemberPhoto,
} from './team-photo.js';

function badRequest(message) {
    return Object.assign(new Error(message), { status: 400, expose: true });
}

function notFound(message) {
    return Object.assign(new Error(message), { status: 404, expose: true });
}

function forbidden(message) {
    return Object.assign(new Error(message), { status: 403, expose: true });
}

function maskPhone(last4) {
    return `****${String(last4 || '').slice(-4)}`;
}

function maskId(last4) {
    return `**************${String(last4 || '').slice(-4)}`;
}

function normalizeMemberType(value) {
    if (value === 'employee' || value === '正式成员') return 'employee';
    if (value === 'external_support' || value === '外援') return 'external_support';
    return '';
}

function normalizeExternalType(value) {
    if (!value) return null;
    if (value === 'temporary' || value === '临时') return 'temporary';
    if (value === 'long_term' || value === '长期') return 'long_term';
    return '';
}

function serializeTeamMember(row) {
    if (!row) return null;
    return {
        id: row.id,
        orgId: row.org_id,
        employeeCode: row.employee_code,
        employeeName: row.employee_name,
        position: row.position,
        department: row.department,
        memberType: row.member_type,
        externalEngagementType: row.external_engagement_type,
        hasPhoto: Boolean(row.photo_path),
        idNumberMasked: maskId(row.id_number_last4),
        contactMasked: maskPhone(row.contact_last4),
        status: row.status,
        accountUserId: row.account_user_id,
        accountUsername: row.account_username || null,
        accountRole: row.account_role || null,
        accountStatus: row.account_status || null,
        accountSource: row.account_source || null,
        mustChangePassword: Boolean(row.must_change_password),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function serializeTeamMemberDetail(row) {
    if (!row) return null;
    return {
        ...serializeTeamMember(row),
        idNumber: decryptField({
            ciphertext: row.id_number_ciphertext,
            iv: row.id_number_iv,
            authTag: row.id_number_auth_tag,
        }),
        contact: decryptField({
            ciphertext: row.contact_ciphertext,
            iv: row.contact_iv,
            authTag: row.contact_auth_tag,
        }),
    };
}

function normalizeCleanMemberType(value) {
    if (value === '正式成员') return 'employee';
    if (value === '外援') return 'external_support';
    return value;
}

function normalizeCleanExternalType(value) {
    if (value === '临时') return 'temporary';
    if (value === '长期') return 'long_term';
    return value;
}

function normalizeInput(input, { partial = false } = {}) {
    const employeeCode = input.employeeCode === undefined ? undefined : String(input.employeeCode || '').trim();
    const employeeName = input.employeeName === undefined ? undefined : String(input.employeeName || '').trim();
    const position = input.position === undefined ? undefined : String(input.position || '').trim();
    const department = input.department === undefined ? undefined : String(input.department || '').trim();
    const memberType = input.memberType === undefined ? undefined : normalizeMemberType(normalizeCleanMemberType(input.memberType));
    const externalEngagementType = input.externalEngagementType === undefined
        ? undefined
        : normalizeExternalType(normalizeCleanExternalType(input.externalEngagementType));
    const idNumber = input.idNumber === undefined ? undefined : String(input.idNumber || '').trim();
    const contact = input.contact === undefined ? undefined : String(input.contact || '').trim();

    if (!partial) {
        if (!employeeCode || !employeeName || !department || !memberType || !idNumber || !contact) {
            throw badRequest('Missing required team member fields');
        }
    }

    if (memberType !== undefined && !memberType) throw badRequest('Invalid memberType');
    if (externalEngagementType === '') throw badRequest('Invalid externalEngagementType');
    if (memberType === 'employee' && externalEngagementType) throw badRequest('Employees cannot have external engagement type');
    if (memberType === 'external_support' && !externalEngagementType && !partial) {
        throw badRequest('External support members must provide external engagement type');
    }

    return {
        employeeCode,
        employeeName,
        position,
        department,
        memberType,
        externalEngagementType: externalEngagementType || null,
        idNumber,
        contact,
    };
}

function buildStoredRow(orgId, normalized) {
    const encryptedId = encryptField(normalized.idNumber);
    const encryptedContact = encryptField(normalized.contact);
    return {
        org_id: orgId,
        employee_code: normalized.employeeCode,
        employee_name: normalized.employeeName,
        position: normalized.position || null,
        department: normalized.department,
        member_type: normalized.memberType,
        external_engagement_type: normalized.memberType === 'external_support'
            ? normalized.externalEngagementType
            : null,
        id_number_ciphertext: encryptedId.ciphertext,
        id_number_iv: encryptedId.iv,
        id_number_auth_tag: encryptedId.authTag,
        id_number_last4: encryptedId.last4,
        contact_ciphertext: encryptedContact.ciphertext,
        contact_iv: encryptedContact.iv,
        contact_auth_tag: encryptedContact.authTag,
        contact_last4: encryptedContact.last4,
    };
}

async function createLinkedUser(orgId, teamMember, operatorId, accountSource, trx) {
    const initialPassword = createInitialPassword();
    const passwordHash = await bcrypt.hash(initialPassword, 10);
    const username = buildTeamMemberUsername(teamMember.employee_code, teamMember.employee_name);
    const email = buildTeamMemberEmail(teamMember.id);

    const user = await repo.createUserForTeamMember({
        org_id: orgId,
        username,
        email,
        password_hash: passwordHash,
        role: 'race_viewer',
        status: 'active',
        must_change_password: true,
        created_by: operatorId,
        team_member_id: teamMember.id,
        account_source: accountSource,
    }, trx);

    await repo.updateTeamMember(orgId, teamMember.id, { account_user_id: user.id }, trx);

    return { user, initialPassword };
}

export async function listTeamMembers(orgId, filters) {
    const result = await repo.listTeamMembers(orgId, filters);
    return { ...result, items: result.items.map(serializeTeamMember) };
}

export async function getTeamMember(orgId, teamMemberId) {
    const member = await repo.findTeamMemberById(orgId, teamMemberId);
    if (!member) throw notFound('Team member not found');
    return serializeTeamMemberDetail(member);
}

export async function createTeamMember(orgId, operatorId, input) {
    const normalized = normalizeInput(input);
    const existing = await repo.findTeamMemberByEmployeeCode(orgId, normalized.employeeCode);
    if (existing) throw badRequest('Employee code already exists in this organization');

    return knex.transaction(async (trx) => {
        const member = await repo.createTeamMember(buildStoredRow(orgId, normalized), trx);
        let account = null;
        let initialPassword = null;

        if (normalized.memberType === 'employee') {
            const created = await createLinkedUser(orgId, member, operatorId, 'team_member_auto', trx);
            account = created.user;
            initialPassword = created.initialPassword;
        }

        const detail = await repo.findTeamMemberById(orgId, member.id, trx);
        return {
            teamMember: serializeTeamMemberDetail(detail),
            account: account ? {
                id: account.id,
                username: account.username,
                role: account.role,
                status: account.status,
                mustChangePassword: account.must_change_password,
                accountSource: account.account_source,
            } : null,
            initialPassword,
        };
    });
}

export async function updateTeamMember(orgId, teamMemberId, input) {
    const existing = await repo.findTeamMemberById(orgId, teamMemberId);
    if (!existing) throw notFound('Team member not found');

    const normalized = normalizeInput(input, { partial: true });
    const nextValues = {
        employeeCode: normalized.employeeCode ?? existing.employee_code,
        employeeName: normalized.employeeName ?? existing.employee_name,
        position: normalized.position ?? existing.position,
        department: normalized.department ?? existing.department,
        memberType: normalized.memberType ?? existing.member_type,
        externalEngagementType: normalized.externalEngagementType === undefined
            ? existing.external_engagement_type
            : normalized.externalEngagementType,
        idNumber: normalized.idNumber ?? decryptField({
            ciphertext: existing.id_number_ciphertext,
            iv: existing.id_number_iv,
            authTag: existing.id_number_auth_tag,
        }),
        contact: normalized.contact ?? decryptField({
            ciphertext: existing.contact_ciphertext,
            iv: existing.contact_iv,
            authTag: existing.contact_auth_tag,
        }),
    };

    if (nextValues.memberType === 'employee') nextValues.externalEngagementType = null;
    if (nextValues.memberType === 'external_support' && !nextValues.externalEngagementType) {
        throw badRequest('External support members must provide external engagement type');
    }

    const duplicate = await repo.findTeamMemberByEmployeeCode(orgId, nextValues.employeeCode);
    if (duplicate && duplicate.id !== teamMemberId) throw badRequest('Employee code already exists in this organization');

    return knex.transaction(async (trx) => {
        await repo.updateTeamMember(orgId, teamMemberId, buildStoredRow(orgId, nextValues), trx);
        if (existing.account_user_id) {
            await repo.updateUser(existing.account_user_id, {
                username: buildTeamMemberUsername(nextValues.employeeCode, nextValues.employeeName),
            }, trx);
        }
        const detail = await repo.findTeamMemberById(orgId, teamMemberId, trx);
        return serializeTeamMemberDetail(detail);
    });
}

export async function uploadTeamMemberPhoto(orgId, teamMemberId, file) {
    const existing = await repo.findTeamMemberById(orgId, teamMemberId);
    if (!existing) {
        if (file?.filename) await deleteTeamMemberPhotoFile(file.filename);
        throw notFound('Team member not found');
    }

    try {
        await validateTeamMemberPhoto(file);
    } catch (error) {
        if (file?.filename) await deleteTeamMemberPhotoFile(file.filename);
        throw badRequest(error.message || 'Invalid photo');
    }

    const previousPhotoPath = existing.photo_path;
    const updated = await repo.updateTeamMember(orgId, teamMemberId, { photo_path: file.filename });
    if (previousPhotoPath && previousPhotoPath !== file.filename) {
        await deleteTeamMemberPhotoFile(previousPhotoPath);
    }
    return serializeTeamMemberDetail(updated);
}

export async function deleteTeamMemberPhoto(orgId, teamMemberId) {
    const existing = await repo.findTeamMemberById(orgId, teamMemberId);
    if (!existing) throw notFound('Team member not found');
    if (!existing.photo_path) return serializeTeamMemberDetail(existing);

    const photoPath = existing.photo_path;
    const updated = await repo.updateTeamMember(orgId, teamMemberId, { photo_path: null });
    await deleteTeamMemberPhotoFile(photoPath);
    return serializeTeamMemberDetail(updated);
}

export async function getTeamMemberPhotoFile(orgId, teamMemberId) {
    const existing = await repo.findTeamMemberById(orgId, teamMemberId);
    if (!existing) throw notFound('Team member not found');
    if (!existing.photo_path) throw notFound('Team member photo not found');
    return getTeamMemberPhotoAbsolutePath(existing.photo_path);
}

export async function archiveTeamMember(orgId, teamMemberId) {
    const existing = await repo.findTeamMemberById(orgId, teamMemberId);
    if (!existing) throw notFound('Team member not found');

    return knex.transaction(async (trx) => {
        await repo.updateTeamMember(orgId, teamMemberId, { status: 'archived' }, trx);
        if (existing.account_user_id) {
            await repo.updateUser(existing.account_user_id, { status: 'disabled' }, trx);
        }
        const detail = await repo.findTeamMemberById(orgId, teamMemberId, trx);
        return serializeTeamMemberDetail(detail);
    });
}

export async function restoreTeamMember(orgId, teamMemberId) {
    const existing = await repo.findTeamMemberById(orgId, teamMemberId);
    if (!existing) throw notFound('Team member not found');

    return knex.transaction(async (trx) => {
        await repo.updateTeamMember(orgId, teamMemberId, { status: 'active' }, trx);
        if (existing.account_user_id) {
            await repo.updateUser(existing.account_user_id, { status: 'active' }, trx);
        }
        const detail = await repo.findTeamMemberById(orgId, teamMemberId, trx);
        return serializeTeamMemberDetail(detail);
    });
}

export async function enableTeamMemberAccount(orgId, teamMemberId, operatorId) {
    const existing = await repo.findTeamMemberById(orgId, teamMemberId);
    if (!existing) throw notFound('Team member not found');
    if (existing.account_user_id) throw badRequest('This team member already has an account');
    if (existing.member_type !== 'external_support') throw forbidden('Only external support members can enable account manually');

    return knex.transaction(async (trx) => {
        const created = await createLinkedUser(orgId, existing, operatorId, 'team_member_manual_enable', trx);
        const detail = await repo.findTeamMemberById(orgId, teamMemberId, trx);
        return {
            teamMember: serializeTeamMemberDetail(detail),
            account: {
                id: created.user.id,
                username: created.user.username,
                role: created.user.role,
                status: created.user.status,
                mustChangePassword: created.user.must_change_password,
                accountSource: created.user.account_source,
            },
            initialPassword: created.initialPassword,
        };
    });
}

export async function resetTeamMemberPassword(orgId, teamMemberId) {
    const existing = await repo.findTeamMemberById(orgId, teamMemberId);
    if (!existing) throw notFound('Team member not found');
    if (!existing.account_user_id) throw badRequest('This team member does not have a login account');

    const initialPassword = createInitialPassword();
    const passwordHash = await bcrypt.hash(initialPassword, 10);
    await repo.updateUser(existing.account_user_id, {
        password_hash: passwordHash,
        must_change_password: true,
        failed_login_attempts: 0,
        locked_until: null,
    });

    return {
        teamMember: serializeTeamMember(existing),
        initialPassword,
    };
}

export async function getImportTemplate() {
    return {
        fileName: 'team_members_template.xlsx',
        columns: [
            { key: 'employeeCode', title: '工号', required: true },
            { key: 'employeeName', title: '姓名', required: true },
            { key: 'position', title: '岗位', required: false },
            { key: 'department', title: '部门', required: true },
            { key: 'idNumber', title: '身份证号', required: true },
            { key: 'contact', title: '联系方式', required: true },
            { key: 'memberType', title: '成员类型', required: true },
            { key: 'externalEngagementType', title: '外援类型', required: false },
        ],
        sampleRows: [
            { employeeCode: 'A001', employeeName: '张三', position: '物资采购', department: '执行部', idNumber: '110101199001011234', contact: '13800001234', memberType: '正式成员', externalEngagementType: '' },
            { employeeCode: 'EXT-001', employeeName: '李四', position: '医疗支持', department: '外援组', idNumber: '110101199202023456', contact: '13900005678', memberType: '外援', externalEngagementType: '长期' },
        ],
    };
}

export async function previewImport(_orgId, rows) {
    if (!Array.isArray(rows) || rows.length === 0) throw badRequest('Import rows are required');

    const seen = new Set();
    const duplicateEmployeeCodes = [];
    const normalizedRows = rows.map((row, index) => {
        const normalized = normalizeInput({
            employeeCode: row.employeeCode ?? row.employee_code,
            employeeName: row.employeeName ?? row.employee_name,
            position: row.position,
            department: row.department,
            memberType: row.memberType ?? row.member_type,
            externalEngagementType: row.externalEngagementType ?? row.external_engagement_type,
            idNumber: row.idNumber ?? row.id_number,
            contact: row.contact,
        });

        if (seen.has(normalized.employeeCode)) duplicateEmployeeCodes.push(normalized.employeeCode);
        seen.add(normalized.employeeCode);

        return { rowNumber: index + 1, ...normalized };
    });

    return {
        rows: normalizedRows,
        rowCount: normalizedRows.length,
        duplicateEmployeeCodes: [...new Set(duplicateEmployeeCodes)],
    };
}

export async function commitImport(orgId, operatorId, rows) {
    const preview = await previewImport(orgId, rows);
    if (preview.duplicateEmployeeCodes.length > 0) {
        throw badRequest(`Duplicate employee codes: ${preview.duplicateEmployeeCodes.join(', ')}`);
    }

    const accountsCreated = [];
    await knex.transaction(async (trx) => {
        for (const row of preview.rows) {
            const existing = await repo.findTeamMemberByEmployeeCode(orgId, row.employeeCode, trx);
            const stored = buildStoredRow(orgId, row);

            if (existing) {
                await repo.updateTeamMember(orgId, existing.id, {
                    ...stored,
                    status: existing.status || 'active',
                    account_user_id: existing.account_user_id,
                }, trx);

                if (existing.account_user_id) {
                    await repo.updateUser(existing.account_user_id, {
                        username: buildTeamMemberUsername(row.employeeCode, row.employeeName),
                    }, trx);
                } else if (row.memberType === 'employee') {
                    const latestMember = await repo.findTeamMemberById(orgId, existing.id, trx);
                    const created = await createLinkedUser(orgId, latestMember, operatorId, 'team_member_auto', trx);
                    accountsCreated.push({
                        teamMemberId: latestMember.id,
                        employeeCode: row.employeeCode,
                        employeeName: row.employeeName,
                        username: created.user.username,
                        initialPassword: created.initialPassword,
                    });
                }
                continue;
            }

            const member = await repo.createTeamMember(stored, trx);
            if (row.memberType === 'employee') {
                const created = await createLinkedUser(orgId, member, operatorId, 'team_member_auto', trx);
                accountsCreated.push({
                    teamMemberId: member.id,
                    employeeCode: row.employeeCode,
                    employeeName: row.employeeName,
                    username: created.user.username,
                    initialPassword: created.initialPassword,
                });
            }
        }
    });

    const latest = await repo.listSelectableTeamMembers(orgId);
    return {
        importedCount: preview.rowCount,
        accountsCreated,
        items: latest.map(serializeTeamMember),
    };
}

export async function listTeamCandidates(orgId, keyword = '') {
    const members = await repo.listSelectableTeamMembers(orgId, keyword);
    return members.map((row) => ({
        id: row.id,
        employeeCode: row.employee_code,
        employeeName: row.employee_name,
        position: row.position,
        department: row.department,
        memberType: row.member_type,
        externalEngagementType: row.external_engagement_type,
        status: row.status,
    }));
}

export async function getOrgTeamSummary(orgId) {
    return repo.listOrgSummary(orgId);
}
