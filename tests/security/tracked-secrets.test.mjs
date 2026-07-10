import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  findSecretAssignmentRules,
  findTrackedSecretViolations,
  isForbiddenEnvironmentFile,
  isPlaceholderSecretValue,
} from '../../scripts/check-tracked-secrets.mjs'

test('repository contains no tracked environment or credential files', () => {
  const violations = findTrackedSecretViolations()

  assert.deepEqual(
    violations,
    [],
    `Tracked secret policy violations: ${violations.map(({ path }) => path).join(', ')}`,
  )
})

test('secret scanner distinguishes placeholders from credential-shaped values', () => {
  assert.equal(isPlaceholderSecretValue('your_api_key'), true)
  assert.equal(isPlaceholderSecretValue('${API_KEY:-}'), true)
  assert.equal(isPlaceholderSecretValue('<replace-me>'), true)
  assert.equal(isPlaceholderSecretValue(''), true)
  assert.equal(isPlaceholderSecretValue('sk-live-example-value-that-must-be-rejected'), false)
})

test('secret scanner rejects sibling env files and non-placeholder assignments', () => {
  assert.equal(isForbiddenEnvironmentFile('server/.env.production'), true)
  assert.equal(isForbiddenEnvironmentFile('server/.env.staging.dev'), true)
  assert.equal(isForbiddenEnvironmentFile('server/.env.example'), false)
  assert.deepEqual(findSecretAssignmentRules('API_KEY=your_api_key'), [])
  assert.deepEqual(findSecretAssignmentRules('API_KEY=sk-live-abcdefghijklmnop'), [
    'non-placeholder-secret-assignment',
  ])
})

test('root verification scripts always include the tracked-secret gate', () => {
  const packageJson = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  )

  assert.equal(packageJson.scripts['check:secrets'], 'node scripts/check-tracked-secrets.mjs')
  assert.match(packageJson.scripts.test, /tests\/security\/\*\.test\.mjs/)
})
