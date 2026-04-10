import { useMemo } from 'react'
import * as THREE from 'three'
import { cutWallOpenings } from '../../utils/csgUtils'
import { deriveWallOpeningHost, getSketchPlaneById, getSketchPlaneElevation, localPointToWorld, normalizeEditorDocument, resolveOpeningPose, sampleProfile, sampleSegment3D, sampleSurfaceMesh, worldPointToLocal } from '../model/editorDocument'
import useEditor, { TOOL_TYPES } from '../store/useEditor'

const FACE_FILL = '#5b7bb2'
const FACE_SELECTED = '#1d4ed8'
const SOLID_FILL = '#d8dee8'
const SOLID_SELECTED = '#8fb4ff'
const EDGE_COLOR = '#28405f'
const EDGE_SELECTED = '#f59e0b'
const VERTEX_COLOR = '#f8fafc'
const VERTEX_SELECTED = '#f59e0b'
const INSTANCE_FILL = '#8b9bb0'
const INSTANCE_SELECTED = '#3767cf'
const HANDLE_COLOR = '#fef3c7'
const PUSHPULL_PREVIEW_COLOR = '#60a5fa'

function buildLookup(document) {
  return new Map(document.vertices.map((vertex) => [vertex.id, vertex]))
}

function buildProfileShape(document, profile, vertexLookup) {
  const sampled = sampleProfile(document, profile.id)
  const points = sampled.length ? sampled.map((point) => ({ x: point[0], z: point[1] })) : profile.vertexIds.map((vertexId) => vertexLookup.get(vertexId)).filter(Boolean)
  if (points.length < 3) return null
  const shape = new THREE.Shape()
  shape.moveTo(points[0].x, points[0].z)
  for (let index = 1; index < points.length; index += 1) {
    shape.lineTo(points[index].x, points[index].z)
  }
  shape.closePath()
  return shape
}

function faceGeometry(shape, elevation = 0.04, plane = null) {
  const geometry = new THREE.ShapeGeometry(shape)
  if (plane && plane.kind !== 'ground') {
    const position = geometry.getAttribute('position')
    const next = new Float32Array(position.count * 3)
    for (let index = 0; index < position.count; index += 1) {
      const world = localPointToWorld(plane, [position.getX(index), position.getY(index)], 0.04)
      next[index * 3] = world[0]
      next[index * 3 + 1] = world[1]
      next[index * 3 + 2] = world[2]
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(next, 3))
    geometry.computeVertexNormals()
    return geometry
  }
  geometry.rotateX(Math.PI / 2)
  geometry.translate(0, elevation, 0)
  return geometry
}

function normalExtrudedGeometry(document, profile, solid, plane) {
  const points = sampleProfile(document, profile.id)
  if (points.length < 3) return null
  const capPoints = points.map((point) => new THREE.Vector2(point[0], point[1]))
  const triangles = THREE.ShapeUtils.triangulateShape(capPoints, [])
  const depth = Math.max(Number(solid?.height) || 0.1, 0.1)
  const vertices = []
  points.forEach((point) => vertices.push(localPointToWorld(plane, point, 0)))
  points.forEach((point) => vertices.push(localPointToWorld(plane, point, depth)))

  const indices = []
  triangles.forEach((triangle) => {
    indices.push(triangle[2], triangle[1], triangle[0])
    indices.push(triangle[0] + points.length, triangle[1] + points.length, triangle[2] + points.length)
  })
  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length
    indices.push(index, next, next + points.length, index, next + points.length, index + points.length)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flat(), 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function extrudedGeometry(shape, solid, document, profile, plane) {
  if (solid?.metadata?.extrudeMode === 'plane-normal' && plane) {
    return normalExtrudedGeometry(document, profile, solid, plane)
  }
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(Number(solid?.height) || 0.1, 0.1),
    bevelEnabled: false,
    steps: 1,
  })
  geometry.rotateX(Math.PI / 2)
  geometry.translate(0, solid.baseElevation + solid.height, 0)
  return geometry
}

function worldNormalFromEvent(event) {
  const face = event?.face
  const object = event?.object
  if (!face || !object) return new THREE.Vector3(0, 1, 0)
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(object.matrixWorld)
  return face.normal.clone().applyMatrix3(normalMatrix).normalize()
}

function wallGeometryWithOpenings(host, openings) {
  const geometry = cutWallOpenings({
    length: host.length,
    height: host.height,
    thickness: host.thickness,
  }, openings.map((opening) => ({
    position: opening.offset / host.length,
    width: opening.width,
    height: opening.height,
    sillHeight: opening.elevation,
  })))

  geometry.computeVertexNormals()
  return geometry
}

function openingPreviewPose(host, opening) {
  const pose = resolveOpeningPose(host, opening)
  if (!pose) return null
  return {
    position: pose.center,
    rotation: pose.rotation,
    size: pose.size,
    faceNormal: pose.faceNormal,
  }
}

function SegmentLine({ document, segment, vertexLookup, selected, onSelect }) {
  const geometry = useMemo(() => {
    const start = vertexLookup.get(segment.startVertexId)
    const end = vertexLookup.get(segment.endVertexId)
    if (!start || !end) return null
    const sampled = sampleSegment3D(document, segment)
    const points = sampled.length ? sampled.map((point) => [point[0], point[1] + 0.06, point[2]]) : []
    const nextGeometry = new THREE.BufferGeometry()
    nextGeometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3))
    return nextGeometry
  }, [document, segment, vertexLookup])

  const hit = useMemo(() => {
    const start = vertexLookup.get(segment.startVertexId)
    const end = vertexLookup.get(segment.endVertexId)
    if (!start || !end) return null
    const dx = end.x - start.x
    const dy = end.y - start.y
    const dz = end.z - start.z
    const groundLength = Math.hypot(dx, dz)
    const vertical = Math.abs(dy) > groundLength
    const length = Math.max(vertical ? Math.abs(dy) : groundLength, 0.01)
    return {
      position: [(start.x + end.x) / 2, ((start.y + end.y) / 2) + 0.08, (start.z + end.z) / 2],
      rotation: [0, -Math.atan2(dz, dx), 0],
      args: vertical ? [0.28, length, 0.28] : [length, 0.18, 0.28],
      length,
    }
  }, [segment, vertexLookup])

  if (!geometry || !hit) return null

  return (
    <group>
      <line geometry={geometry}>
        <lineBasicMaterial color={selected ? EDGE_SELECTED : EDGE_COLOR} depthTest={false} transparent opacity={1} />
      </line>
      <mesh onPointerDown={(event) => { event.stopPropagation(); onSelect() }} position={hit.position} rotation={hit.rotation}>
        <boxGeometry args={hit.args} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </group>
  )
}

function BatchedSegmentLines({ segments, vertexLookup }) {
  const geometry = useMemo(() => {
    const positions = []
    segments.forEach((segment) => {
      const start = vertexLookup.get(segment.startVertexId)
      const end = vertexLookup.get(segment.endVertexId)
      if (!start || !end) return
      positions.push(start.x, start.y + 0.06, start.z, end.x, end.y + 0.06, end.z)
    })
    if (!positions.length) return null
    const nextGeometry = new THREE.BufferGeometry()
    nextGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return nextGeometry
  }, [segments, vertexLookup])

  if (!geometry) return null
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={EDGE_COLOR} depthTest={false} transparent opacity={0.6} />
    </lineSegments>
  )
}

function VertexHandle({ vertex, selected, onSelect, visible = true }) {
  if (!visible) return null
  return (
    <mesh onPointerDown={(event) => { event.stopPropagation(); onSelect() }} position={[vertex.x, vertex.y + 0.08, vertex.z]}>
      <sphereGeometry args={[selected ? 0.1 : 0.075, 14, 14]} />
      <meshBasicMaterial color={selected ? VERTEX_SELECTED : VERTEX_COLOR} depthTest={false} />
    </mesh>
  )
}

function CurveControlHandles({ document, segment, vertexLookup, visible, onSelect }) {
  if (!visible || !['arc', 'bezier'].includes(segment.kind)) return null
  const start = vertexLookup.get(segment.startVertexId)
  const end = vertexLookup.get(segment.endVertexId)
  if (!start || !end) return null
  const plane = getSketchPlaneById(document, segment.planeId || segment.metadata?.planeId || 'plane-ground')
  const curve = segment.metadata?.curve || {}
  const handles = [
    { id: 'start', point: worldPointToLocal(plane, [start.x, start.y, start.z]), endpoint: true },
    ...(segment.kind === 'arc'
      ? [{ id: 'mid', point: curve.mid }]
      : [{ id: 'control1', point: curve.control1 }, { id: 'control2', point: curve.control2 }]),
    { id: 'end', point: worldPointToLocal(plane, [end.x, end.y, end.z]), endpoint: true },
  ].map((handle) => {
    return Array.isArray(handle.point) ? { ...handle, worldPoint: localPointToWorld(plane, handle.point, 0.12) } : handle
  })
  return (
    <group>
      {handles.filter((handle) => Array.isArray(handle.worldPoint)).map((handle) => (
        <mesh
          key={handle.id}
          onPointerDown={(event) => { event.stopPropagation(); onSelect(handle.id, event) }}
          position={handle.worldPoint}
          renderOrder={12}
        >
          <sphereGeometry args={[0.2, 18, 18]} />
          <meshBasicMaterial color={handle.endpoint ? '#f59e0b' : '#38bdf8'} depthTest={false} />
        </mesh>
      ))}
      {handles.filter((handle) => Array.isArray(handle.worldPoint)).map((handle) => (
        <mesh
          key={`${handle.id}-hit`}
          onPointerDown={(event) => { event.stopPropagation(); onSelect(handle.id, event) }}
          position={handle.worldPoint}
          renderOrder={13}
        >
          <sphereGeometry args={[0.42, 12, 12]} />
          <meshBasicMaterial color="#38bdf8" depthTest={false} opacity={0} transparent />
        </mesh>
      ))}
    </group>
  )
}

function ProfileFace({ document, profile, vertexLookup, selected, onSelect, elevation, plane, selectionMode, selectionLocked }) {
  const shape = useMemo(() => buildProfileShape(document, profile, vertexLookup), [document, profile, vertexLookup])
  const geometry = useMemo(() => (shape ? faceGeometry(shape, elevation + 0.04, plane) : null), [elevation, plane, shape])
  if (!shape || !geometry) return null
  const autoBoundaryFace = Boolean(profile.metadata?.autoCreatedFromWallBoundary)
  return (
    <mesh geometry={geometry} onPointerDown={(event) => { if (selectionLocked || selectionMode === 'edge' || selectionMode === 'vertex') return; event.stopPropagation(); onSelect() }}>
      <meshBasicMaterial
        color={selected ? FACE_SELECTED : autoBoundaryFace ? '#8ed1c6' : profile.color || FACE_FILL}
        depthTest={false}
        transparent
        opacity={selected ? 0.3 : autoBoundaryFace ? 0.2 : 0.14}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

function SolidMesh({ document, solid, profile, vertexLookup, selected, onSelect, openings, plane, selectionMode, selectionLocked }) {
  const shape = useMemo(() => buildProfileShape(document, profile, vertexLookup), [document, profile, vertexLookup])
  const wallHost = useMemo(() => deriveWallOpeningHost({
    version: 2,
    sketchPlanes: [],
    vertices: [...vertexLookup.values()],
    profiles: [profile],
    solids: [solid],
    openings: openings || [],
    segments: [],
    instances: [],
    history: [],
    metadata: {},
  }, solid.id), [openings, profile, solid, vertexLookup])
  const geometry = useMemo(() => {
    if (wallHost) return wallGeometryWithOpenings(wallHost, openings || [])
    return shape ? extrudedGeometry(shape, solid, document, profile, plane) : null
  }, [document, openings, plane, profile, shape, solid, wallHost])
  if (!shape || !geometry) return null

  const meshPosition = wallHost
    ? [wallHost.center[0], wallHost.baseElevation + wallHost.height / 2, wallHost.center[1]]
    : [0, 0, 0]
  const meshRotation = wallHost ? [0, -wallHost.angle, 0] : [0, 0, 0]

  return (
    <mesh castShadow geometry={geometry} onPointerDown={(event) => { if (selectionLocked || selectionMode === 'edge' || selectionMode === 'vertex') return; event.stopPropagation(); onSelect(event) }} position={meshPosition} receiveShadow rotation={meshRotation}>
      <meshStandardMaterial color={selected ? SOLID_SELECTED : solid.color || SOLID_FILL} metalness={0.04} roughness={0.9} />
    </mesh>
  )
}

function InstanceBox({ instance, selected, onSelect }) {
  return (
    <mesh
      castShadow
      onPointerDown={(event) => { event.stopPropagation(); onSelect() }}
      position={instance.position}
      receiveShadow
      rotation={instance.rotation}
      scale={instance.scale}
    >
      <boxGeometry args={instance.size} />
      <meshStandardMaterial color={selected ? INSTANCE_SELECTED : instance.color || INSTANCE_FILL} metalness={0.04} roughness={0.88} />
    </mesh>
  )
}

function OpeningOverlay({ opening, host, selected, onSelect, preview = false }) {
  const pose = useMemo(() => openingPreviewPose(host, opening), [host, opening])
  if (!pose) return null
  const handleDepth = Math.max(pose.size[2] * 1.35, 0.18)
  const handleSize = 0.16
  const handlePositions = [
    { id: 'left', position: [-opening.width / 2, 0, 0] },
    { id: 'right', position: [opening.width / 2, 0, 0] },
    { id: 'top', position: [0, opening.height / 2, 0] },
    { id: 'bottom', position: [0, -opening.height / 2, 0] },
  ]

  return (
    <group position={pose.position} rotation={pose.rotation} renderOrder={preview ? 8 : 7}>
      <mesh
        onPointerDown={(event) => {
          event.stopPropagation()
          if (!preview) onSelect(pose)
        }}
      >
        <boxGeometry args={pose.size} />
        <meshBasicMaterial
          color={preview ? (opening.type === 'door' ? '#b45309' : '#2563eb') : (selected ? '#0f766e' : '#111827')}
          depthTest={false}
          opacity={preview ? 0.32 : selected ? 0.34 : 0.16}
          transparent
        />
      </mesh>
      {selected && !preview ? handlePositions.map((handle) => (
        <mesh
          key={handle.id}
          onPointerDown={(event) => {
            event.stopPropagation()
            onSelect(pose, handle.id)
          }}
          position={handle.position}
          renderOrder={10}
        >
          <boxGeometry args={[handleSize, handleSize, handleDepth]} />
          <meshBasicMaterial color={HANDLE_COLOR} depthTest={false} opacity={0.96} transparent />
        </mesh>
      )) : null}
    </group>
  )
}

function SurfaceMesh({ document, surface, selected, onSelect }) {
  const geometry = useMemo(() => {
    const mesh = sampleSurfaceMesh(document, surface.id)
    if (!mesh.vertices.length || !mesh.indices.length) return null
    const nextGeometry = new THREE.BufferGeometry()
    nextGeometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.vertices.flat(), 3))
    nextGeometry.setIndex(mesh.indices)
    nextGeometry.computeVertexNormals()
    return nextGeometry
  }, [document, surface.id])

  if (!geometry) return null
  return (
    <mesh geometry={geometry} onPointerDown={(event) => { event.stopPropagation(); onSelect() }}>
      <meshStandardMaterial color={selected ? '#38bdf8' : surface.color || '#8ab6d6'} metalness={0.02} opacity={0.56} roughness={0.82} side={THREE.DoubleSide} transparent />
    </mesh>
  )
}

function PushPullPreview({ document, profileId, height }) {
  const geometry = useMemo(() => {
    const profile = document.profiles.find((p) => p.id === profileId)
    if (!profile) return null
    const shape = buildProfileShape(document, profile, buildLookup(document))
    if (!shape) return null
    const nextGeometry = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(height || 0.1, 0.1),
      bevelEnabled: false,
      steps: 1,
    })
    nextGeometry.rotateX(Math.PI / 2)
    return nextGeometry
  }, [document, profileId, height])

  if (!geometry) return null
  return (
    <mesh geometry={geometry} renderOrder={20}>
      <meshStandardMaterial color={PUSHPULL_PREVIEW_COLOR} metalness={0.04} roughness={0.9} transparent opacity={0.35} side={THREE.DoubleSide} />
      <lineSegments>
        <edgesGeometry args={[geometry]} />
        <lineBasicMaterial color={PUSHPULL_PREVIEW_COLOR} depthTest={false} transparent opacity={0.7} />
      </lineSegments>
    </mesh>
  )
}

export default function GeometryRenderer({ document }) {
  const normalized = useMemo(() => normalizeEditorDocument(document), [document])
  const vertexLookup = useMemo(() => buildLookup(normalized), [normalized])
  const planeElevationById = useMemo(() => new Map(normalized.sketchPlanes.map((plane) => [plane.id, getSketchPlaneElevation(normalized, plane.id)])), [normalized])
  const planeById = useMemo(() => new Map(normalized.sketchPlanes.map((plane) => [plane.id, plane])), [normalized])
  const selectionMode = useEditor((state) => state.selectionMode)
  const activeTool = useEditor((state) => state.activeTool)
  const selectedGeometry = useEditor((state) => state.selectedGeometry)
  const openingPlacement = useEditor((state) => state.openingPlacement)
  const setSelectedGeometry = useEditor((state) => state.setSelectedGeometry)
  const selectionLocked = activeTool === TOOL_TYPES.SKETCH || Boolean(openingPlacement)
  const pushPullPreview = useEditor((state) => state.pushPullPreview)
  const selectedIds = useMemo(() => new Set(
    selectedGeometry?.meta?.entityType === 'multi'
      ? (selectedGeometry.meta.items || []).map((item) => item.entityId)
      : selectedGeometry?.entityId
        ? [selectedGeometry.entityId]
        : [],
  ), [selectedGeometry])

  const standaloneProfiles = useMemo(() => normalized.profiles.filter((profile) => !profile.solidId), [normalized.profiles])
  const solidsWithProfiles = useMemo(() => normalized.solids.map((solid) => ({
    solid,
    profile: normalized.profiles.find((profile) => profile.id === solid.profileId),
    openings: normalized.openings.filter((opening) => opening.solidId === solid.id),
    host: deriveWallOpeningHost(normalized, solid.id),
  })).filter((entry) => entry.profile), [normalized, normalized.openings, normalized.profiles, normalized.solids])

  return (
    <group>
      {standaloneProfiles.map((profile) => (
        <ProfileFace
          key={profile.id}
          document={normalized}
          elevation={planeElevationById.get(profile.planeId || 'plane-ground') || 0}
          plane={planeById.get(profile.planeId || 'plane-ground') || getSketchPlaneById(normalized, profile.planeId || 'plane-ground')}
          onSelect={() => {
            if (selectionLocked) return
            setSelectedGeometry({
              kind: 'face',
              entityId: profile.id,
              label: profile.name,
              meta: { entityType: 'profile', solidId: profile.solidId || null },
            })
          }}
          profile={profile}
          selected={selectedIds.has(profile.id)}
          selectionLocked={selectionLocked}
          selectionMode={selectionMode}
          vertexLookup={vertexLookup}
        />
      ))}

      {solidsWithProfiles.map(({ solid, profile, openings }) => (
        <SolidMesh
          key={solid.id}
          document={normalized}
          onSelect={(event) => {
            if (selectionLocked) return
            if (selectionMode !== 'face') {
              setSelectedGeometry({
                kind: 'object',
                entityId: solid.id,
                label: solid.name,
                meta: { entityType: 'solid', solidId: solid.id, profileId: profile.id },
              })
              return
            }

            const normal = worldNormalFromEvent(event)
            const faceKind = Math.abs(normal.y) >= 0.75 ? (normal.y > 0 ? 'top' : 'bottom') : 'side'
            if (faceKind === 'top') {
              setSelectedGeometry({
                kind: 'face',
                entityId: profile.id,
                label: `${profile.name} 顶面`,
                meta: { entityType: 'profile', solidId: solid.id, profileId: profile.id, faceKind, hitPoint: [event.point.x, event.point.y, event.point.z] },
              })
              return
            }

            setSelectedGeometry({
              kind: 'face',
              entityId: solid.id,
              label: `${solid.name} ${faceKind === 'side' ? '侧面' : '底面'}`,
              meta: {
                entityType: 'solid-face',
                solidId: solid.id,
                profileId: profile.id,
                faceKind,
                hitPoint: [event.point.x, event.point.y, event.point.z],
                normal: [normal.x, normal.y, normal.z],
              },
            })
          }}
          openings={openings}
          plane={planeById.get(profile.planeId || 'plane-ground') || getSketchPlaneById(normalized, profile.planeId || 'plane-ground')}
          profile={profile}
          selected={selectedIds.has(solid.id) || selectedIds.has(profile.id)}
          selectionLocked={selectionLocked}
          selectionMode={selectionMode}
          solid={solid}
          vertexLookup={vertexLookup}
        />
      ))}

      {openingPlacement?.preview && solidsWithProfiles.map(({ solid, host }) => {
        if (solid.id !== openingPlacement.solidId) return null
        return (
          <OpeningOverlay key={`opening-preview-${solid.id}`} host={host} opening={openingPlacement.preview} preview />
        )
      })}

      {solidsWithProfiles.flatMap(({ solid, openings, host }) => openings.map((opening) => (
        <OpeningOverlay
          host={host}
          key={opening.id}
          onSelect={(pose, handle = null) => {
            if (selectionLocked) return
            setSelectedGeometry({
              kind: 'object',
              entityId: handle ? `${opening.id}:${handle}` : opening.id,
              label: `${opening.type === 'door' ? '门洞' : '窗洞'} · ${solid.name}${handle ? ` · ${handle}` : ''}`,
              meta: {
                entityType: handle ? 'opening-resize-handle' : 'opening',
                openingId: opening.id,
                resizeHandle: handle,
                solidId: solid.id,
                faceKind: 'side',
                faceNormal: pose.faceNormal,
                facePoint: pose.position,
              },
            })
          }}
          opening={opening}
          selected={
            selectedIds.has(opening.id)
            || (selectedGeometry?.meta?.entityType === 'opening' && selectedGeometry?.entityId === opening.id)
            || (selectedGeometry?.meta?.entityType === 'opening-resize-handle' && selectedGeometry?.meta?.openingId === opening.id)
          }
        />
      )))}

      {normalized.instances.map((instance) => (
        <InstanceBox
          key={instance.id}
          instance={instance}
          onSelect={() => {
            if (selectionLocked) return
            setSelectedGeometry({
              kind: 'object',
              entityId: instance.id,
              label: instance.name,
              meta: { entityType: 'instance' },
            })
          }}
          selected={selectedIds.has(instance.id)}
        />
      ))}

      {normalized.surfaces.map((surface) => (
        <SurfaceMesh
          document={normalized}
          key={surface.id}
          onSelect={() => {
            if (selectionLocked) return
            setSelectedGeometry({
              kind: 'object',
              entityId: surface.id,
              label: surface.name,
              meta: { entityType: 'surface', surfaceId: surface.id },
            })
          }}
          selected={selectedIds.has(surface.id)}
          surface={surface}
        />
      ))}

      <BatchedSegmentLines segments={normalized.segments.filter((s) => !selectedIds.has(s.id))} vertexLookup={vertexLookup} />

      {normalized.segments.map((segment) => {
        const isSelected = selectedIds.has(segment.id)
        const start = vertexLookup.get(segment.startVertexId)
        const end = vertexLookup.get(segment.endVertexId)
        if (!start || !end) return null
        const dx = end.x - start.x
        const dy = end.y - start.y
        const dz = end.z - start.z
        const groundLength = Math.hypot(dx, dz)
        const vertical = Math.abs(dy) > groundLength
        const length = Math.max(vertical ? Math.abs(dy) : groundLength, 0.01)
        const hitPosition = [(start.x + end.x) / 2, ((start.y + end.y) / 2) + 0.08, (start.z + end.z) / 2]
        const hitRotation = [0, -Math.atan2(dz, dx), 0]
        const hitArgs = vertical ? [0.28, length, 0.28] : [length, 0.18, 0.28]

        return (
          <group key={segment.id}>
            {isSelected ? (
              <SegmentLine
                document={normalized}
                onSelect={() => {
                  if (selectionLocked) return
                  if (selectionMode !== 'edge') return
                  setSelectedGeometry({
                    kind: 'edge',
                    entityId: segment.id,
                    label: segment.kind === 'line' ? segment.id : `${segment.kind} · ${segment.id}`,
                    meta: { entityType: 'segment' },
                  })
                }}
                segment={segment}
                selected
                vertexLookup={vertexLookup}
              />
            ) : null}
            {isSelected && segment.kind !== 'line' ? (
              <CurveControlHandles
                document={normalized}
                onSelect={(control, event) => {
                  if (selectionLocked) return
                  setSelectedGeometry({
                    kind: 'vertex',
                    entityId: `${segment.id}:${control}`,
                    label: `曲线控制点 · ${control}`,
                    meta: { entityType: 'curve-control', segmentId: segment.id, control },
                  })
                  if (activeTool === TOOL_TYPES.MOVE) {
                    window.dispatchEvent(new CustomEvent('studio:curve-control-dragstart', {
                      detail: {
                        segmentId: segment.id,
                        control,
                        clientX: event?.nativeEvent?.clientX ?? event?.clientX,
                        clientY: event?.nativeEvent?.clientY ?? event?.clientY,
                      },
                    }))
                  }
                }}
                segment={segment}
                vertexLookup={vertexLookup}
                visible={selectedIds.has(segment.id) || selectedGeometry?.meta?.segmentId === segment.id}
              />
            ) : null}
            <mesh
              onPointerDown={(event) => {
                event.stopPropagation()
                if (selectionLocked) return
                if (selectionMode !== 'edge') return
                setSelectedGeometry({
                  kind: 'edge',
                  entityId: segment.id,
                  label: segment.kind === 'line' ? segment.id : `${segment.kind} · ${segment.id}`,
                  meta: { entityType: 'segment' },
                })
              }}
              position={hitPosition}
              rotation={hitRotation}
            >
              <boxGeometry args={hitArgs} />
              <meshBasicMaterial transparent opacity={0} />
            </mesh>
          </group>
        )
      })}

      {normalized.vertices.map((vertex) => (
        <VertexHandle
          key={vertex.id}
          onSelect={() => {
            if (selectionLocked) return
            if (selectionMode !== 'vertex') return
            setSelectedGeometry({
              kind: 'vertex',
              entityId: vertex.id,
              label: vertex.id,
              meta: { entityType: 'vertex' },
            })
          }}
          selected={selectedIds.has(vertex.id)}
          vertex={vertex}
          visible={selectionMode === 'vertex'}
        />
      ))}

      {pushPullPreview ? (
        <PushPullPreview document={normalized} profileId={pushPullPreview.profileId} height={pushPullPreview.height} />
      ) : null}
    </group>
  )
}
