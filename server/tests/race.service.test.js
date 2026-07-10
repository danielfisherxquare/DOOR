import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRaceId } from '../src/modules/races/race-access.service.js';
import { createRaceService } from '../src/modules/races/race.service.js';
import {
  parseRaceCreatePayload,
  parseRaceUpdatePayload,
} from '../src/modules/races/race.schema.js';

const ORG_ID = '40000000-0000-4000-8000-000000000001';

test('race create schema whitelists fields and normalizes event names', () => {
  assert.deepEqual(parseRaceCreatePayload({
    name: '  邕江跑  ',
    date: '2026-10-18',
    location: '  南宁  ',
    conflictRule: 'strict',
    events: [{ name: 'Full', targetCount: 1000 }],
    orgId: ORG_ID,
    org_id: 'attacker',
    createdAt: 'attacker',
  }), {
    name: '邕江跑',
    date: '2026-10-18',
    location: '南宁',
    conflictRule: 'strict',
    events: [{ name: '马拉松', targetCount: 1000 }],
    orgId: ORG_ID,
    locationLat: null,
    locationLng: null,
    routeData: null,
    mapFeaturesData: null,
    lotteryModeDefault: 'lottery',
  });
});

test('race schemas reject impossible dates, duplicate normalized events, and empty updates', () => {
  assert.throws(
    () => parseRaceCreatePayload({ name: '赛事', date: '2026-02-31' }),
    /date/,
  );
  assert.throws(
    () => parseRaceCreatePayload({
      name: '赛事',
      date: '2026-10-18',
      events: [{ name: 'Full', targetCount: 1 }, { name: '马拉松', targetCount: 2 }],
    }),
    /重复/,
  );
  assert.throws(() => parseRaceUpdatePayload({ orgId: ORG_ID }), /至少提供一个/);
});

test('race identifiers must be positive safe integers', () => {
  assert.equal(normalizeRaceId('12'), 12);
  assert.throws(() => normalizeRaceId('1.5'), /Invalid raceId/);
  assert.throws(() => normalizeRaceId(String(Number.MAX_SAFE_INTEGER + 1)), /Invalid raceId/);
});

test('organization administrators cannot choose another organization on create', async () => {
  let created;
  const service = createRaceService({
    findOrganizationById: async (orgId) => ({ id: orgId }),
    create: async (orgId, payload) => {
      created = { orgId, payload };
      return { id: 1, orgId, ...payload };
    },
  });

  await service.createRace(
    { role: 'org_admin', orgId: ORG_ID },
    {
      name: '赛事',
      date: '2026-10-18',
      orgId: '40000000-0000-4000-8000-000000000002',
    },
  );

  assert.deepEqual(created, {
    orgId: ORG_ID,
    payload: { name: '赛事', date: '2026-10-18' },
  });
});

test('super administrators must target an existing organization', async () => {
  const service = createRaceService({
    findOrganizationById: async () => null,
  });

  await assert.rejects(
    service.createRace(
      { role: 'super_admin' },
      { name: '赛事', date: '2026-10-18', orgId: ORG_ID },
    ),
    (error) => error.status === 404 && error.code === 'RACE_ORG_NOT_FOUND',
  );
});
