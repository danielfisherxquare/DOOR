import { authz as defaultAuthz } from '../authz/authz.service.js';
import { createAuthzService } from '../authz/authz.service.js';
import { moduleObjectId, surfaceObjectId } from '../authz/object-ids.js';
import { loadAuthzRows } from '../authz/profile.service.js';
import { projectAuthzTuples } from '../authz/tuple-projector.js';

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

function firstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function resolveOrgId(req) {
  return firstValue(
    req.query?.orgId,
    req.body?.orgId,
    req.params?.orgId,
    req.authContext?.orgId,
  );
}

function resolveRaceId(req) {
  return firstValue(
    req.query?.raceId,
    req.body?.raceId,
    req.params?.raceId,
  );
}

function objectScope(req, scope) {
  const orgId = resolveOrgId(req);
  const raceId = resolveRaceId(req);

  if (scope === 'race') {
    if (!raceId) throw badRequest('缺少赛事上下文');
    return { orgId, raceId };
  }

  return { orgId };
}

async function resolveDefaultAuthz() {
  if (defaultAuthz.provider !== 'local') {
    return defaultAuthz;
  }

  const rows = await loadAuthzRows();
  return createAuthzService({
    provider: 'local',
    tuples: projectAuthzTuples(rows),
  });
}

export function createRequireAuthz({ authz = null } = {}) {
  return function requireAuthz({ surface, moduleId, scope = 'org' } = {}) {
    return async function authzMiddleware(req, _res, next) {
      try {
        const authzService = authz || await resolveDefaultAuthz();
        const scopeValues = objectScope(req, scope);
        const surfaceObject = surfaceObjectId({ ...scopeValues, surface });

        await authzService.assert(req.authContext, {
          relation: 'can_enter',
          object: surfaceObject,
        });

        if (moduleId) {
          await authzService.assert(req.authContext, {
            relation: 'can_open',
            object: moduleObjectId({ ...scopeValues, surface, moduleId }),
          });
        }

        next();
      } catch (err) {
        next(err);
      }
    };
  };
}

export const requireAuthz = createRequireAuthz();
