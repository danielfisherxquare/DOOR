import { useEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import useEditor from '../store/useEditor'
import useModelingDocument from '../store/useModelingDocument'
import { resolveOpeningDraft } from '../model/editorDocument'

const POINTER = new THREE.Vector2()
const INTERSECTION = new THREE.Vector3()
const FACE_PLANE = new THREE.Plane()
const FACE_NORMAL = new THREE.Vector3()
const FACE_POINT = new THREE.Vector3()

function projectPointerToFacePlane(event, camera, domElement, raycaster, placement) {
  if (!placement?.faceNormal || !placement?.facePoint) return null

  const rect = domElement.getBoundingClientRect()
  POINTER.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  POINTER.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(POINTER, camera)

  FACE_NORMAL.set(...placement.faceNormal).normalize()
  FACE_POINT.set(...placement.facePoint)
  FACE_PLANE.setFromNormalAndCoplanarPoint(FACE_NORMAL, FACE_POINT)

  const hit = raycaster.ray.intersectPlane(FACE_PLANE, INTERSECTION)
  if (!hit) return null

  return {
    point: [INTERSECTION.x, INTERSECTION.y, INTERSECTION.z],
    pointer: {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    },
  }
}

export default function OpeningPlacementTool() {
  const placement = useEditor((state) => state.openingPlacement)
  const selectedGeometry = useEditor((state) => state.selectedGeometry)
  const setDirty = useEditor((state) => state.setDirty)
  const setInferenceHint = useEditor((state) => state.setInferenceHint)
  const clearInferenceHint = useEditor((state) => state.clearInferenceHint)
  const updateOpeningPlacement = useEditor((state) => state.updateOpeningPlacement)
  const clearOpeningPlacement = useEditor((state) => state.clearOpeningPlacement)
  const document = useModelingDocument((state) => state.document)
  const addOpening = useModelingDocument((state) => state.addOpening)
  const { camera, gl, raycaster } = useThree()
  const latestPlacementRef = useRef(placement)

  latestPlacementRef.current = placement

  const selectionStillValid = useMemo(() => (
    placement
    && selectedGeometry?.meta?.entityType === 'solid-face'
    && selectedGeometry?.meta?.faceKind === 'side'
    && selectedGeometry?.meta?.solidId === placement.solidId
  ), [placement, selectedGeometry])

  useEffect(() => {
    if (!placement) {
      clearInferenceHint()
      return undefined
    }

    if (!selectionStillValid) {
      clearOpeningPlacement()
      clearInferenceHint()
      return undefined
    }

    const canvas = gl?.domElement
    if (!canvas) return undefined

    const updatePreviewFromEvent = (event) => {
      const currentPlacement = latestPlacementRef.current
      if (!currentPlacement) return null

      const projected = projectPointerToFacePlane(event, camera, canvas, raycaster, currentPlacement)
      if (!projected) {
        updateOpeningPlacement({ preview: null })
        clearInferenceHint()
        return null
      }

      const draft = resolveOpeningDraft(document, currentPlacement.solidId, {
        type: currentPlacement.type,
        point: projected.point,
        source: 'opening-placement',
      })
      if (draft.error) {
        updateOpeningPlacement({ preview: null })
        clearInferenceHint()
        return null
      }

      updateOpeningPlacement({
        preview: {
          ...draft.opening,
          point: projected.point,
          pointer: projected.pointer,
        },
      })
      setInferenceHint({
        x: projected.pointer.x,
        y: projected.pointer.y,
        label: `${currentPlacement.type === 'door' ? '门洞' : '窗洞'} · ${draft.opening.width}m × ${draft.opening.height}m · 标高 ${draft.opening.elevation}m`,
      })
      return {
        ...draft,
        point: projected.point,
      }
    }

    const handleMouseMove = (event) => {
      updatePreviewFromEvent(event)
    }

    const handleMouseDown = (event) => {
      if (event.button !== 0) return
      const currentPlacement = latestPlacementRef.current
      if (!currentPlacement) return

      const draft = updatePreviewFromEvent(event)
      if (!draft?.opening) return

      const result = addOpening(currentPlacement.solidId, {
        type: currentPlacement.type,
        point: draft.point,
        source: 'opening-placement',
        historyLabel: currentPlacement.type === 'door' ? '放置门洞' : '放置窗洞',
      })
      if (!result?.error) {
        setDirty(true)
        clearOpeningPlacement()
        clearInferenceHint()
      }
    }

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return
      clearOpeningPlacement()
      clearInferenceHint()
    }

    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('keydown', handleKeyDown)
      clearInferenceHint()
    }
  }, [
    addOpening,
    camera,
    clearInferenceHint,
    clearOpeningPlacement,
    document,
    gl,
    placement?.faceNormal,
    placement?.facePoint,
    placement?.solidId,
    placement?.type,
    raycaster,
    selectionStillValid,
    setDirty,
    setInferenceHint,
    updateOpeningPlacement,
  ])

  return null
}
