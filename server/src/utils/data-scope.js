import { resolveRaceAccess } from '../modules/races/race-access.service.js';

// ---------------------------------------------------------------------------
// Data scope levels (inspired by RuoYi's @DataScope)
// ---------------------------------------------------------------------------

/** super_admin — all data, no filtering */
export const SCOPE_ALL = 1;

/** org_admin — own org data only */
export const SCOPE_ORG = 2;

/** org_admin — own org + sub-orgs (reserved for future org-tree hierarchy) */
export const SCOPE_ORG_TREE = 3;

/** race_admin — assigned races only */
export const SCOPE_RACE = 4;

/** user — personal data only */
export const SCOPE_SELF = 5;

// ---------------------------------------------------------------------------
// resolveDataScope
// ---------------------------------------------------------------------------

/**
 * Resolve the data scope for the current request based on the authenticated
 * user's role and any race-access information carried by the request.
 *
 * The returned scope object is intended to be passed to {@link applyDataScope}
 * so that every Knex query in a handler automatically receives the correct
 * row-level WHERE clause.
 *
 * @param {object}  req              - Express request object. Must have
 *                                    `req.authContext` set by `requireAuth`
 *                                    middleware ({userId, orgId, role}).
 * @param {object}  [options]        - Optional configuration.
 * @param {string}  [options.raceIdSource]
 *   Where to find the raceId on the request when the caller is a race_admin.
 *   - If a **string**, it is treated as a param/query key — looked up first in
 *     `req.params`, then in `req.query`.
 *   - If a **function**, it is called with `req` and must return the raceId
 *     (or a Promise that resolves to it).
 *   - If omitted, race_admin will be scoped to `orgId` only (no per-race
 *     filter).
 * @param {number|null} [options.filterOrgId]
 *   When the role is super_admin, optionally restrict to a specific org.
 *
 * @returns {Promise<DataScope>}
 */
export async function resolveDataScope(req, options = {}) {
    const { userId, role, orgId } = req.authContext || {};

    // ---- SCOPE_ALL: super_admin sees everything ----
    if (role === 'super_admin') {
        return {
            scope: SCOPE_ALL,
            orgId: options.filterOrgId || null,
        };
    }

    // ---- SCOPE_ORG: org_admin sees own org data ----
    if (role === 'org_admin') {
        return {
            scope: SCOPE_ORG,
            orgId,
        };
    }

    // ---- SCOPE_RACE: race_admin sees assigned races ----
    if (role === 'race_admin') {
        const raceId = await _resolveRaceIdFromRequest(req, options.raceIdSource);

        if (raceId) {
            try {
                const access = await resolveRaceAccess(req.authContext, raceId, req.method);
                return {
                    scope: SCOPE_RACE,
                    orgId: access.operatorOrgId || orgId,
                    raceId,
                    access,
                };
            } catch (_err) {
                // If race access resolution fails (e.g. race not found,
                // forbidden), fall back to org-level scoping so the query
                // still returns a safe subset.
                return {
                    scope: SCOPE_RACE,
                    orgId,
                };
            }
        }

        // No raceId could be resolved — scope to org.
        return {
            scope: SCOPE_RACE,
            orgId,
        };
    }

    // ---- SCOPE_SELF: user sees only personal data ----
    return {
        scope: SCOPE_SELF,
        userId,
        orgId,
    };
}

// ---------------------------------------------------------------------------
// applyDataScope
// ---------------------------------------------------------------------------

/**
 * Apply a {@link DataScope} object as a WHERE clause on a Knex query builder.
 *
 * Call this on every query that should respect the current user's data scope.
 *
 * @param {import('knex').QueryBuilder} query     - Knex query builder instance.
 * @param {DataScope}                   scope     - Scope object returned by
 *                                                  {@link resolveDataScope}.
 * @param {string}                      [tableAlias]
 *   Optional table alias prefix (e.g. `"r"`) so columns are qualified as
 *   `r.org_id`, `r.user_id`, etc.  Omit when querying the base table directly.
 * @returns {import('knex').QueryBuilder} The same query builder (chained).
 */
export function applyDataScope(query, scope, tableAlias = null) {
    const prefix = tableAlias ? `${tableAlias}.` : '';

    switch (scope.scope) {
        case SCOPE_ALL:
            // No filter — sees everything.
            return query;

        case SCOPE_ORG:
        case SCOPE_ORG_TREE:
            if (scope.orgId) {
                return query.where(`${prefix}org_id`, scope.orgId);
            }
            return query;

        case SCOPE_RACE:
            if (scope.raceId) {
                return query.where(`${prefix}race_id`, scope.raceId);
            }
            if (scope.orgId) {
                return query.where(`${prefix}org_id`, scope.orgId);
            }
            return query;

        case SCOPE_SELF:
            if (scope.userId) {
                return query.where(`${prefix}user_id`, scope.userId);
            }
            return query;

        default:
            return query;
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a raceId from the request using the configured source strategy.
 *
 * @param {object}                req      - Express request.
 * @param {string|function|undefined} source - Resolution strategy.
 * @returns {Promise<number|string|null>}
 * @private
 */
async function _resolveRaceIdFromRequest(req, source) {
    if (typeof source === 'function') {
        const result = source(req);
        // Support both sync and async functions.
        return result instanceof Promise ? await result : result;
    }

    if (typeof source === 'string') {
        return req.params?.[source] || req.query?.[source] || null;
    }

    return null;
}

/**
 * @typedef {object} DataScope
 * @property {number}        scope     - One of the SCOPE_* constants.
 * @property {number|null}   [userId]  - Present when scope is SCOPE_SELF.
 * @property {number|null}   [orgId]   - Present when scope is SCOPE_ORG /
 *                                       SCOPE_RACE / SCOPE_SELF.
 * @property {number|null}   [raceId]  - Present when scope is SCOPE_RACE.
 * @property {object|null}   [access]  - Raw result from
 *                                       {@link resolveRaceAccess} (SCOPE_RACE).
 */
