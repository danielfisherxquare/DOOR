import knex from '../db/knex.js';
import { ALL_MODULES } from '../modules/module-access/module-access.registry.js';
import { createAuthzService } from './authz.service.js';
import {
  moduleObjectId,
  organizationObjectId,
  raceObjectId,
  surfaceObjectId,
  userObjectId,
} from './object-ids.js';
import { projectAuthzTuples } from './tuple-projector.js';

const SURFACES = ['app', 'ops', 'admin'];
const PLATFORM_ADMIN_MODULES = SURFACES.flatMap((surface) => (
  (ALL_MODULES[surface] || []).map((item) => item.id)
));

function normalizeId(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function forbidden(message = '无权访问该工作区') {
  const err = new Error(message);
  err.status = 403;
  err.expose = true;
  return err;
}

function moduleIdParts(moduleId) {
  const [surface, ...rest] = String(moduleId).split(':');
  return { surface, moduleId: rest.join(':') };
}

function objectForSurface({ orgId, raceId, surface }) {
  if (surface === 'ops' && raceId) {
    return surfaceObjectId({ raceId, surface });
  }
  return surfaceObjectId({ orgId, surface });
}

function objectForModule({ orgId, raceId, fullModuleId }) {
  const parsed = moduleIdParts(fullModuleId);
  if (parsed.surface === 'ops' && raceId) {
    return moduleObjectId({ raceId, surface: parsed.surface, moduleId: parsed.moduleId });
  }
  return moduleObjectId({ orgId, surface: parsed.surface, moduleId: parsed.moduleId });
}

function buildPlatformProfile() {
  return {
    scopeType: 'platform',
    orgId: null,
    raceId: null,
    surfaces: SURFACES,
    modules: PLATFORM_ADMIN_MODULES,
    workspaceScopes: [
      {
        scopeType: 'platform',
        orgId: null,
        orgName: '系统平台',
        raceId: null,
        raceName: null,
      },
    ],
  };
}

async function check(authz, user, relation, object) {
  return authz.check({ user, relation, object });
}

export async function buildAuthzProfileFromRows({
  authContext,
  requestedOrgId,
  requestedRaceId,
  rows,
} = {}) {
  const userId = normalizeId(authContext?.userId);
  const orgId = normalizeId(requestedOrgId || authContext?.orgId);
  const raceId = normalizeId(requestedRaceId);

  if (authContext?.role === 'super_admin' && !orgId) {
    return buildPlatformProfile();
  }

  if (!userId || !orgId) {
    throw forbidden();
  }

  const tuples = projectAuthzTuples(rows);
  const authz = createAuthzService({ provider: 'local', tuples });
  const user = userObjectId(userId);
  const canViewOrg = await check(authz, user, 'can_view', organizationObjectId(orgId));
  if (!canViewOrg) {
    throw forbidden();
  }

  if (raceId) {
    const canViewRace = await check(authz, user, 'can_view', raceObjectId(raceId));
    if (!canViewRace) {
      throw forbidden('无权访问该赛事');
    }
  }

  const surfaces = [];
  for (const surface of SURFACES) {
    const object = objectForSurface({ orgId, raceId, surface });
    if (await check(authz, user, 'can_enter', object)) {
      surfaces.push(surface);
    }
  }

  const modules = [];
  for (const surface of SURFACES) {
    for (const item of ALL_MODULES[surface] || []) {
      const object = objectForModule({ orgId, raceId, fullModuleId: item.id });
      if (await check(authz, user, 'can_open', object)) {
        modules.push(item.id);
      }
    }
  }

  const organizations = (rows.organizations || []).map((org) => ({
    id: normalizeId(org.id),
    name: org.name || '',
    slug: org.slug || '',
  })).filter((org) => org.id);
  const selectedOrg = organizations.find((org) => org.id === orgId) || { id: orgId, name: '', slug: '' };

  const workspaceScopes = [
    {
      scopeType: 'org',
      orgId,
      orgName: selectedOrg.name,
      raceId: null,
      raceName: null,
    },
  ];

  const visibleRaceIds = new Set(
    (rows.races || [])
      .filter((race) => normalizeId(race.org_id || race.orgId) === orgId)
      .map((race) => normalizeId(race.id || race.race_id || race.raceId))
      .filter(Boolean),
  );
  for (const permission of rows.orgRacePermissions || []) {
    if (normalizeId(permission.org_id || permission.orgId) !== orgId) continue;
    const sharedRaceId = normalizeId(permission.race_id || permission.raceId);
    if (sharedRaceId) visibleRaceIds.add(sharedRaceId);
  }

  for (const race of rows.races || []) {
    const rowRaceId = normalizeId(race.id || race.race_id || race.raceId);
    if (!rowRaceId || !visibleRaceIds.has(rowRaceId)) continue;
    if (await check(authz, user, 'can_view', raceObjectId(rowRaceId))) {
      workspaceScopes.push({
        scopeType: 'race',
        orgId,
        orgName: selectedOrg.name,
        raceId: rowRaceId,
        raceName: race.name || race.raceName || '',
      });
    }
  }

  return {
    scopeType: raceId ? 'race' : 'org',
    orgId,
    raceId: raceId || null,
    surfaces,
    modules,
    workspaceScopes,
  };
}

export async function loadAuthzRows(db = knex) {
  const [
    organizations,
    users,
    races,
    userRacePermissions,
    orgRacePermissions,
    userModuleAccess,
  ] = await Promise.all([
    db('organizations').select('id', 'name', 'slug'),
    db('users').select('id', 'org_id', 'role'),
    db('races').select('id', 'org_id', 'name'),
    db('user_race_permissions').select('user_id', 'org_id', 'race_id', 'access_level'),
    db('org_race_permissions').select('org_id', 'race_id', 'access_level'),
    db('user_module_access')
      .select('user_id', 'org_id', 'module_id', 'expires_at')
      .where(function validAccess() {
        this.whereNull('expires_at').orWhere('expires_at', '>', db.fn.now());
      }),
  ]);

  return {
    organizations,
    users,
    races,
    userRacePermissions,
    orgRacePermissions,
    userModuleAccess,
  };
}

export async function buildAuthzProfile({
  authContext,
  requestedOrgId,
  requestedRaceId,
  db = knex,
} = {}) {
  const rows = await loadAuthzRows(db);
  return buildAuthzProfileFromRows({
    authContext,
    requestedOrgId,
    requestedRaceId,
    rows,
  });
}
