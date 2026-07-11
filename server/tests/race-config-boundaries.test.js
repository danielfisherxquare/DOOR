import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  parsePerformanceRulePayload,
  parseStartZonePayload,
} from '../src/modules/pipeline/pipeline-config.schema.js'
import {
  parseClothingBulkPayload,
  parseClothingLimitPayload,
} from '../src/modules/clothing/clothing.schema.js'
import {
  parseColumnMappingPayload,
  resolveColumnMappingOrgId,
} from '../src/modules/column-mappings/column-mapping.schema.js'

describe('pipeline configuration schemas', () => {
  it('whitelists start zones and validates performance time windows', () => {
    assert.deepEqual(
      parseStartZonePayload({
        id: '3',
        raceId: '9',
        zoneName: ' A ',
        width: '10',
        length: 20,
        capacityRatio: '0.8',
        orgId: 'forged',
      }),
      { id: 3, raceId: 9, zoneName: 'A', width: 10, length: 20, capacityRatio: 0.8 },
    )
    assert.deepEqual(
      parsePerformanceRulePayload({
        raceId: 9,
        event: 'half',
        minTime: '01:20:00',
        maxTime: '02:30:00',
        priorityRatio: '0.6',
      }),
      {
        raceId: 9,
        event: 'half',
        minTime: '01:20:00',
        maxTime: '02:30:00',
        priorityRatio: 0.6,
      },
    )
    assert.throws(
      () =>
        parsePerformanceRulePayload({
          raceId: 9,
          event: 'half',
          minTime: '03:00:00',
          maxTime: '02:00:00',
        }),
      /minTime/,
    )
  })
})

describe('clothing schemas', () => {
  it('normalizes one race per bounded bulk request', () => {
    assert.deepEqual(
      parseClothingLimitPayload({
        raceId: '7',
        event: 'FULL',
        gender: 'M',
        size: 'L',
        totalInventory: '100',
        usedCount: '2',
        orgId: 'forged',
      }),
      {
        raceId: 7,
        event: 'FULL',
        gender: 'M',
        size: 'L',
        totalInventory: 100,
        usedCount: 2,
      },
    )
    assert.throws(
      () =>
        parseClothingLimitPayload({
          raceId: 7,
          event: 'FULL',
          gender: 'Male',
          size: 'L',
        }),
      /gender/,
    )
    assert.throws(
      () =>
        parseClothingBulkPayload({
          items: [
            { raceId: 7, event: 'FULL', gender: 'M', size: 'L' },
            { raceId: 8, event: 'FULL', gender: 'M', size: 'XL' },
          ],
        }),
      /一个 raceId/,
    )
  })
})

describe('column mapping schemas', () => {
  it('strips ownership fields and rejects cross-organization scope', async () => {
    assert.deepEqual(
      parseColumnMappingPayload({
        scope: 'user',
        mappings: [
          {
            sourceColumn: ' 姓名 ',
            targetFieldId: 'name',
            orgId: 'forged',
            userId: 'forged',
          },
        ],
      }),
      {
        scope: 'user',
        mappings: [{ sourceColumn: '姓名', targetFieldId: 'name' }],
      },
    )
    await assert.rejects(
      () =>
        resolveColumnMappingOrgId(
          { role: 'org_admin', orgId: 'org-1' },
          { orgId: 'org-2' },
          async () => true,
        ),
      (error) => error.status === 403,
    )
  })
})
