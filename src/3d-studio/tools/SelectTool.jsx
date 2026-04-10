import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import useViewer from '../../../node_modules/@pascal-app/viewer/dist/store/use-viewer.js'
import { getSketchPlaneElevation, normalizeEditorDocument, sampleProfile, sampleSegment3D, sampleSurfaceMesh } from '../model/editorDocument'
import useEditor from '../store/useEditor'
import useModelingDocument from '../store/useModelingDocument'

const DRAG_THRESHOLD = 6
const POINT = new THREE.Vector3()

function normalizeRect(start, end) {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    right: Math.max(start.x, end.x),
    bottom: Math.max(start.y, end.y),
  }
}

function rectIntersects(left, right) {
  return !(left.right < right.left || left.left > right.right || left.bottom < right.top || left.top > right.bottom)
}

function pointerPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect()
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  }
}

function pointerSnapshot(event, canvas) {
  return {
    local: pointerPoint(event, canvas),
    client: {
      x: event.clientX,
      y: event.clientY,
    },
  }
}

function projectPoint(point, camera, canvas) {
  const rect = canvas.getBoundingClientRect()
  POINT.set(point[0], point[1], point[2]).project(camera)
  if (![POINT.x, POINT.y, POINT.z].every(Number.isFinite)) return null
  return {
    x: ((POINT.x + 1) / 2) * rect.width,
    y: ((1 - POINT.y) / 2) * rect.height,
  }
}

function screenRectFromPoints(points, camera, canvas) {
  const projected = points.map((point) => projectPoint(point, camera, canvas)).filter(Boolean)
  if (!projected.length) return null
  return {
    left: Math.min(...projected.map((point) => point.x)),
    top: Math.min(...projected.map((point) => point.y)),
    right: Math.max(...projected.map((point) => point.x)),
    bottom: Math.max(...projected.map((point) => point.y)),
  }
}

function profilePoints(document, profile, vertexById, elevation) {
  const sampled = sampleProfile(document, profile.id)
  if (sampled.length) return sampled.map((point) => [point[0], elevation, point[1]])
  return profile.vertexIds
    .map((vertexId) => vertexById.get(vertexId))
    .filter(Boolean)
    .map((vertex) => [vertex.x, elevation ?? vertex.y, vertex.z])
}

function solidPoints(solid, profile, vertexById, document) {
  const base = getSketchPlaneElevation(document, profile.planeId || 'plane-ground')
  const bottom = profilePoints(document, profile, vertexById, base)
  const top = bottom.map((point) => [point[0], base + solid.height, point[2]])
  return [...bottom, ...top]
}

function itemForSingleOrMulti(items) {
  if (items.length === 1) return items[0]
  return {
    kind: 'multi',
    entityId: 'multi-selection',
    label: `${items.length} 个对象`,
    meta: {
      entityType: 'multi',
      items,
    },
  }
}

export default function SelectTool() {
  const { camera, gl } = useThree()
  const document = useModelingDocument((state) => state.document)
  const selectionMode = useEditor((state) => state.selectionMode)
  const setSelectedGeometry = useEditor((state) => state.setSelectedGeometry)
  const normalized = useMemo(() => normalizeEditorDocument(document), [document])
  const dragRef = useRef(null)
  const marqueeRef = useRef(null)
  const [drag, setDrag] = useState(null)

  useEffect(() => {
    const canvas = gl?.domElement
    if (!canvas) return undefined

    const vertexById = new Map(normalized.vertices.map((vertex) => [vertex.id, vertex]))

    const collectItems = (rect) => {
      const items = []

      if (selectionMode === 'vertex') {
        normalized.vertices.forEach((vertex) => {
          const screen = projectPoint([vertex.x, vertex.y, vertex.z], camera, canvas)
          if (!screen) return
          const hit = { left: screen.x - 4, top: screen.y - 4, right: screen.x + 4, bottom: screen.y + 4 }
          if (rectIntersects(rect, hit)) {
            items.push({ kind: 'vertex', entityId: vertex.id, label: vertex.id, meta: { entityType: 'vertex' } })
          }
        })
        return items
      }

      if (selectionMode === 'edge') {
        normalized.segments.forEach((segment) => {
          const start = vertexById.get(segment.startVertexId)
          const end = vertexById.get(segment.endVertexId)
          if (!start || !end) return
          const sampled = sampleSegment3D(normalized, segment)
          const points = sampled.length ? sampled : [[start.x, start.y, start.z], [end.x, end.y, end.z]]
          const hit = screenRectFromPoints(points, camera, canvas)
          if (hit && rectIntersects(rect, hit)) {
            items.push({ kind: 'edge', entityId: segment.id, label: segment.kind === 'line' ? segment.id : `${segment.kind} · ${segment.id}`, meta: { entityType: 'segment' } })
          }
        })
        return items
      }

      if (selectionMode === 'face') {
        normalized.profiles.forEach((profile) => {
          const elevation = getSketchPlaneElevation(normalized, profile.planeId || 'plane-ground')
          const hit = screenRectFromPoints(profilePoints(normalized, profile, vertexById, elevation), camera, canvas)
          if (hit && rectIntersects(rect, hit)) {
            items.push({ kind: 'face', entityId: profile.id, label: profile.name, meta: { entityType: 'profile', solidId: profile.solidId || null, profileId: profile.id } })
          }
        })
        return items
      }

      normalized.solids.forEach((solid) => {
        const profile = normalized.profiles.find((item) => item.id === solid.profileId)
        if (!profile) return
        const hit = screenRectFromPoints(solidPoints(solid, profile, vertexById, normalized), camera, canvas)
        if (hit && rectIntersects(rect, hit)) {
          items.push({ kind: 'object', entityId: solid.id, label: solid.name, meta: { entityType: 'solid', solidId: solid.id, profileId: solid.profileId } })
        }
      })

      normalized.surfaces.forEach((surface) => {
        const mesh = sampleSurfaceMesh(normalized, surface.id)
        const hit = screenRectFromPoints(mesh.vertices || [], camera, canvas)
        if (hit && rectIntersects(rect, hit)) {
          items.push({ kind: 'object', entityId: surface.id, label: surface.name, meta: { entityType: 'surface', surfaceId: surface.id } })
        }
      })

      return items
    }

    const handleMouseDown = (event) => {
      if (event.button !== 0) return
      const point = pointerSnapshot(event, canvas)
      const nextDrag = {
        start: point.local,
        current: point.local,
        startClient: point.client,
        currentClient: point.client,
        active: false,
      }
      dragRef.current = nextDrag
      setDrag(nextDrag)
    }

    const handleMouseMove = (event) => {
      const current = dragRef.current
      if (!current) return
      const point = pointerSnapshot(event, canvas)
      const nextPoint = point.local
      const distance = Math.hypot(nextPoint.x - current.start.x, nextPoint.y - current.start.y)
      const nextDrag = {
        ...current,
        current: nextPoint,
        currentClient: point.client,
        active: current.active || distance >= DRAG_THRESHOLD,
      }
      dragRef.current = nextDrag
      setDrag(nextDrag)
    }

    const handleMouseUp = (event) => {
      const current = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!current?.active) return
      const rect = normalizeRect(current.start, pointerPoint(event, canvas))
      const items = collectItems(rect)
      if (items.length) {
        // Clear Pascal viewer selection when making a modeling selection
        useViewer.getState().setSelection({ selectedIds: [] })
        useViewer.getState().setHoveredId(null)
        setSelectedGeometry(itemForSingleOrMulti(items))
      }
    }

    canvas.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [camera, gl, normalized, selectionMode, setSelectedGeometry])

  const rect = drag?.active ? normalizeRect(drag.startClient, drag.currentClient) : null

  useEffect(() => {
    const body = globalThis.document?.body
    if (!body) return undefined
    const element = globalThis.document.createElement('div')
    element.dataset.testid = 'studio-selection-marquee'
    Object.assign(element.style, {
      position: 'fixed',
      border: '1px solid #2563eb',
      background: 'rgba(37, 99, 235, 0.14)',
      boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.6) inset',
      pointerEvents: 'none',
      zIndex: '100000',
      display: 'none',
    })
    body.appendChild(element)
    marqueeRef.current = element
    return () => {
      marqueeRef.current = null
      element.remove()
    }
  }, [])

  useEffect(() => {
    const element = marqueeRef.current
    if (!element) return
    if (!rect) {
      element.style.display = 'none'
      return
    }
    element.style.display = 'block'
    element.style.left = `${rect.left}px`
    element.style.top = `${rect.top}px`
    element.style.width = `${Math.max(rect.right - rect.left, 1)}px`
    element.style.height = `${Math.max(rect.bottom - rect.top, 1)}px`
  }, [rect])

  return null
}
