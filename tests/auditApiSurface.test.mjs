import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const root = new URL('..', import.meta.url).pathname
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8')

test('audit API uses surface-aware app and admin routes', () => {
  const source = read('src/api/audit.js')

  assert.match(source, /resolveSurfacePrefix/)
  assert.equal(source.includes("app: '/app/audit'"), true)
  assert.equal(source.includes("admin: '/admin/audit'"), true)
  assert.equal(source.includes("request.get(`/audit/"), false)
  assert.equal(source.includes("request.post(`/audit/"), false)
})

test('audit job polling uses surface-aware app and admin job routes', () => {
  const source = read('src/api/audit.js')

  assert.equal(source.includes("app: '/app/jobs'"), true)
  assert.equal(source.includes("admin: '/admin/jobs'"), true)
  assert.equal(source.includes("request.get(`/jobs/"), false)
  assert.match(source, /request\.get\(`\$\{getJobsBasePath\(\)\}\//)
})

test('app event routes expose audit endpoints for the H5 processing surface', () => {
  const source = read('server/src/app.js')

  assert.match(source, /app\.use\(['"]\/api\/app\/audit['"],\s*appEventsPermission,\s*auditRoutes\)/)
  assert.match(source, /app\.use\(['"]\/api\/admin\/audit['"],\s*requirePermission\(\{ surface: ['"]admin['"] \}\),\s*auditRoutes\)/)
})
