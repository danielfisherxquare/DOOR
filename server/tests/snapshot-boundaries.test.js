import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { getSnapshotFields } from '../src/modules/pipeline/snapshot.repository.js'

describe('pipeline snapshot field boundaries', () => {
  it('keeps lottery rollback from restoring bib or registration fields', () => {
    assert.deepEqual(getSnapshotFields('pre_lottery'), ['lottery_status'])
  })

  it('keeps bib rollback from restoring lottery or registration fields', () => {
    assert.deepEqual(getSnapshotFields('pre_bib'), [
      'bib_number',
      'bag_window_no',
      'bag_no',
      'expo_window_no',
      'bib_color',
    ])
  })
})
