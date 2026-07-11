import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import useEditor from '../store/useEditor'
import useModelingDocument from '../store/useModelingDocument'
import { extrudeProfileInDocument, getSketchPlaneById } from '../model/editorDocument'
import { projectPointerToAxis, projectPointerToVerticalAxis } from '../utils/workbenchPlane'

const FALLBACK_HEIGHT_SCALE = 0.02

function resolveProfileCenter(document, profileId) {
  const profile = document.profiles.find((item) => item.id === profileId)
  if (!profile) return [0, 0]
  const vertices = profile.vertexIds
    .map((vertexId) => document.vertices.find((vertex) => vertex.id === vertexId))
    .filter(Boolean)
  if (!vertices.length) return [0, 0]
  return [
    vertices.reduce((sum, vertex) => sum + vertex.x, 0) / vertices.length,
    vertices.reduce((sum, vertex) => sum + vertex.y, 0) / vertices.length,
    vertices.reduce((sum, vertex) => sum + vertex.z, 0) / vertices.length,
  ]
}

function isPlaneNormalExtrude(plane) {
  const normal = plane?.normal || [0, 1, 0]
  return Math.abs(normal[0]) > 0.001 || Math.abs(normal[2]) > 0.001 || Math.abs(normal[1] - 1) > 0.001
}

export default function PushPullTool() {
  const selectedGeometry = useEditor((state) => state.selectedGeometry)
  const setDirty = useEditor((state) => state.setDirty)
  const pushPullPreview = useEditor((state) => state.pushPullPreview)
  const setPushPullPreview = useEditor((state) => state.setPushPullPreview)
  const document = useModelingDocument((state) => state.document)
  const commitDocument = useModelingDocument((state) => state.commitDocument)
  const { camera, gl, raycaster } = useThree((state) => ({ camera: state.camera, gl: state.gl, raycaster: state.raycaster }))
  const dragRef = useRef(null)

  useEffect(() => {
    const canvas = gl?.domElement
    if (!canvas) return undefined

    const resolveProfileId = () => {
      if (!selectedGeometry) return null
      if (selectedGeometry.kind === 'face' && selectedGeometry.meta?.entityType === 'profile') return selectedGeometry.entityId
      if (selectedGeometry.kind === 'object' && selectedGeometry.meta?.profileId) return selectedGeometry.meta.profileId
      return selectedGeometry.meta?.profileId || null
    }

    const resolveStartHeight = () => {
      const solidId = selectedGeometry?.meta?.solidId
      const solid = document.solids.find((item) => item.id === solidId)
      return solid?.height || 0
    }

    const handleMouseDown = (event) => {
      if (event.button !== 0) return
      const profileId = resolveProfileId()
      if (!profileId) return
      const startHeight = resolveStartHeight()
      const center = resolveProfileCenter(document, profileId)
      const profile = document.profiles.find((item) => item.id === profileId)
      const plane = getSketchPlaneById(document, profile?.planeId || 'plane-ground')
      const normalExtrude = isPlaneNormalExtrude(plane)
      dragRef.current = {
        originDocument: document,
        profileId,
        startClientY: event.clientY,
        startHeight,
        axisOrigin: normalExtrude
          ? [center[0], center[1], center[2]]
          : [center[0], startHeight, center[2]],
        axis: normalExtrude ? plane.normal : [0, 1, 0],
        normalExtrude,
      }
    }

    const handleMouseMove = (event) => {
      if (!dragRef.current) return
      const axisProjection = dragRef.current.normalExtrude ? projectPointerToAxis({
        event,
        camera,
        domElement: canvas,
        raycaster,
        origin: dragRef.current.axisOrigin,
        axis: dragRef.current.axis,
        axisLock: 'normal',
        snapDisabled: event.altKey,
      }) : projectPointerToVerticalAxis({
        event,
        camera,
        domElement: canvas,
        raycaster,
        origin: dragRef.current.axisOrigin,
        snapDisabled: event.altKey,
      })
      const deltaHeight = axisProjection && !axisProjection.degenerate
        ? dragRef.current.normalExtrude ? axisProjection.axisDistance : axisProjection.snapped[1] - dragRef.current.axisOrigin[1]
        : (dragRef.current.startClientY - event.clientY) * FALLBACK_HEIGHT_SCALE
      const nextHeight = Math.max(dragRef.current.startHeight + deltaHeight, 0.1)
      // Only update lightweight preview state (no document clone)
      setPushPullPreview({
        profileId: dragRef.current.profileId,
        height: nextHeight,
        center: dragRef.current.axisOrigin,
      })
    }

    const handleMouseUp = () => {
      if (!dragRef.current) return
      const preview = useEditor.getState().pushPullPreview
      if (preview?.height != null) {
        const result = extrudeProfileInDocument(dragRef.current.originDocument, dragRef.current.profileId, preview.height, {})
        commitDocument(result, dragRef.current.originDocument, 'Push/Pull')
        setDirty(true)
      }
      setPushPullPreview(null)
      dragRef.current = null
    }

    canvas.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [camera, commitDocument, document, gl, raycaster, selectedGeometry, setDirty, setPushPullPreview])

  return <PushPullHeightLabel preview={pushPullPreview} />
}

function PushPullHeightLabel({ preview }) {
  const { camera } = useThree()
  const labelRef = useRef(null)
  const domDocument = globalThis.document

  useEffect(() => {
    if (!preview?.height || !domDocument) return
    const el = domDocument.createElement('div')
    Object.assign(el.style, {
      position: 'fixed',
      padding: '2px 10px',
      background: 'rgba(15, 23, 42, 0.88)',
      color: '#f8fafc',
      fontSize: '13px',
      fontWeight: '700',
      borderRadius: '4px',
      pointerEvents: 'none',
      zIndex: '10000',
      whiteSpace: 'nowrap',
      fontFamily: 'ui-monospace, SFMono-Regular, monospace',
    })
    el.textContent = `高度: ${preview.height.toFixed(2)}m`
    domDocument.body.appendChild(el)
    labelRef.current = el
    return () => {
      if (el.parentElement) el.parentElement.removeChild(el)
      labelRef.current = null
    }
  }, [domDocument, preview?.height])

  useEffect(() => {
    if (!labelRef.current || !preview?.height) return
    labelRef.current.textContent = `高度: ${preview.height.toFixed(2)}m`
  }, [preview?.height])

  useEffect(() => {
    if (!labelRef.current || !camera || !preview?.center) return
    const center = preview.center
    const vector = new THREE.Vector3(center[0], preview.height + 0.3, center[2]).project(camera)
    if (!Number.isFinite(vector.x)) return
    const rect = domDocument.documentElement.getBoundingClientRect()
    const x = ((vector.x + 1) / 2) * rect.width
    const y = ((-vector.y + 1) / 2) * rect.height
    labelRef.current.style.left = `${x - 40}px`
    labelRef.current.style.top = `${y - 12}px`
  })

  return null
}
