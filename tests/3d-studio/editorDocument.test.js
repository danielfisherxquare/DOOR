import test from 'node:test'
import assert from 'node:assert/strict'

import {
  addOpeningToDocument,
  convertEditorDocumentToLegacyScene,
  createLoftSurfaceInDocument,
  createSweepSurfaceInDocument,
  createEditorDocumentFromWarehouseScene,
  createEmptyEditorDocument,
  deleteSelectionFromDocument,
  deriveWallOpeningHost,
  extrudeProfileInDocument,
  getSketchPlaneElevation,
  insertSketchPath,
  insertRectangleProfile,
  insertArcSegment,
  insertBezierSegment,
  insertCircleProfile,
  insertSketchSegment3D,
  resizeOpeningInDocument,
  resolveOpeningDraft,
  resolveSketchPlaneForSelection,
  moveCurveHandleInDocument,
  moveSelectionInDocument,
  sampleProfile,
  sampleSegment,
  sampleSegment3D,
  sampleSurfaceMesh,
  updateOpeningInDocument,
  updateCurveControlsInDocument,
} from '../../src/3d-studio/model/editorDocument.js'
import { cutWallOpenings } from '../../src/utils/csgUtils.js'
import { projectPointerToVerticalAxis } from '../../src/3d-studio/utils/workbenchPlane.js'
import * as THREE from 'three'

test('closed sketch path creates a profile and closing segment', () => {
  const result = insertSketchPath(createEmptyEditorDocument(), [
    [0, 0],
    [4, 0],
    [4, 3],
    [0, 3],
  ], { close: true, compatType: 'zone', sketchMode: 'line' })

  assert.equal(result.error, null)
  assert.ok(result.profileId)
  assert.equal(result.document.vertices.length, 4)
  assert.equal(result.document.segments.length, 4)
  assert.equal(result.document.profiles.length, 1)
  assert.deepEqual(result.document.profiles[0].vertexIds.length, 4)
})

test('open edge network auto creates a face when the loop closes', () => {
  const firstPass = insertSketchPath(createEmptyEditorDocument(), [
    [0, 0],
    [4, 0],
    [4, 3],
    [0, 3],
  ], { close: false, compatType: 'sketch', sketchMode: 'line' })
  const loopClosure = insertSketchPath(firstPass.document, [
    [0, 3],
    [0, 0],
  ], { close: false, compatType: 'sketch', sketchMode: 'line' })

  assert.equal(firstPass.document.profiles.length, 0)
  assert.equal(loopClosure.document.profiles.length, 1)
  assert.equal(loopClosure.profileIds.length, 1)
  assert.equal(loopClosure.document.segments.length, 4)
})

test('self intersecting sketch is rejected', () => {
  const result = insertSketchPath(createEmptyEditorDocument(), [
    [0, 0],
    [4, 4],
    [0, 4],
    [4, 0],
  ], { close: true, compatType: 'zone', sketchMode: 'line' })

  assert.equal(result.profileId, null)
  assert.equal(result.document.profiles.length, 0)
  assert.match(result.error || '', /自相交/)
})

test('extruded profile exports as legacy structure', () => {
  const sketch = insertSketchPath(createEmptyEditorDocument(), [
    [0, 0],
    [3, 0],
    [3, 2],
    [0, 2],
  ], { close: true, compatType: 'zone', sketchMode: 'rect' })
  const extruded = extrudeProfileInDocument(sketch.document, sketch.profileId, 5.2)
  const legacy = convertEditorDocumentToLegacyScene(extruded, {
    sceneType: 'warehouse',
    name: 'Test Warehouse',
  })

  assert.equal(extruded.solids.length, 1)
  assert.equal(legacy.structures.length, 1)
  assert.equal(legacy.zones.length, 0)
  assert.equal(legacy.structures[0].dimensions.height, 5.2)
})

test('adding a diagonal splits a standalone face into two faces', () => {
  const base = insertSketchPath(createEmptyEditorDocument(), [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
  ], { close: true, compatType: 'zone', sketchMode: 'line' })
  const split = insertSketchPath(base.document, [
    [0, 0],
    [4, 4],
  ], { close: false, compatType: 'sketch', sketchMode: 'line' })

  assert.equal(base.document.profiles.length, 1)
  assert.equal(split.document.profiles.length, 2)
  assert.equal(split.profileIds.length, 2)

  const vertexCounts = split.document.profiles.map((profile) => profile.vertexIds.length).sort((left, right) => left - right)
  assert.deepEqual(vertexCounts, [3, 3])
})

test('adding a diagonal to the middle of an edge splits the edge and creates faces', () => {
  const base = insertSketchPath(createEmptyEditorDocument(), [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
  ], { close: true, compatType: 'zone', sketchMode: 'line' })
  const split = insertSketchPath(base.document, [
    [0, 0],
    [4, 2],
  ], { close: false, compatType: 'sketch', sketchMode: 'line' })

  assert.equal(base.document.profiles.length, 1)
  assert.equal(split.document.profiles.length, 2)
  assert.equal(split.profileIds.length, 2)
  assert.ok(split.document.vertices.some((vertex) => Math.abs(vertex.x - 4) < 0.001 && Math.abs(vertex.z - 2) < 0.001))

  const vertexCounts = split.document.profiles.map((profile) => profile.vertexIds.length).sort((left, right) => left - right)
  assert.deepEqual(vertexCounts, [3, 4])
})

test('diagonal across legacy wall boundary creates an implied floor split', () => {
  const wallScene = {
    walls: [
      { id: 'north', start: { x: 0, z: 0 }, end: { x: 6, z: 0 }, thickness: 0.2, height: 3 },
      { id: 'east', start: { x: 6, z: 0 }, end: { x: 6, z: 4 }, thickness: 0.2, height: 3 },
      { id: 'south', start: { x: 6, z: 4 }, end: { x: 0, z: 4 }, thickness: 0.2, height: 3 },
      { id: 'west', start: { x: 0, z: 4 }, end: { x: 0, z: 0 }, thickness: 0.2, height: 3 },
    ],
  }
  const base = createEditorDocumentFromWarehouseScene(wallScene)
  const split = insertSketchPath(base, [
    [-0.1, -0.1],
    [6.1, 2],
  ], { close: false, compatType: 'sketch', sketchMode: 'line' })

  assert.equal(base.profiles.length, 4)
  assert.equal(split.document.profiles.length, 6)
  assert.equal(split.profileIds.length, 2)

  const createdProfiles = split.document.profiles.filter((profile) => split.profileIds.includes(profile.id))
  assert.equal(createdProfiles.length, 2)
  assert.ok(createdProfiles.every((profile) => profile.metadata?.autoCreatedFromWallBoundary))

  const legacy = convertEditorDocumentToLegacyScene(split.document)
  const autoZones = legacy.zones.filter((zone) => zone.metadata?.autoCreatedFromWallBoundary)
  assert.equal(autoZones.length, 2)
  assert.ok(autoZones.every((zone) => zone.zone_type === 'auto_floor_split'))
})

test('implied wall boundary split does not fabricate floors for L shaped walls', () => {
  const wallScene = {
    walls: [
      { id: 'a', start: { x: 0, z: 0 }, end: { x: 6, z: 0 }, thickness: 0.2, height: 3 },
      { id: 'b', start: { x: 6, z: 0 }, end: { x: 6, z: 2 }, thickness: 0.2, height: 3 },
      { id: 'c', start: { x: 6, z: 2 }, end: { x: 3, z: 2 }, thickness: 0.2, height: 3 },
      { id: 'd', start: { x: 3, z: 2 }, end: { x: 3, z: 5 }, thickness: 0.2, height: 3 },
      { id: 'e', start: { x: 3, z: 5 }, end: { x: 0, z: 5 }, thickness: 0.2, height: 3 },
      { id: 'f', start: { x: 0, z: 5 }, end: { x: 0, z: 0 }, thickness: 0.2, height: 3 },
    ],
  }
  const base = createEditorDocumentFromWarehouseScene(wallScene)
  const split = insertSketchPath(base, [
    [-0.1, -0.1],
    [6.1, 4.9],
  ], { close: false, compatType: 'sketch', sketchMode: 'line' })

  assert.equal(base.profiles.length, 6)
  assert.equal(split.profileIds.length, 0)
  assert.equal(split.document.profiles.filter((profile) => profile.metadata?.autoCreatedFromWallBoundary).length, 0)
})

test('extruding an auto floor split keeps source metadata on the solid export', () => {
  const wallScene = {
    walls: [
      { id: 'north', start: { x: 0, z: 0 }, end: { x: 6, z: 0 }, thickness: 0.2, height: 3 },
      { id: 'east', start: { x: 6, z: 0 }, end: { x: 6, z: 4 }, thickness: 0.2, height: 3 },
      { id: 'south', start: { x: 6, z: 4 }, end: { x: 0, z: 4 }, thickness: 0.2, height: 3 },
      { id: 'west', start: { x: 0, z: 4 }, end: { x: 0, z: 0 }, thickness: 0.2, height: 3 },
    ],
  }
  const split = insertSketchPath(createEditorDocumentFromWarehouseScene(wallScene), [
    [-0.1, -0.1],
    [6.1, 2],
  ], { close: false, compatType: 'sketch', sketchMode: 'line' })
  const extruded = extrudeProfileInDocument(split.document, split.profileIds[0], 1.5)
  const solid = extruded.solids.find((item) => item.profileId === split.profileIds[0])
  const legacy = convertEditorDocumentToLegacyScene(extruded)
  const structure = legacy.structures.find((item) => item.id === solid.id)

  assert.ok(solid.metadata.autoCreatedFromWallBoundary)
  assert.equal(structure.type, 'block')
  assert.ok(structure.metadata.autoCreatedFromWallBoundary)
})

test('profiles can be sketched on an elevated plane and extrude from that elevation', () => {
  const elevated = insertRectangleProfile(createEmptyEditorDocument(), [1, 1], [3, 2], {
    plane: {
      id: 'plane-mezzanine',
      name: 'Mezzanine',
      origin: [0, 4.2, 0],
    },
  })
  const extruded = extrudeProfileInDocument(elevated.document, elevated.profileId, 2.4)
  const profile = extruded.profiles.find((item) => item.id === elevated.profileId)
  const solid = extruded.solids[0]

  assert.equal(getSketchPlaneElevation(extruded, 'plane-mezzanine'), 4.2)
  assert.equal(profile.planeId, 'plane-mezzanine')
  assert.equal(solid.baseElevation, 4.2)
  assert.equal(solid.height, 2.4)
})

test('face selection resolves sketch plane to solid top elevation', () => {
  const base = insertRectangleProfile(createEmptyEditorDocument(), [0, 0], [2, 2])
  const extruded = extrudeProfileInDocument(base.document, base.profileId, 3.5)
  const plane = resolveSketchPlaneForSelection(extruded, {
    kind: 'face',
    entityId: base.profileId,
    meta: { entityType: 'profile', solidId: extruded.solids[0].id, profileId: base.profileId },
  })

  assert.equal(plane.kind, 'solid-top')
  assert.equal(plane.origin[1], 3.5)
})

test('side face selection resolves a vertical sketch plane and creates side profiles in world space', () => {
  const baseProfile = insertRectangleProfile(createEmptyEditorDocument(), [0, 0], [4, 2], { compatType: 'zone' })
  const extruded = extrudeProfileInDocument(baseProfile.document, baseProfile.profileId, 3)
  const solid = extruded.solids[0]
  const sidePlane = resolveSketchPlaneForSelection(extruded, {
    kind: 'face',
    entityId: solid.id,
    label: '侧面',
    meta: {
      entityType: 'solid-face',
      solidId: solid.id,
      profileId: baseProfile.profileId,
      faceKind: 'side',
      hitPoint: [4, 1.5, 1],
      normal: [1, 0, 0],
    },
  })
  const result = insertSketchPath(extruded, [
    [0, 0.2],
    [1.2, 0.2],
    [1.2, 1.4],
    [0, 1.4],
  ], { close: true, compatType: 'zone', sketchMode: 'line', plane: sidePlane })
  const profile = result.document.profiles.find((item) => item.id === result.profileId)
  const vertices = profile.vertexIds.map((vertexId) => result.document.vertices.find((vertex) => vertex.id === vertexId))

  assert.equal(sidePlane.kind, 'solid-side')
  assert.equal(profile.planeId, sidePlane.id)
  assert.deepEqual(sampleProfile(result.document, result.profileId), [[0, 0.2], [1.2, 0.2], [1.2, 1.4], [0, 1.4]])
  assert.ok(vertices.every((vertex) => Math.abs(vertex.x - 4) < 0.001))
  assert.ok(vertices.some((vertex) => Math.abs(vertex.y - 2.9) < 0.001))

  const pushed = extrudeProfileInDocument(result.document, result.profileId, 0.5)
  const sideSolid = pushed.solids.find((item) => item.profileId === result.profileId)
  const legacy = convertEditorDocumentToLegacyScene(pushed)
  const structure = legacy.structures.find((item) => item.id === sideSolid.id)

  assert.equal(sideSolid.metadata.extrudeMode, 'plane-normal')
  assert.deepEqual(sideSolid.metadata.extrudePlane.normal, [1, 0, 0])
  assert.equal(structure.dimensions.width, 0.5)
  assert.equal(structure.dimensions.height, 1.2)
  assert.equal(structure.dimensions.depth, 1.2)
})

test('side-plane curves sample into world space for rendering and snapping', () => {
  const baseProfile = insertRectangleProfile(createEmptyEditorDocument(), [0, 0], [4, 2], { compatType: 'zone' })
  const extruded = extrudeProfileInDocument(baseProfile.document, baseProfile.profileId, 3)
  const solid = extruded.solids[0]
  const sidePlane = resolveSketchPlaneForSelection(extruded, {
    kind: 'face',
    entityId: solid.id,
    label: '侧面',
    meta: {
      entityType: 'solid-face',
      solidId: solid.id,
      profileId: baseProfile.profileId,
      faceKind: 'side',
      hitPoint: [4, 1.5, 1],
      normal: [1, 0, 0],
    },
  })
  const result = insertArcSegment(extruded, [0, 0.2], [0.6, 1.4], [1.2, 0.2], { compatType: 'sketch', plane: sidePlane })
  const segment = result.document.segments.find((item) => item.id === result.segmentId)
  const sampled = sampleSegment3D(result.document, segment)

  assert.equal(segment.planeId, sidePlane.id)
  assert.ok(sampled.length > 2)
  assert.ok(sampled.every((point) => Math.abs(point[0] - 4) < 0.001))
  assert.ok(sampled.some((point) => point[1] > 2))
  assert.ok(sampled.some((point) => Math.abs(point[2] - 0.4) < 0.001))
})

test('rectangular extruded solids expose a wall opening host and support openings', () => {
  const base = insertRectangleProfile(createEmptyEditorDocument(), [0, 0], [6, 0.24])
  const extruded = extrudeProfileInDocument(base.document, base.profileId, 3.6)
  const host = deriveWallOpeningHost(extruded, extruded.solids[0].id)
  const openingResult = addOpeningToDocument(extruded, extruded.solids[0].id, {
    type: 'door',
    point: [3, 1, 0.12],
  })

  assert.ok(host)
  assert.equal(host.length, 6)
  assert.equal(host.thickness, 0.24)
  assert.equal(openingResult.error, null)
  assert.equal(openingResult.document.openings.length, 1)
  assert.equal(openingResult.document.openings[0].solidId, extruded.solids[0].id)
})

test('opening draft resolves side-face point into offset and elevation', () => {
  const base = insertRectangleProfile(createEmptyEditorDocument(), [0, 0], [6, 0.24])
  const extruded = extrudeProfileInDocument(base.document, base.profileId, 3.6)
  const draft = resolveOpeningDraft(extruded, extruded.solids[0].id, {
    type: 'window',
    point: [2.5, 2.1, 0.12],
  })
  const host = deriveWallOpeningHost(extruded, extruded.solids[0].id)
  const projectedX = host.start[0] + Math.cos(host.angle) * draft.opening.offset
  const projectedZ = host.start[1] + Math.sin(host.angle) * draft.opening.offset

  assert.equal(draft.error, null)
  assert.equal(draft.opening.type, 'window')
  assert.ok(Math.abs(projectedX - 2.5) < 0.001)
  assert.ok(Math.abs(projectedZ - 0.12) < 0.001)
  assert.equal(draft.opening.elevation, 1.5)
})

test('existing openings can be repositioned and resized through update API', () => {
  const base = insertRectangleProfile(createEmptyEditorDocument(), [0, 0], [6, 0.24])
  const extruded = extrudeProfileInDocument(base.document, base.profileId, 3.6)
  const created = addOpeningToDocument(extruded, extruded.solids[0].id, {
    type: 'door',
    point: [3, 1.05, 0.12],
  })
  const updated = updateOpeningInDocument(created.document, created.opening.id, {
    width: 1.4,
    height: 2.3,
    point: [1.5, 1.35, 0.12],
    source: 'test-update',
  })
  const host = deriveWallOpeningHost(updated.document, extruded.solids[0].id)
  const projectedX = host.start[0] + Math.cos(host.angle) * updated.opening.offset

  assert.equal(updated.error, null)
  assert.equal(updated.opening.width, 1.4)
  assert.equal(updated.opening.height, 2.3)
  assert.ok(Math.abs(projectedX - 1.5) < 0.001)
  assert.equal(updated.opening.metadata.source, 'test-update')
})

test('opening resize handles update width and vertical bounds', () => {
  const base = insertRectangleProfile(createEmptyEditorDocument(), [0, 0], [6, 0.24])
  const extruded = extrudeProfileInDocument(base.document, base.profileId, 3.6)
  const created = addOpeningToDocument(extruded, extruded.solids[0].id, {
    type: 'window',
    point: [3, 1.5, 0.12],
  })
  const widened = resizeOpeningInDocument(created.document, created.opening.id, 'right', [1, 1.5, 0.12], {
    source: 'right-handle',
  })
  const lowered = resizeOpeningInDocument(widened.document, created.opening.id, 'bottom', [3, 0.8, 0.12], {
    source: 'bottom-handle',
  })

  assert.equal(widened.error, null)
  assert.equal(widened.opening.width, 2.8)
  assert.equal(widened.opening.metadata.source, 'right-handle')
  assert.equal(lowered.error, null)
  assert.equal(lowered.opening.elevation, 0.8)
  assert.equal(lowered.opening.height, 1.3)
})

test('legacy walls migrate into v2 solids and compat export back to walls', () => {
  const migrated = createEditorDocumentFromWarehouseScene({
    warehouse: {
      id: 'wh-1',
      name: '旧仓库',
      dimensions_mm: { width_mm: 12000, depth_mm: 8000, height_mm: 4500 },
    },
    walls: [
      {
        id: 'wall-a',
        start: { x: 0, z: 0 },
        end: { x: 6, z: 0 },
        height: 3.6,
        thickness: 0.24,
      },
    ],
    zones: [],
    lines: [],
    prefabs: [],
    racks: [],
    structures: [],
  })
  const legacy = convertEditorDocumentToLegacyScene(migrated, {
    warehouse: {
      id: 'wh-1',
      name: '旧仓库',
      dimensions_mm: { width_mm: 12000, depth_mm: 8000, height_mm: 4500 },
    },
    sceneType: 'warehouse',
  })

  assert.equal(migrated.profiles.length, 1)
  assert.equal(migrated.solids.length, 1)
  assert.equal(legacy.walls.length, 1)
  assert.equal(legacy.walls[0].height, 3.6)
  assert.equal(legacy.walls[0].thickness, 0.24)
})

test('wall openings export back to legacy walls', () => {
  const migrated = createEditorDocumentFromWarehouseScene({
    warehouse: {
      id: 'wh-2',
      name: '带门洞仓库',
      dimensions_mm: { width_mm: 12000, depth_mm: 8000, height_mm: 4500 },
    },
    walls: [
      {
        id: 'wall-b',
        start: { x: 0, z: 0 },
        end: { x: 8, z: 0 },
        height: 3.6,
        thickness: 0.24,
      },
    ],
    zones: [],
    lines: [],
    prefabs: [],
    racks: [],
    structures: [],
  })
  const wallSolid = migrated.solids[0]
  const withOpening = addOpeningToDocument(migrated, wallSolid.id, {
    type: 'door',
    point: [4, 1, 0],
  })
  const legacy = convertEditorDocumentToLegacyScene(withOpening.document, {
    warehouse: {
      id: 'wh-2',
      name: '带门洞仓库',
      dimensions_mm: { width_mm: 12000, depth_mm: 8000, height_mm: 4500 },
    },
    sceneType: 'warehouse',
  })

  assert.equal(withOpening.error, null)
  assert.equal(legacy.walls.length, 1)
  assert.equal(legacy.walls[0].openings.length, 1)
  assert.equal(legacy.walls[0].openings[0].type, 'door')
})

test('wall opening CSG returns geometry without evaluator API errors', () => {
  const geometry = cutWallOpenings({
    length: 8,
    height: 3.6,
    thickness: 0.24,
  }, [
    {
      position: 0.5,
      width: 1.2,
      height: 2.1,
      sillHeight: 0,
    },
  ])

  geometry.computeBoundingBox()

  assert.ok(geometry.attributes.position)
  assert.ok(geometry.attributes.position.count > 0)
  assert.ok(geometry.boundingBox)
})

test('3d sketch segment supports vertical axis line', () => {
  const result = insertSketchSegment3D(createEmptyEditorDocument(), [1, 0, 1], [1, 2.5, 1], {
    axisLock: 'vertical',
  })
  const [start, end] = result.document.vertices

  assert.equal(result.error, null)
  assert.equal(result.document.segments.length, 1)
  assert.equal(start.x, end.x)
  assert.equal(start.z, end.z)
  assert.equal(end.y, 2.5)
})

test('vertical 3d sketch segment preserves y in 3d sampling and legacy export', () => {
  const result = insertSketchSegment3D(createEmptyEditorDocument(), [1, 0, 1], [1, 4, 1], {
    axisLock: 'vertical',
  })
  const segment = result.document.segments.find((item) => item.id === result.segmentId)
  const sampled = sampleSegment3D(result.document, segment)
  const legacy = convertEditorDocumentToLegacyScene(result.document)

  assert.deepEqual(sampled, [[1, 0, 1], [1, 4, 1]])
  assert.equal(legacy.lines.length, 1)
  assert.deepEqual(legacy.lines[0].start, { x: 1, y: 0, z: 1 })
  assert.deepEqual(legacy.lines[0].end, { x: 1, y: 4, z: 1 })
  assert.equal(legacy.lines[0].metadata.is3D, true)
})

test('vertical axis pointer projection follows camera ray instead of fixed pixel scale', () => {
  const camera = new THREE.PerspectiveCamera(45, 800 / 600, 0.1, 100)
  camera.position.set(6, 6, 6)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  camera.updateProjectionMatrix()
  const raycaster = new THREE.Raycaster()
  const domElement = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  }
  const origin = [1, 0, 1]
  const originScreen = new THREE.Vector3(origin[0], origin[1], origin[2]).project(camera)
  const clientX = ((originScreen.x + 1) / 2) * 800
  const clientY = ((-originScreen.y + 1) / 2) * 600
  const projected = projectPointerToVerticalAxis({
    event: { clientX, clientY: clientY - 120 },
    camera,
    domElement,
    raycaster,
    origin,
    snapDisabled: true,
  })

  assert.equal(projected.axisLock, 'vertical')
  assert.equal(projected.snapped[0], 1)
  assert.equal(projected.snapped[2], 1)
  assert.ok(projected.snapped[1] > 1)
  assert.equal(projected.degenerate, false)
})

test('move selection accepts vertical delta for z-axis move lock', () => {
  const created = insertSketchSegment3D(createEmptyEditorDocument(), [1, 0, 1], [1, 2, 1])
  const segment = created.document.segments.find((item) => item.id === created.segmentId)
  const moved = moveSelectionInDocument(created.document, {
    kind: 'vertex',
    entityId: segment.endVertexId,
    meta: { entityType: 'vertex' },
  }, [0, 1.25, 0])
  const vertex = moved.vertices.find((item) => item.id === segment.endVertexId)

  assert.equal(vertex.x, 1)
  assert.equal(vertex.y, 3.25)
  assert.equal(vertex.z, 1)
})

test('delete selection removes selected solid and dependent opening', () => {
  const base = insertRectangleProfile(createEmptyEditorDocument(), [0, 0], [6, 0.24])
  const extruded = extrudeProfileInDocument(base.document, base.profileId, 3.6)
  const created = addOpeningToDocument(extruded, extruded.solids[0].id, {
    type: 'door',
    point: [3, 1, 0.12],
  })
  const deleted = deleteSelectionFromDocument(created.document, {
    kind: 'object',
    entityId: extruded.solids[0].id,
    label: '墙体',
    meta: { entityType: 'solid', solidId: extruded.solids[0].id, profileId: base.profileId },
  })

  assert.equal(deleted.document.solids.length, 0)
  assert.equal(deleted.document.profiles.length, 0)
  assert.equal(deleted.document.openings.length, 0)
  assert.ok(deleted.deletedCount > 0)
})

test('arc segment stores curve data and samples into multiple points', () => {
  const result = insertArcSegment(createEmptyEditorDocument(), [0, 0], [1, 1], [2, 0])
  const segment = result.document.segments.find((item) => item.id === result.segmentId)
  const sampled = sampleSegment(result.document, segment)

  assert.equal(result.error, null)
  assert.equal(segment.kind, 'arc')
  assert.deepEqual(segment.metadata.curve.mid, [1, 1])
  assert.ok(sampled.length > 3)
})

test('arc plus chord auto closes into a sampled curved profile', () => {
  const chord = insertSketchPath(createEmptyEditorDocument(), [
    [0, 0],
    [2, 0],
  ], { close: false, compatType: 'sketch', sketchMode: 'line' })
  const arc = insertArcSegment(chord.document, [2, 0], [1, 1], [0, 0])
  const profile = arc.document.profiles.find((item) => item.id === arc.profileId)
  const sampled = sampleProfile(arc.document, arc.profileId)

  assert.equal(arc.error, null)
  assert.ok(profile)
  assert.equal(profile.vertexIds.length, 2)
  assert.equal(profile.segmentIds.length, 2)
  assert.equal(profile.segmentIds.includes(arc.segmentId), true)
  assert.ok(sampled.length > 4)
  assert.ok(Math.max(...sampled.map((point) => point[1])) > 0.5)
})

test('bezier plus chord auto closes into a sampled curved profile', () => {
  const chord = insertSketchPath(createEmptyEditorDocument(), [
    [0, 0],
    [4, 0],
  ], { close: false, compatType: 'sketch', sketchMode: 'line' })
  const curve = insertBezierSegment(chord.document, [4, 0], [3, 2], [1, 2], [0, 0])
  const profile = curve.document.profiles.find((item) => item.id === curve.profileId)
  const sampled = sampleProfile(curve.document, curve.profileId)

  assert.equal(curve.error, null)
  assert.ok(profile)
  assert.equal(profile.vertexIds.length, 2)
  assert.equal(profile.segmentIds.length, 2)
  assert.equal(profile.segmentIds.includes(curve.segmentId), true)
  assert.ok(sampled.length > 8)
  assert.ok(Math.max(...sampled.map((point) => point[1])) > 1)
})

test('line ending on arc middle splits the curve and creates a face', () => {
  const chord = insertSketchPath(createEmptyEditorDocument(), [
    [0, 0],
    [4, 0],
  ], { close: false, compatType: 'sketch', sketchMode: 'line' })
  const arc = insertArcSegment(chord.document, [0, 0], [2, 2], [4, 0], { compatType: 'sketch' })
  const split = insertSketchPath(arc.document, [
    [2, 0],
    [2, 2],
  ], { close: false, compatType: 'sketch', sketchMode: 'line', edgeSnapTolerance: 0.5 })
  const arcSegments = split.document.segments.filter((segment) => segment.kind === 'arc')
  const createdProfiles = split.document.profiles.filter((profile) => split.profileIds.includes(profile.id))

  assert.equal(arcSegments.length, 2)
  assert.equal(split.profileIds.length, 2)
  assert.deepEqual(createdProfiles.map((profile) => profile.segmentIds.length), [3, 3])
})

test('line ending on bezier middle splits the curve and creates a face', () => {
  const chord = insertSketchPath(createEmptyEditorDocument(), [
    [0, 0],
    [4, 0],
  ], { close: false, compatType: 'sketch', sketchMode: 'line' })
  const bezier = insertBezierSegment(chord.document, [0, 0], [1, 2], [3, 2], [4, 0], { compatType: 'sketch' })
  const split = insertSketchPath(bezier.document, [
    [2, 0],
    [2, 1.5],
  ], { close: false, compatType: 'sketch', sketchMode: 'line', edgeSnapTolerance: 0.5 })
  const bezierSegments = split.document.segments.filter((segment) => segment.kind === 'bezier')
  const createdProfiles = split.document.profiles.filter((profile) => split.profileIds.includes(profile.id))

  assert.equal(bezierSegments.length, 2)
  assert.equal(split.profileIds.length, 2)
  assert.deepEqual(createdProfiles.map((profile) => profile.segmentIds.length), [3, 3])
})

test('circle profile is built from four arc segments and can be extruded', () => {
  const circle = insertCircleProfile(createEmptyEditorDocument(), [0, 0], [2, 0])
  const sampled = sampleProfile(circle.document, circle.profileId)
  const extruded = extrudeProfileInDocument(circle.document, circle.profileId, 4)
  const legacy = convertEditorDocumentToLegacyScene(extruded)

  assert.equal(circle.error, null)
  assert.equal(circle.document.segments.length, 4)
  assert.equal(circle.document.segments.every((segment) => segment.kind === 'arc'), true)
  assert.ok(sampled.length > 16)
  assert.equal(extruded.solids.length, 1)
  assert.equal(legacy.structures.length, 1)
})

test('bezier curve stores controls, updates controls, and legacy export is sampled', () => {
  const created = insertBezierSegment(createEmptyEditorDocument(), [0, 0], [1, 2], [3, 2], [4, 0])
  const updated = updateCurveControlsInDocument(created.document, created.segmentId, { control1: [1.5, 2.5] })
  const segment = updated.document.segments.find((item) => item.id === created.segmentId)
  const legacy = convertEditorDocumentToLegacyScene(updated.document)

  assert.equal(created.error, null)
  assert.equal(updated.error, null)
  assert.equal(segment.kind, 'bezier')
  assert.deepEqual(segment.metadata.curve.control1, [1.5, 2.5])
  assert.ok(legacy.lines.length > 1)
  assert.equal(legacy.lines[0].metadata.curveKind, 'bezier')
})

test('curve endpoint handle moves the connected vertex', () => {
  const created = insertBezierSegment(createEmptyEditorDocument(), [0, 0], [1, 2], [3, 2], [4, 0])
  const moved = moveCurveHandleInDocument(created.document, created.segmentId, 'start', [-1, 0.5])
  const segment = moved.document.segments.find((item) => item.id === created.segmentId)
  const startVertex = moved.document.vertices.find((item) => item.id === segment.startVertexId)
  const sampled = sampleSegment(moved.document, segment)

  assert.equal(moved.error, null)
  assert.deepEqual([startVertex.x, startVertex.z], [-1, 0.5])
  assert.deepEqual(sampled[0], [-1, 0.5])
})

test('sweep and loft surfaces create renderable mesh data', () => {
  const profile = insertRectangleProfile(createEmptyEditorDocument(), [0, 0], [1, 1])
  const path = insertArcSegment(profile.document, [2, 0], [3, 1], [4, 0])
  const sweep = createSweepSurfaceInDocument(path.document, profile.profileId, [path.segmentId])
  const secondProfile = insertCircleProfile(sweep.document, [6, 0], [7, 0])
  const loft = createLoftSurfaceInDocument(secondProfile.document, [profile.profileId, secondProfile.profileId])
  const sweepMesh = sampleSurfaceMesh(loft.document, sweep.surfaceId)
  const loftMesh = sampleSurfaceMesh(loft.document, loft.surfaceId)
  const legacy = convertEditorDocumentToLegacyScene(loft.document)

  assert.equal(sweep.error, null)
  assert.equal(loft.error, null)
  assert.equal(loft.document.surfaces.length, 2)
  assert.ok(sweepMesh.vertices.length > 0)
  assert.ok(sweepMesh.indices.length > 0)
  assert.ok(loftMesh.vertices.length > 0)
  assert.ok(loftMesh.indices.length > 0)
  assert.equal(legacy.structures.filter((item) => item.type.endsWith('-surface')).length, 2)
})
