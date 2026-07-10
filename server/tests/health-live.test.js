import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import express from 'express';
import request from 'supertest';

import knex from '../src/db/knex.js';
import healthRoutes from '../src/modules/health/health.routes.js';

after(async () => {
  await knex.destroy();
});

test('liveness remains available without a database connection', async () => {
  const app = express();
  app.use('/api/health', healthRoutes);

  const response = await request(app).get('/api/health/live');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: 'ok' });
});
