/**
 * Auth Mapper — organizations / users / refresh_tokens
 * snake_case (DB) ↔ camelCase (API)
 */

// ── Organizations ────────────────────────────────────
export const orgMapper = {
    fromDbRow(row) {
        if (!row) return null;
        return {
            id: row.id,
            name: row.name,
            slug: row.slug,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    },

    toDbInsert(data) {
        return {
            name: data.name,
            slug: data.slug,
        };
    },
};

// ── Users ────────────────────────────────────────────
export const userMapper = {
    fromDbRow(row) {
        if (!row) return null;
        return {
            id: row.id,
            orgId: row.org_id,
            username: row.username,
            email: row.email,
            passwordHash: row.password_hash,
            role: row.role,
            avatar: row.avatar,
            emailVerified: row.email_verified,
            status: row.status,
            mustChangePassword: row.must_change_password,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    },

    /** 面向 API 的安全 DTO（不暴露 passwordHash） */
    toApiResponse(row) {
        const mapped = userMapper.fromDbRow(row);
        if (!mapped) return null;
        const { passwordHash, ...safe } = mapped;
        return safe;
    },

    toDbInsert(data) {
        return {
            org_id: data.orgId,
            username: data.username,
            email: data.email,
            password_hash: data.passwordHash,
            role: data.role || 'org_admin',
        };
    },
};

// ── Refresh Tokens ───────────────────────────────────
export const refreshTokenMapper = {
    fromDbRow(row) {
        if (!row) return null;
        return {
            id: row.id,
            userId: row.user_id,
            tokenHash: row.token_hash,
            expiresAt: row.expires_at,
            createdAt: row.created_at,
        };
    },

    toDbInsert(data) {
        return {
            user_id: data.userId,
            token_hash: data.tokenHash,
            expires_at: data.expiresAt,
        };
    },
};
