import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createInitialForm,
  eventTypeLabel,
  formatAmount,
  importChangeLabel,
  importStatusLabel,
  isImageAsset,
  parseRaceIds,
  priorityLabel,
  raceSummary,
  statusLabel,
} from '../../src/views/design-requests/designRequestWorkspaceConfig.js'

test('design workspace config normalizes linked race identifiers', () => {
  assert.deepEqual(parseRaceIds('3，2, 3 0 nope 5'), [3, 2, 5])
  assert.deepEqual(parseRaceIds([7, '7', 8, null]), [7, 8])
  assert.equal(raceSummary({ raceLinks: [] }), '未关联赛事')
  assert.equal(raceSummary({ raceLinks: [{ raceId: 3, raceName: '成都站' }] }), '成都站')
  assert.equal(raceSummary({ raceLinks: [{ raceId: 3 }, { raceId: 4 }] }), '2 场赛事')
})

test('design workspace labels preserve known values and safe fallbacks', () => {
  assert.equal(statusLabel('pending_review'), '审批中')
  assert.equal(eventTypeLabel('trail'), '越野赛')
  assert.equal(priorityLabel('urgent'), '紧急')
  assert.equal(importStatusLabel('ready'), '可同步')
  assert.equal(importChangeLabel('new_category'), '新类目')
  assert.equal(statusLabel('custom'), 'custom')
})

test('design workspace form and display helpers keep operator defaults', () => {
  const form = createInitialForm('12')
  assert.equal(form.raceId, '12')
  assert.equal(form.raceIdsText, '12')
  assert.equal(form.primaryRaceId, '12')
  assert.equal(form.eventType, 'marathon')
  assert.equal(form.priority, 'normal')
  assert.match(form.dueAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  assert.equal(formatAmount(1234.5), '1,234.5')
  assert.equal(formatAmount('bad'), 'bad')
})

test('design workspace recognizes image assets without browser state', () => {
  assert.equal(isImageAsset({ mimeType: 'image/png' }), true)
  assert.equal(isImageAsset({ fileUrl: 'data:image/webp;base64,abc' }), true)
  assert.equal(isImageAsset({ fileUrl: '/assets/reference.JPG' }), true)
  assert.equal(isImageAsset({ mimeType: 'application/pdf', fileUrl: '/assets/spec.pdf' }), false)
})
