import { getDefaultModules, getRoleDefaultModules } from '../utils/capability-policy.js';
import {
  moduleObjectId,
  organizationObjectId,
  raceObjectId,
  surfaceObjectId,
  userObjectId,
} from './object-ids.js';

const ORG_ADMIN_GOVERNANCE_MODULES = [
  'admin:dashboard',
  'admin:identity-center',
  'admin:members',
  'admin:team',
  'admin:races',
  'admin:design-requests',
];

const PLATFORM_ADMIN_GOVERNANCE_MODULES = [
  ...ORG_ADMIN_GOVERNANCE_MODULES,
  'admin:orgs',
  'admin:backups',
  'admin:audit',
  'admin:system',
];

function normalizeId(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function normalizeRaceId(value) {
  const normalized = normalizeId(value);
  return normalized || null;
}

function parseModuleId(moduleId) {
  const normalized = normalizeId(moduleId);
  if (!normalized || !normalized.includes(':')) return null;
  const [surface, ...rest] = normalized.split(':');
  const id = rest.join(':');
  if (!surface || !id) return null;
  return { surface, moduleId: id };
}

function createTupleCollector() {
  const map = new Map();
  return {
    add(user, relation, object) {
      if (!user || !relation || !object) return;
      const tuple = { user, relation, object };
      map.set(`${user}|${relation}|${object}`, tuple);
    },
    list() {
      return [...map.values()].sort((left, right) => (
        `${left.object}|${left.relation}|${left.user}`
          .localeCompare(`${right.object}|${right.relation}|${right.user}`)
      ));
    },
  };
}

function relationForRaceAccess(accessLevel) {
  return accessLevel === 'editor' ? 'manager' : 'viewer';
}

function grantSurfaceAndModule(tuples, { user, orgId, raceId, surface, moduleId }) {
  const scope = surface === 'ops' && raceId
    ? { raceId }
    : { orgId };
  const surfaceObject = surfaceObjectId({ ...scope, surface });
  const moduleObject = moduleObjectId({ ...scope, surface, moduleId });

  tuples.add(user, 'granted', surfaceObject);
  tuples.add(surfaceObject, 'parent_surface', moduleObject);
  tuples.add(user, 'granted', moduleObject);
}

function grantModuleId(tuples, { user, orgId, raceId, moduleId }) {
  const parsed = parseModuleId(moduleId);
  if (!parsed) return;
  grantSurfaceAndModule(tuples, {
    user,
    orgId,
    raceId,
    surface: parsed.surface,
    moduleId: parsed.moduleId,
  });
}

function raceIdsForUser(userId, userRacePermissions = []) {
  return userRacePermissions
    .filter((permission) => normalizeId(permission.user_id) === normalizeId(userId))
    .map((permission) => normalizeRaceId(permission.race_id))
    .filter(Boolean);
}

export function projectAuthzTuples({
  organizations = [],
  users = [],
  races = [],
  userRacePermissions = [],
  orgRacePermissions = [],
  userModuleAccess = [],
} = {}) {
  const tuples = createTupleCollector();
  const organizationIds = organizations.map((org) => normalizeId(org.id)).filter(Boolean);

  for (const race of races) {
    const orgId = normalizeId(race.org_id || race.orgId);
    const raceId = normalizeRaceId(race.id || race.race_id || race.raceId);
    if (!orgId || !raceId) continue;
    tuples.add(organizationObjectId(orgId), 'parent', raceObjectId(raceId));
    tuples.add(`${organizationObjectId(orgId)}#admin`, 'manager', raceObjectId(raceId));
  }

  for (const permission of orgRacePermissions) {
    const orgId = normalizeId(permission.org_id || permission.orgId);
    const raceId = normalizeRaceId(permission.race_id || permission.raceId);
    if (!orgId || !raceId) continue;
    const relation = relationForRaceAccess(permission.access_level || permission.accessLevel);
    const userset = relation === 'manager'
      ? `${organizationObjectId(orgId)}#admin`
      : `${organizationObjectId(orgId)}#member`;
    tuples.add(userset, relation, raceObjectId(raceId));
  }

  for (const user of users) {
    const userId = normalizeId(user.id || user.user_id || user.userId);
    if (!userId) continue;
    const userObject = userObjectId(userId);
    const orgId = normalizeId(user.org_id || user.orgId);
    const role = user.role || 'user';

    if (role === 'super_admin') {
      const targetOrgs = organizationIds.length > 0 ? organizationIds : [orgId].filter(Boolean);
      for (const targetOrgId of targetOrgs) {
        tuples.add(userObject, 'platform_admin', organizationObjectId(targetOrgId));
        tuples.add(`${organizationObjectId(targetOrgId)}#platform_admin`, 'granted', surfaceObjectId({ orgId: targetOrgId, surface: 'app' }));
        tuples.add(`${organizationObjectId(targetOrgId)}#platform_admin`, 'granted', surfaceObjectId({ orgId: targetOrgId, surface: 'admin' }));
        for (const moduleId of getDefaultModules()) {
          grantModuleId(tuples, { user: userObject, orgId: targetOrgId, moduleId });
        }
        for (const moduleId of PLATFORM_ADMIN_GOVERNANCE_MODULES) {
          grantModuleId(tuples, { user: userObject, orgId: targetOrgId, moduleId });
        }
      }
      continue;
    }

    if (!orgId) continue;

    tuples.add(userObject, 'member', organizationObjectId(orgId));
    tuples.add(`${organizationObjectId(orgId)}#member`, 'granted', surfaceObjectId({ orgId, surface: 'app' }));

    if (role === 'org_admin') {
      tuples.add(userObject, 'admin', organizationObjectId(orgId));
      tuples.add(`${organizationObjectId(orgId)}#admin`, 'granted', surfaceObjectId({ orgId, surface: 'admin' }));
      for (const moduleId of ORG_ADMIN_GOVERNANCE_MODULES) {
        grantModuleId(tuples, { user: userObject, orgId, moduleId });
      }
    }

    for (const moduleId of getDefaultModules()) {
      grantModuleId(tuples, { user: userObject, orgId, moduleId });
    }

    const roleDefaultModules = getRoleDefaultModules(role);
    if (Array.isArray(roleDefaultModules)) {
      const raceIds = raceIdsForUser(userId, userRacePermissions);
      for (const moduleId of roleDefaultModules) {
        const parsed = parseModuleId(moduleId);
        if (!parsed) continue;
        if (parsed.surface === 'ops') {
          for (const raceId of raceIds) {
            grantModuleId(tuples, { user: userObject, orgId, raceId, moduleId });
          }
        } else {
          grantModuleId(tuples, { user: userObject, orgId, moduleId });
        }
      }
    }
  }

  for (const permission of userRacePermissions) {
    const userId = normalizeId(permission.user_id || permission.userId);
    const raceId = normalizeRaceId(permission.race_id || permission.raceId);
    if (!userId || !raceId) continue;
    tuples.add(
      userObjectId(userId),
      relationForRaceAccess(permission.access_level || permission.accessLevel),
      raceObjectId(raceId),
    );
  }

  for (const access of userModuleAccess) {
    const userId = normalizeId(access.user_id || access.userId);
    const orgId = normalizeId(access.org_id || access.orgId);
    const moduleId = access.module_id || access.moduleId;
    if (!userId || !orgId || !moduleId) continue;
    grantModuleId(tuples, {
      user: userObjectId(userId),
      orgId,
      raceId: normalizeRaceId(access.race_id || access.raceId),
      moduleId,
    });
  }

  return tuples.list();
}
