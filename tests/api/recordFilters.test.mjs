import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  FILTERABLE_RECORD_FIELDS,
  changeRecordFilterField,
  getRecordFilterOperators,
} from '../../src/views/app/events/records/recordFilters.js'

describe('record filters', () => {
  it('keeps unsupported and internal fields out of the filter selector', () => {
    assert.equal(FILTERABLE_RECORD_FIELDS.has('orgId'), false)
    assert.equal(FILTERABLE_RECORD_FIELDS.has('emergencyPhone'), false)
    assert.equal(FILTERABLE_RECORD_FIELDS.has('event'), true)
  })

  it('uses exact matching for blind-indexed fields', () => {
    assert.deepEqual(getRecordFilterOperators('phone'), [{ value: 'equals', label: '精确等于' }])
    assert.deepEqual(changeRecordFilterField({ operator: 'contains', value: '138' }, 'idNumber'), {
      field: 'idNumber',
      operator: 'equals',
      value: '',
    })
  })
})
