import test from 'node:test'
import assert from 'node:assert/strict'

import { createEditorDocumentFromWarehouseScene } from '../../src/3d-studio/model/editorDocument.js'
import {
  buildFocusZoneStudioScene,
  computeFocusZoneSourceHash,
  getFocusZoneSceneImportState,
} from '../../src/utils/map/focusZoneStudioScene.js'
import {
  buildOverpassBuildingQuery,
  normalizeOverpassBuildings,
} from '../../src/utils/map/focusZoneOsmBuildings.js'
import {
  createBlankWarehouseScene,
  getStudioHierarchy,
  mergeWarehouseSceneIntoSnapshot,
  normalizeStudioSnapshot,
} from '../../src/utils/studioProjectUtils.js'
import {
  buildSiteModeSaveRequest,
  createSiteProjectSnapshot,
  hydrateSiteFocusZone,
  resolveSiteBakePresentation,
} from '../../src/utils/map/siteModePersistence.js'

const focusZone = {
  id: 'zone-1',
  projectId: 'project-1',
  name: '测试固定区域',
  zoneType: 'focus-zone',
  updatedAt: '2026-04-16T10:00:00.000Z',
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
      boundsMeters: { minX: -5, maxX: 5, minZ: -5, maxZ: 5, width: 10, depth: 10 },
      resolutionMeters: 2,
      rows: 2,
      cols: 2,
      heightsRelative: [0, 0, 0, 0],
    },
  },
}

const objects = [
  {
    id: 'stage-1',
    title: '主舞台',
    objectType: 'stage',
    updatedAt: '2026-04-16T10:02:00.000Z',
    anchorWgs84: { longitude: 120, latitude: 30, height: 0 },
    materialVariant: { color: '#dddddd' },
  },
  {
    id: 'tower-1',
    title: '灯光塔',
    objectType: 'light_tower',
    updatedAt: '2026-04-16T10:03:00.000Z',
    anchorWgs84: { longitude: 120.00002, latitude: 30.00002, height: 0 },
  },
]

test('focus zone studio scene imports boundary and spatial objects as editor document', () => {
  const scene = buildFocusZoneStudioScene({ focusZone, objects })
  const document = createEditorDocumentFromWarehouseScene(scene)

  assert.equal(scene.sceneType, 'focus-zone-studio-scene')
  assert.equal(document.metadata.source, 'gis-focus-zone')
  assert.equal(document.metadata.sourceWorkZoneId, 'zone-1')
  assert.equal(document.metadata.sourceObjectCount, 2)
  assert.ok(document.profiles.some((profile) => profile.metadata?.compatType === 'focus-zone-boundary'))
  assert.ok(document.solids.some((solid) => solid.metadata?.compatType === 'focus-zone-floor'))
  assert.equal(document.terrainMeshes.length, 1)
  assert.ok(document.solids.some((solid) => solid.metadata?.sourceObjectId === 'stage-1'))
  assert.ok(document.solids.some((solid) => solid.metadata?.sourceObjectId === 'tower-1'))
  assert.ok(scene.warehouse.dimensions_mm.width_mm > 0)
  assert.ok(scene.warehouse.dimensions_mm.depth_mm > 0)
})

test('focus zone studio scene imports OSM buildings as editable solids', () => {
  const osmBuildings = normalizeOverpassBuildings({
    elements: [{
      type: 'way',
      id: 101,
      tags: { building: 'yes', 'building:levels': '4', name: 'OSM 测试楼' },
      geometry: [
        { lon: 119.99998, lat: 29.99998 },
        { lon: 120.00002, lat: 29.99998 },
        { lon: 120.00002, lat: 30.00002 },
        { lon: 119.99998, lat: 30.00002 },
        { lon: 119.99998, lat: 29.99998 },
      ],
    }],
  }, focusZone)
  const scene = buildFocusZoneStudioScene({
    focusZone: {
      ...focusZone,
      snapshotJson: {
        ...focusZone.snapshotJson,
        osmBuildings: {
          fetchedAt: '2026-04-18T10:00:00.000Z',
          buildings: osmBuildings,
        },
      },
    },
    objects: [],
  })
  const document = createEditorDocumentFromWarehouseScene(scene)
  const osmSolid = document.solids.find((solid) => solid.metadata?.objectType === 'osm_building')

  assert.equal(document.metadata.osmBuildingCount, 1)
  assert.ok(osmSolid)
  assert.equal(osmSolid.metadata.osmId, 101)
  assert.ok(osmSolid.height > 10)
})

test('OSM building extraction includes multipolygon relations', () => {
  const query = buildOverpassBuildingQuery(focusZone.clipPolygonWgs84)
  const osmBuildings = normalizeOverpassBuildings({
    elements: [{
      type: 'relation',
      id: 202,
      tags: { building: 'retail', height: '15m', name: 'OSM 关系建筑' },
      members: [{
        type: 'way',
        role: 'outer',
        geometry: [
          { lon: 119.99997, lat: 29.99997 },
          { lon: 120.00003, lat: 29.99997 },
          { lon: 120.00003, lat: 30.00003 },
        ],
      }, {
        type: 'way',
        role: 'outer',
        geometry: [
          { lon: 120.00003, lat: 30.00003 },
          { lon: 119.99997, lat: 30.00003 },
          { lon: 119.99997, lat: 29.99997 },
        ],
      }],
    }],
  }, focusZone)

  assert.match(query, /relation\["building"\]/)
  assert.match(query, /way\["building:part"\]/)
  assert.match(query, /relation\["building:part"\]/)
  assert.equal(osmBuildings.length, 1)
  assert.equal(osmBuildings[0].osmType, 'relation')
  assert.equal(osmBuildings[0].heightMeters, 15)
  assert.equal(osmBuildings[0].footprintWgs84.coordinates[0].length, 5)
})

test('OSM building extraction prefers building parts over parent building outlines', () => {
  const osmBuildings = normalizeOverpassBuildings({
    elements: [{
      type: 'way',
      id: 410,
      tags: { building: 'yes', name: '父级建筑外轮廓' },
      geometry: [
        { lon: 119.999965, lat: 29.999965 },
        { lon: 120.000035, lat: 29.999965 },
        { lon: 120.000035, lat: 30.000035 },
        { lon: 119.999965, lat: 30.000035 },
        { lon: 119.999965, lat: 29.999965 },
      ],
    }, {
      type: 'way',
      id: 411,
      tags: { 'building:part': 'yes', 'building:levels': '3', name: '楼体 A' },
      geometry: [
        { lon: 119.999972, lat: 29.999972 },
        { lon: 120.000002, lat: 29.999972 },
        { lon: 120.000002, lat: 30.000028 },
        { lon: 119.999972, lat: 30.000028 },
        { lon: 119.999972, lat: 29.999972 },
      ],
    }, {
      type: 'way',
      id: 412,
      tags: { 'building:part': 'yes', 'building:levels': '5', name: '楼体 B' },
      geometry: [
        { lon: 120.000004, lat: 29.999972 },
        { lon: 120.000028, lat: 29.999972 },
        { lon: 120.000028, lat: 30.000028 },
        { lon: 120.000004, lat: 30.000028 },
        { lon: 120.000004, lat: 29.999972 },
      ],
    }],
  }, focusZone)

  assert.equal(osmBuildings.length, 2)
  assert.deepEqual(osmBuildings.map((building) => building.osmId).sort((left, right) => left - right), [411, 412])
  assert.ok(osmBuildings.every((building) => building.renderKind === 'building-part'))
  assert.ok(osmBuildings.every((building) => building.isBuildingPart))
})

test('OSM building extraction rejects enclosing or oversized footprints', () => {
  const osmBuildings = normalizeOverpassBuildings({
    elements: [{
      type: 'way',
      id: 301,
      tags: { building: 'yes', name: '异常超大建筑' },
      geometry: [
        { lon: 119.998, lat: 29.998 },
        { lon: 120.002, lat: 29.998 },
        { lon: 120.002, lat: 30.002 },
        { lon: 119.998, lat: 30.002 },
        { lon: 119.998, lat: 29.998 },
      ],
    }, {
      type: 'way',
      id: 302,
      tags: { building: 'yes', name: '正常建筑' },
      geometry: [
        { lon: 119.99999, lat: 29.99999 },
        { lon: 120.00001, lat: 29.99999 },
        { lon: 120.00001, lat: 30.00001 },
        { lon: 119.99999, lat: 30.00001 },
        { lon: 119.99999, lat: 29.99999 },
      ],
    }],
  }, focusZone)

  assert.equal(osmBuildings.length, 1)
  assert.equal(osmBuildings[0].osmId, 302)
})

test('focus zone source hash changes when GIS objects change', () => {
  const firstHash = computeFocusZoneSourceHash({ focusZone, objects })
  const secondHash = computeFocusZoneSourceHash({
    focusZone,
    objects: [{ ...objects[0], anchorWgs84: { longitude: 120.00008, latitude: 30, height: 0 } }],
  })

  assert.notEqual(firstHash, secondHash)
})

test('focus zone source hash ignores work zone row timestamp changes', () => {
  const firstHash = computeFocusZoneSourceHash({ focusZone, objects })
  const secondHash = computeFocusZoneSourceHash({
    focusZone: { ...focusZone, updatedAt: '2026-04-16T12:30:00.000Z' },
    objects,
  })

  assert.equal(firstHash, secondHash)
})

test('focus zone import state detects stale saved scenes', () => {
  const scene = buildFocusZoneStudioScene({ focusZone, objects })
  const current = getFocusZoneSceneImportState({ scene, focusZone, objects })
  const stale = getFocusZoneSceneImportState({
    scene,
    focusZone,
    objects: [{ ...objects[0], updatedAt: '2026-04-16T11:00:00.000Z' }],
  })

  assert.equal(current, 'current')
  assert.equal(stale, 'stale')
})

test('empty focus zone still creates an openable boundary scene', () => {
  const scene = buildFocusZoneStudioScene({ focusZone, objects: [] })
  const document = createEditorDocumentFromWarehouseScene(scene)

  assert.equal(document.metadata.sourceObjectCount, 0)
  assert.ok(document.profiles.length >= 1)
  assert.ok(document.solids.some((solid) => solid.metadata?.objectType === 'focus_zone_floor'))
  assert.equal(document.metadata.warnings.length, 0)
})

test('new site project survives bake and first save through its persisted warehouse', () => {
  const projectName = '赛事场地首次保存测试'
  const projectSnapshot = createSiteProjectSnapshot({ name: projectName })
  assert.deepEqual(
    Object.keys(projectSnapshot).sort(),
    Object.keys(createBlankWarehouseScene({ name: projectName, sceneType: 'outdoor-event' })).sort(),
  )

  const normalizedProject = normalizeStudioSnapshot(projectSnapshot, {
    name: projectName,
    sceneType: 'outdoor-event',
    projectType: 'site',
    geoAnchor: { longitude: 120, latitude: 30, height: 0 },
  })
  const projectWarehouse = getStudioHierarchy(normalizedProject).activeWarehouse
  assert.ok(projectWarehouse?.id)

  const bakedScene = buildFocusZoneStudioScene({
    focusZone: {
      ...focusZone,
      snapshotJson: {
        ...focusZone.snapshotJson,
        osmBuildings: { source: 'none', count: 0, buildings: [] },
        siteBake: { status: 'degraded', warnings: ['OSM 建筑不可用'] },
      },
    },
    objects: [],
  })
  const request = buildSiteModeSaveRequest({
    focusZoneId: focusZone.id,
    snapshotJson: bakedScene,
    expectedRevision: 2,
    clientMutationId: 'first-site-save',
  })

  assert.equal(Object.hasOwn(request, 'warehouseId'), false)
  const savedProject = mergeWarehouseSceneIntoSnapshot(
    normalizedProject,
    projectWarehouse.id,
    request.snapshotJson,
  )
  const savedWarehouse = getStudioHierarchy(savedProject).activeWarehouse
  assert.equal(savedWarehouse.id, projectWarehouse.id)
  assert.equal(savedWarehouse.sceneSnapshot.editorDocument.metadata.source, 'gis-focus-zone')
})

test('site mode refresh restores persisted bake state and nested orthophoto', () => {
  const persistedProviderStatus = {
    imagery: { provider: 'xyz', status: 'ready', itemCount: 2, retryable: false },
    terrain: { provider: 'flat', status: 'ready', itemCount: 1, retryable: false },
    buildings: { provider: 'none', status: 'failed', itemCount: 0, retryable: true },
  }
  const hydratedZone = hydrateSiteFocusZone({
    ...focusZone,
    orthophoto: null,
    snapshotJson: {
      ...focusZone.snapshotJson,
      orthophoto: { provider: 'xyz', tiles: [{ x: 1, y: 2, z: 16 }] },
      osmBuildings: { source: 'none', count: 0, buildings: [] },
      siteBake: {
        status: 'degraded',
        providerStatus: persistedProviderStatus,
        warnings: ['OSM 建筑不可用'],
      },
    },
  })
  const presentation = resolveSiteBakePresentation({ focusZone: hydratedZone })

  assert.equal(hydratedZone.orthophoto.provider, 'xyz')
  assert.equal(presentation.providerStatus.imagery.provider, 'xyz')
  assert.equal(presentation.providerStatus.buildings.status, 'failed')
  assert.equal(presentation.bakeStatus, 'degraded')
  assert.deepEqual(presentation.warnings, ['OSM 建筑不可用'])
})

test('site mode fallback does not report source none buildings as ready', () => {
  const hydratedZone = hydrateSiteFocusZone({
    ...focusZone,
    orthophoto: null,
    snapshotJson: {
      ...focusZone.snapshotJson,
      orthophoto: { provider: 'xyz', tiles: [{ x: 1, y: 2, z: 16 }] },
      osmBuildings: { source: 'none', count: 0, buildings: [] },
      siteBake: { providerStatus: {}, warnings: [] },
    },
  })
  const presentation = resolveSiteBakePresentation({ focusZone: hydratedZone })

  assert.equal(presentation.providerStatus.buildings.status, 'unavailable')
  assert.equal(presentation.bakeStatus, 'degraded')
})
