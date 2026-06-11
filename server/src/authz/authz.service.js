import { createLocalChecker } from './local-checker.js';
import { tupleUserObjectId } from './object-ids.js';
import {
  createOpenFgaClient,
  openFgaOptions,
  readOpenFgaConfig,
  validateOpenFgaConfig,
} from './openfga.client.js';

function forbidden(message = '无权访问该资源') {
  const err = new Error(message);
  err.status = 403;
  err.expose = true;
  return err;
}

function normalizeUser({ user, userId } = {}) {
  return tupleUserObjectId(user || userId);
}

function resolveProvider(provider = process.env.AUTHZ_PROVIDER) {
  return provider || (process.env.NODE_ENV === 'production' ? 'openfga' : 'local');
}

export function createAuthzService({
  provider,
  tuples = [],
  openfgaConfig = readOpenFgaConfig(),
  client,
} = {}) {
  const resolvedProvider = resolveProvider(provider);

  if (resolvedProvider === 'local') {
    const checker = createLocalChecker({ tuples });
    return {
      provider: 'local',
      async check(request) {
        return checker.check({
          user: normalizeUser(request),
          relation: request.relation,
          object: request.object,
        });
      },
      async assert(authContext, request) {
        const allowed = await checker.check({
          user: normalizeUser(authContext),
          relation: request.relation,
          object: request.object,
        });
        if (!allowed) throw forbidden(request.message);
        return true;
      },
      async listObjects(request) {
        return checker.listObjects({
          user: normalizeUser(request),
          relation: request.relation,
          type: request.type,
        });
      },
      async writeTuples(changeSet = {}) {
        return checker.writeTuples(changeSet);
      },
    };
  }

  if (resolvedProvider !== 'openfga') {
    throw new Error(`Unsupported authz provider: ${resolvedProvider}`);
  }

  validateOpenFgaConfig(openfgaConfig);
  const fgaClient = client || createOpenFgaClient(openfgaConfig);
  const options = openFgaOptions(openfgaConfig);

  return {
    provider: 'openfga',
    async check(request) {
      const response = await fgaClient.check({
        user: normalizeUser(request),
        relation: request.relation,
        object: request.object,
      }, options);
      return Boolean(response?.allowed);
    },
    async assert(authContext, request) {
      const allowed = await this.check({
        userId: authContext.userId,
        relation: request.relation,
        object: request.object,
      });
      if (!allowed) throw forbidden(request.message);
      return true;
    },
    async listObjects(request) {
      const response = await fgaClient.listObjects({
        user: normalizeUser(request),
        relation: request.relation,
        type: request.type,
      }, options);
      return response?.objects || [];
    },
    async writeTuples(changeSet = {}) {
      return fgaClient.write({
        writes: changeSet.writes || [],
        deletes: changeSet.deletes || [],
      }, options);
    },
  };
}

export const authz = createAuthzService();
