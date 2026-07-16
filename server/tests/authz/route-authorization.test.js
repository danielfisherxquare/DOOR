import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { listAllModuleIds } from '../../src/modules/module-access/module-access.registry.js'

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const appSource = await readFile(path.join(serverRoot, 'src/app.js'), 'utf8')

const EXPECTED_MOUNTS = {
  app: {
    events: [
      '/api/app/jobs',
      '/api/app/races/dashboard',
      '/api/app/records',
      '/api/app/column-mappings',
      '/api/app/import-sessions',
      '/api/app/lottery',
      '/api/app/lottery-v2',
      '/api/app/audit',
      '/api/app/clothing',
      '/api/app/pipeline',
      '/api/app/bib',
      '/api/app/bibs',
      '/api/app/projects',
    ],
    reimbursements: ['/api/app/reimbursements'],
    credentials: ['/api/app/credentials'],
    '3d-studio': ['/api/app/3d-studio'],
    interview: ['/api/app/interviews'],
    inventory: ['/api/app/warehouse'],
    'design-requests': ['/api/app/design-requests', '/api/app/approvals'],
    assets: ['/api/app/assets'],
  },
  ops: {
    warehouse: ['/api/ops/warehouse'],
    credentials: ['/api/ops/credentials'],
    'bib-pickup': ['/api/ops/bibs'],
    'design-requests': ['/api/ops/design-requests'],
  },
  admin: {
    system: ['/api/admin/jobs', '/api/admin/dict', '/api/admin/sys-job'],
    'design-requests': ['/api/admin/design-requests', '/api/admin/approvals'],
    races: [
      '/api/admin/races',
      '/api/admin/records',
      '/api/admin/column-mappings',
      '/api/admin/import-sessions',
      '/api/admin/lottery',
      '/api/admin/lottery-v2',
      '/api/admin/audit',
      '/api/admin/clothing',
      '/api/admin/pipeline',
      '/api/admin/bib',
      '/api/admin/projects',
      '/api/admin/calendar',
    ],
    'bib-tracking': ['/api/admin/bibs'],
    hr: ['/api/admin/assessment', '/api/admin/interviews'],
    backups: ['/api/admin/system'],
    finance: ['/api/admin/reimbursements', '/api/admin/ocr'],
    members: ['/api/admin/org'],
    team: ['/api/admin/team'],
    inventory: ['/api/admin/warehouse'],
    credentials: ['/api/admin/credentials'],
    'identity-center': ['/api/admin/identity-center'],
    branding: ['/api/admin/color-schemes'],
    audit: ['/api/admin/operation-logs'],
    orgs: ['/api/admin'],
  },
}

describe('route authorization ownership', () => {
  it('mounts every business API through its registered surface module', () => {
    const validModuleIds = new Set(listAllModuleIds())

    for (const [surface, modules] of Object.entries(EXPECTED_MOUNTS)) {
      for (const [moduleId, paths] of Object.entries(modules)) {
        assert.equal(validModuleIds.has(`${surface}:${moduleId}`), true, `${surface}:${moduleId}`)
        for (const routePath of paths) {
          const mount = `app.use('${routePath}', ${surface}Module('${moduleId}')`
          assert.equal(appSource.includes(mount), true, mount)
        }
      }
    }
  })

  it('uses race-scoped authorization for every ops mount', () => {
    assert.match(
      appSource,
      /const opsModule = \(moduleId\) => requireAuthz\(\{ surface: 'ops', moduleId, scope: 'race' \}\)/,
    )
  })

  it('does not mount routes through the legacy permission wrapper', () => {
    assert.doesNotMatch(appSource, /requirePermission/)
  })
})
