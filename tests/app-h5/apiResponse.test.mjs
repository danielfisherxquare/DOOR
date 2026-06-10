import assert from 'node:assert/strict'
import { test } from 'node:test'

import { unwrapListData } from '../../src/utils/apiResponse.js'

test('unwrapListData accepts list responses used by real API and mocks', () => {
  const rows = [{ id: 1 }, { id: 2 }]

  assert.deepEqual(unwrapListData({ success: true, data: rows }), rows)
  assert.deepEqual(unwrapListData({ success: true, data: { projects: rows } }, ['projects']), rows)
  assert.deepEqual(unwrapListData({ data: { success: true, data: rows } }, ['projects']), rows)
  assert.deepEqual(unwrapListData({ success: true, data: { data: { projects: rows } } }, ['projects']), rows)
  assert.deepEqual(unwrapListData({ success: true, projects: rows }, ['projects']), rows)
  assert.deepEqual(unwrapListData(rows), rows)
})

test('unwrapListData falls back to an empty array for invalid list payloads', () => {
  assert.deepEqual(unwrapListData({ success: true, data: { total: 2 } }, ['projects']), [])
  assert.deepEqual(unwrapListData(null, ['projects']), [])
})
