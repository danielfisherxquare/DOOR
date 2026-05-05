import test from 'node:test'
import assert from 'node:assert/strict'

import { buildFocusZoneStudioScene } from '../../src/utils/map/focusZoneStudioScene.js'
import {
  buildGeometryBatchFromStudioScene,
  hasStudioEditorDocument,
} from '../../server/src/modules/inventory/inventory.spatial.studio-export.js'
import {
  buildTerrainWorkZoneExportPackage,
  buildTerrainWorkZonePublishManifest,
} from '../../server/src/modules/inventory/inventory.spatial.publish.js'

const focusZone = {
  id: 'zone-export-1',
  projectId: 'project-1',
  name: '导出区域',
  originWgs84: { longitude: 120, latitude: 30, height: 0 },
  clipPolygonWgs84: {
    type: 'Polygon',
    coordinates: [[
      [119.99995, 29.99995],
      [120.00005, 29.99995],
      [120.00005, 30.00005],
      [119.99995, 30.00005],
      [119.99995, 29.99995],
    ]],
  },
  snapshotJson: {
    terrainPatch: {
      sampledAt: '2026-04-16T10:01:00.000Z',
      rows: 2,
      cols: 2,
      heightsRelative: [0, 0, 0, 0],
      boundsMeters: { minX: -5, maxX: 5, minZ: -5, maxZ: 5, width: 10, depth: 10 },
    },
  },
}

const objects = [{
  id: 'stage-export-1',
  title: '可编辑舞台',
  objectType: 'stage',
  updatedAt: '2026-04-16T10:02:00.000Z',
  anchorWgs84: { longitude: 120, latitude: 30, height: 0 },
}]

test('studio export detects editor document snapshot', () => {
  const scene = buildFocusZoneStudioScene({ focusZone, objects })
  const zone = {
    ...focusZone,
    snapshotJson: {
      ...focusZone.snapshotJson,
      warehouseScene: scene,
    },
  }

  assert.equal(hasStudioEditorDocument(zone), true)
})

test('studio editor document converts to white model batch meshes', () => {
  const scene = buildFocusZoneStudioScene({ focusZone, objects })
  const zone = {
    ...focusZone,
    snapshotJson: {
      ...focusZone.snapshotJson,
      warehouseScene: scene,
      savedAt: '2026-04-16T10:10:00.000Z',
    },
  }
  const batch = buildGeometryBatchFromStudioScene({
    zone,
    warehouseScene: scene,
    resource: {
      id: 'lod0-white-model',
      lodLevel: 'LOD0',
      materialMode: 'white-model',
      path: 'focus-zones/zone-export-1/lod0/model.glb',
    },
  })

  assert.equal(batch.version, 'door-white-model-batch-v2')
  assert.equal(batch.source, 'studio-editor-document')
  assert.equal(batch.metadata.source, 'studio-editor-document')
  assert.equal(batch.meshes.some((mesh) => mesh.sourceObjectId === 'stage-export-1'), true)
  assert.ok(batch.stats.meshCount >= 1)
  assert.ok(batch.stats.totalVertices > 0)
  assert.ok(batch.stats.totalTriangles > 0)
})

test('map selection studio snapshot exports even without semantic objects', () => {
  const scene = buildFocusZoneStudioScene({ focusZone, objects: [] })
  const zone = {
    ...focusZone,
    snapshotJson: {
      ...focusZone.snapshotJson,
      warehouseScene: scene,
    },
  }
  const manifest = buildTerrainWorkZonePublishManifest(zone, [])
  const exportPackage = buildTerrainWorkZoneExportPackage(zone, manifest)
  const geometryResource = exportPackage.resources.find((resource) => resource.category === 'geometry-batch')
  assert.ok(geometryResource)

  const batch = buildGeometryBatchFromStudioScene({
    zone,
    warehouseScene: scene,
    resource: geometryResource,
  })

  assert.equal(manifest.summary.totalObjects, 0)
  assert.equal(geometryResource.lodLevel, 'LOD0')
  assert.equal(geometryResource.format, 'glb')
  assert.ok(batch.stats.meshCount >= 2)
  assert.ok(batch.meshes.some((mesh) => mesh.objectType === 'focus_zone_floor'))
  assert.ok(batch.meshes.some((mesh) => mesh.objectType === 'terrain_patch'))
  assert.ok(batch.stats.totalTriangles > 0)
})
