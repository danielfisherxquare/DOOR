import crypto from 'node:crypto';

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';

export function createInitialPassword(length = 12) {
    const bytes = crypto.randomBytes(length);
    let password = '';
    for (let i = 0; i < length; i += 1) {
        password += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
    }
    return password;
}

export function buildTeamMemberUsername(employeeCode, employeeName) {
    return `${String(employeeCode || '').trim()}${String(employeeName || '').trim()}`;
}

export function buildTeamMemberEmail(teamMemberId) {
    return `team-member+${teamMemberId}@door.local`;
}
