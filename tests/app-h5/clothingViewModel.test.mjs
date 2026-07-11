import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildClothingStatisticsRows,
  findClothingLimit,
  formatClothingGender,
} from '../../src/views/app/events/clothing/clothingViewModel.js'

describe('clothing view model', () => {
  const limits = [
    { event: 'ALL', gender: 'M', size: 'M', totalInventory: 2, usedCount: 1 },
    { event: 'ALL', gender: 'F', size: 'S', totalInventory: 2, usedCount: 3 },
  ]

  it('matches the canonical M/F contract used by records and lottery inventory', () => {
    assert.deepEqual(findClothingLimit(limits, 'ALL', 'M', 'M'), limits[0])
    assert.deepEqual(findClothingLimit(limits, 'ALL', 'F', 'S'), limits[1])
    assert.equal(formatClothingGender('M'), '男子')
    assert.equal(formatClothingGender('F'), '女子')
  })

  it('builds inventory, usage, remaining, and overstock rows from one contract', () => {
    assert.deepEqual(buildClothingStatisticsRows(limits), [
      {
        event: 'ALL',
        gender: 'M',
        size: 'M',
        totalInventory: 2,
        usedCount: 1,
        remaining: 1,
        overstock: 0,
      },
      {
        event: 'ALL',
        gender: 'F',
        size: 'S',
        totalInventory: 2,
        usedCount: 3,
        remaining: 0,
        overstock: 1,
      },
    ])
  })
})
