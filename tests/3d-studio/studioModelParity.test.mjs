import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
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

test('server studio services do not import application source files', async () => {
  const source = await readFile(
    new URL('../../server/src/modules/inventory/inventory.spatial.generated-scene.service.js', import.meta.url),
    'utf8',
  )
  assert.equal(source.includes("../../../../src/3d-studio"), false)
  assert.match(source, /@arcspro\/studio-model/)
})
