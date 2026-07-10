import * as raceRepository from './race.repository.js';

function httpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.expose = true;
  return error;
}

function withoutOrgId(payload) {
  const { orgId: _orgId, ...data } = payload;
  return data;
}

export function createRaceService(repository = raceRepository) {
  return {
    async createRace(auth, payload) {
      const orgId = auth?.role === 'super_admin' ? payload.orgId : auth?.orgId;
      if (!orgId) {
        throw httpError(400, 'Missing valid organization context, cannot create race', 'RACE_ORG_REQUIRED');
      }
      if (!await repository.findOrganizationById(orgId)) {
        throw httpError(404, 'Target organization not found', 'RACE_ORG_NOT_FOUND');
      }
      return repository.create(orgId, withoutOrgId(payload));
    },

    listRaces(auth, filters) {
      const scopedOrgId = auth?.role === 'super_admin' ? filters.orgId || null : null;
      return repository.findAllAllowed(auth?.orgId, auth?.userId, auth?.role, { orgId: scopedOrgId });
    },

    getRace(operatorOrgId, raceId) {
      return repository.findById(operatorOrgId, raceId);
    },

    updateRace(operatorOrgId, raceId, payload) {
      return repository.update(operatorOrgId, raceId, withoutOrgId(payload));
    },

    removeRace(operatorOrgId, raceId) {
      return repository.remove(operatorOrgId, raceId);
    },
  };
}

export const raceService = createRaceService();
