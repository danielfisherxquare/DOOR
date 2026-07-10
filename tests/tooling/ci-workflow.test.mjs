import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workflowUrl = new URL('../../.github/workflows/ci.yml', import.meta.url)

test('CI has attributable frontend and backend jobs on clean checkouts', async () => {
  const workflow = await readFile(workflowUrl, 'utf8')

  assert.match(workflow, /^\s{2}frontend:/m)
  assert.match(workflow, /^\s{2}backend:/m)
  assert.equal((workflow.match(/actions\/checkout@v4/g) || []).length, 2)
  assert.equal((workflow.match(/actions\/setup-node@v4/g) || []).length, 2)
  assert.equal((workflow.match(/node-version: 20/g) || []).length, 2)
  assert.equal((workflow.match(/run: npm ci --ignore-scripts/g) || []).length, 2)
})

test('frontend CI runs every reproducible repository gate', async () => {
  const workflow = await readFile(workflowUrl, 'utf8')

  for (const command of [
    'npm run check:encoding',
    'npm run check:secrets',
    'npm run lint -- --quiet',
    'npm run typecheck',
    'npm run format:check',
    'npm test',
    'npm run build',
  ]) {
    assert.match(workflow, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})

test('backend CI uses PostgreSQL 16 and only an explicit test database', async () => {
  const workflow = await readFile(workflowUrl, 'utf8')

  assert.match(workflow, /image: postgres:16-alpine/)
  assert.match(workflow, /POSTGRES_DB: door_test/)
  assert.match(workflow, /pg_isready -U door -d door_test/)
  assert.match(workflow, /DATABASE_URL: postgres:\/\/door:[^\s]+@127\.0\.0\.1:5432\/door_test/)
  assert.match(workflow, /npm run test:safety/)
  assert.match(workflow, /npm test/)
  assert.doesNotMatch(workflow, /--legacy-peer-deps|--force/)
})
