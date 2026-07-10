import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const sourceRoot = path.join(serverRoot, 'src')

async function listJavaScriptFiles(directory) {
  const entries = await readdir(directory)
  const files = []

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry)
    const entryStat = await stat(absolutePath)
    if (entryStat.isDirectory()) {
      files.push(...await listJavaScriptFiles(absolutePath))
    } else if (entry.endsWith('.js')) {
      files.push(absolutePath)
    }
  }

  return files
}

describe('legacy authentication context removal', () => {
  it('uses req.authContext as the only authenticated request context', async () => {
    const forbiddenPatterns = [
      /req\.user\b/,
      /req\.orgAccess\b/,
      /req\.tenantContext\b/,
    ]
    const violations = []

    for (const file of await listJavaScriptFiles(sourceRoot)) {
      const source = await readFile(file, 'utf8')
      for (const pattern of forbiddenPatterns) {
        if (pattern.test(source)) {
          violations.push(`${path.relative(serverRoot, file)}: ${pattern}`)
        }
      }
    }

    assert.deepEqual(violations, [])
  })

  it('does not retain superseded authorization middleware', async () => {
    const obsoleteFiles = [
      'tenant-context.js',
      'require-capability.js',
      'require-module-access.js',
      'require-org-access.js',
      'require-roles.js',
      'require-surface-access.js',
    ]
    const middlewareFiles = await readdir(path.join(sourceRoot, 'middleware'))

    assert.deepEqual(
      obsoleteFiles.filter((file) => middlewareFiles.includes(file)),
      [],
    )
  })

  it('does not keep the expired legacy JWT role migration map', async () => {
    const source = await readFile(path.join(sourceRoot, 'middleware/require-auth.js'), 'utf8')

    assert.doesNotMatch(source, /ROLE_MIGRATION_MAP|Legacy role|normalizedRole/)
  })
})
