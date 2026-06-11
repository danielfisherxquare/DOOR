import { parseObjectType } from './object-ids.js';

function normalizeTuple(tuple) {
  if (!tuple?.user || !tuple?.relation || !tuple?.object) {
    throw new Error('Invalid authz tuple');
  }
  return {
    user: String(tuple.user),
    relation: String(tuple.relation),
    object: String(tuple.object),
  };
}

function tupleKey(tuple) {
  return `${tuple.user}|${tuple.relation}|${tuple.object}`;
}

function usersetParts(user) {
  const match = String(user).match(/^([^#]+)#(.+)$/);
  if (!match) return null;
  return { object: match[1], relation: match[2] };
}

export function createLocalChecker({ tuples = [] } = {}) {
  const normalizedTuples = tuples.map(normalizeTuple);
  const tupleSet = new Set(normalizedTuples.map(tupleKey));
  const objectsByType = new Map();

  for (const tuple of normalizedTuples) {
    const type = parseObjectType(tuple.object);
    if (!objectsByType.has(type)) objectsByType.set(type, new Set());
    objectsByType.get(type).add(tuple.object);
  }

  function hasExactTuple(user, relation, object) {
    return tupleSet.has(tupleKey({ user, relation, object }));
  }

  function tuplesForObjectRelation(object, relation) {
    return normalizedTuples.filter((tuple) => tuple.object === object && tuple.relation === relation);
  }

  async function tupleUserMatches(requestUser, tupleUser, state) {
    if (requestUser === tupleUser) return true;

    const userset = usersetParts(tupleUser);
    if (!userset) return false;

    return evaluate({
      user: requestUser,
      relation: userset.relation,
      object: userset.object,
      state,
    });
  }

  async function hasRelation(user, relation, object, state) {
    if (hasExactTuple(user, relation, object)) return true;

    const candidateTuples = tuplesForObjectRelation(object, relation);
    for (const tuple of candidateTuples) {
      if (await tupleUserMatches(user, tuple.user, state)) {
        return true;
      }
    }
    return false;
  }

  async function anyRelation(user, relations, object, state) {
    for (const relation of relations) {
      if (await evaluate({ user, relation, object, state })) {
        return true;
      }
    }
    return false;
  }

  async function evaluate({ user, relation, object, state = new Set() }) {
    const key = `${user}|${relation}|${object}`;
    if (state.has(key)) return false;
    state.add(key);

    if (await hasRelation(user, relation, object, state)) return true;

    const objectType = parseObjectType(object);

    if (objectType === 'organization') {
      if (relation === 'can_view') {
        return anyRelation(user, ['member', 'admin', 'platform_admin'], object, state);
      }
      if (relation === 'can_manage') {
        return anyRelation(user, ['admin', 'platform_admin'], object, state);
      }
    }

    if (objectType === 'race') {
      if (relation === 'can_view') {
        return anyRelation(user, ['viewer', 'operator', 'manager'], object, state);
      }
      if (relation === 'can_operate') {
        return anyRelation(user, ['operator', 'manager'], object, state);
      }
      if (relation === 'can_manage') {
        return evaluate({ user, relation: 'manager', object, state });
      }
    }

    if (objectType === 'surface' && relation === 'can_enter') {
      return evaluate({ user, relation: 'granted', object, state });
    }

    if (objectType === 'module' && relation === 'can_open') {
      const hasModuleGrant = await evaluate({ user, relation: 'granted', object, state });
      if (!hasModuleGrant) return false;

      const parentSurfaceTuples = tuplesForObjectRelation(object, 'parent_surface');
      for (const tuple of parentSurfaceTuples) {
        if (await evaluate({ user, relation: 'can_enter', object: tuple.user, state })) {
          return true;
        }
      }
      return false;
    }

    return false;
  }

  return {
    async check({ user, relation, object }) {
      return evaluate({ user, relation, object, state: new Set() });
    },

    async listObjects({ user, relation, type }) {
      const candidates = [...(objectsByType.get(type) || [])].sort();
      const allowed = [];
      for (const object of candidates) {
        if (await evaluate({ user, relation, object, state: new Set() })) {
          allowed.push(object);
        }
      }
      return allowed;
    },

    async writeTuples({ writes = [], deletes = [] } = {}) {
      for (const tuple of deletes.map(normalizeTuple)) {
        tupleSet.delete(tupleKey(tuple));
      }
      for (const tuple of writes.map(normalizeTuple)) {
        tupleSet.add(tupleKey(tuple));
        const type = parseObjectType(tuple.object);
        if (!objectsByType.has(type)) objectsByType.set(type, new Set());
        objectsByType.get(type).add(tuple.object);
      }
    },
  };
}
