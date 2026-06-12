function normalizeRequiredId(value, label) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`${label} is required`);
  }
  return String(value).trim();
}

function normalizeSurface(surface) {
  const normalized = normalizeRequiredId(surface, 'surface');
  if (!['app', 'ops', 'admin'].includes(normalized)) {
    throw new Error(`Unsupported surface: ${normalized}`);
  }
  return normalized;
}

function scopeKey({ orgId, raceId } = {}) {
  if (raceId !== undefined && raceId !== null && raceId !== '') {
    return `race-${normalizeRequiredId(raceId, 'raceId')}`;
  }
  if (orgId !== undefined && orgId !== null && orgId !== '') {
    return normalizeRequiredId(orgId, 'orgId');
  }
  throw new Error('orgId or raceId is required');
}

export function userObjectId(userId) {
  return `user:${normalizeRequiredId(userId, 'userId')}`;
}

export function organizationObjectId(orgId) {
  return `organization:${normalizeRequiredId(orgId, 'orgId')}`;
}

export function raceObjectId(raceId) {
  return `race:${normalizeRequiredId(raceId, 'raceId')}`;
}

export function platformObjectId(platformId = 'root') {
  return `platform:${normalizeRequiredId(platformId, 'platformId')}`;
}

export function surfaceObjectId({ orgId, raceId, surface } = {}) {
  return `surface:${scopeKey({ orgId, raceId })}/${normalizeSurface(surface)}`;
}

export function moduleObjectId({ orgId, raceId, surface, moduleId } = {}) {
  return `module:${scopeKey({ orgId, raceId })}/${normalizeSurface(surface)}/${normalizeRequiredId(moduleId, 'moduleId')}`;
}

export function tupleUserObjectId(userIdOrObjectId) {
  const normalized = normalizeRequiredId(userIdOrObjectId, 'user');
  return normalized.includes(':') ? normalized : userObjectId(normalized);
}

export function parseObjectType(objectId) {
  const normalized = normalizeRequiredId(objectId, 'object');
  return normalized.split(':', 1)[0];
}

export function moduleIdFromObject(objectId) {
  const normalized = normalizeRequiredId(objectId, 'object');
  if (!normalized.startsWith('module:')) return null;
  const parts = normalized.slice('module:'.length).split('/');
  if (parts.length < 3) return null;
  return `${parts[1]}:${parts.slice(2).join('/')}`;
}

export function surfaceIdFromObject(objectId) {
  const normalized = normalizeRequiredId(objectId, 'object');
  if (!normalized.startsWith('surface:')) return null;
  const parts = normalized.slice('surface:'.length).split('/');
  if (parts.length !== 2) return null;
  return parts[1];
}
