import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import * as frontendModel from '../../src/utils/studioProjectUtils.js'
import * as serverModel from '../../server/src/utils/studioProjectUtils.js'

const sharedExports = [
  'DEFAULT_STUDIO_LEVEL',
  'buildImportedWarehouseSnapshot',
  'buildStudioMapState',
  'cloneStudioValue',
  'createBlankStudioScene',
  'createBlankWarehouseScene',
  'createDefaultMapState',
  'createStudioBuildingDraft',
  'createStudioLevelDraft',
  'createStudioWarehouseDraft',
  'getProjectNameFromScene',
  'getStudioHierarchy',
  'getThumbnailScene',
  'isPlainObject',
  'mergeLegacySceneIntoSnapshot',
  'mergeMapStateIntoSnapshot',
  'mergeWarehouseSceneIntoSnapshot',
  'normalizeStudioSnapshot',
  'normalizeWarehouseSceneSnapshot',
  'setStudioSelection',
]

test('frontend and server use one studio model implementation', () => {
  for (const exportName of sharedExports) {
    assert.equal(typeof frontendModel[exportName], typeof serverModel[exportName], exportName)
    assert.equal(frontendModel[exportName], serverModel[exportName], `${exportName} implementation drifted`)
  }
})

test('server inventory services do not import application source files', async () => {
  const inventoryDirectory = new URL('../../server/src/modules/inventory/', import.meta.url)
  const violations = []

  for (const entry of await readdir(inventoryDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue
    const source = await readFile(new URL(entry.name, inventoryDirectory), 'utf8')
    if (/from ['"]\.\.\/\.\.\/\.\.\/\.\.\/src\//.test(source)) {
      violations.push(path.posix.join('server/src/modules/inventory', entry.name))
    }
  }

  assert.deepEqual(violations, [])
})
