import test from 'node:test';
import assert from 'node:assert/strict';

import app from '../src/app.js';
import knex from '../src/db/knex.js';

test('express app exposes knex for request middleware', () => {
    assert.equal(app.locals.knex, knex);
});
