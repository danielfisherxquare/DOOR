import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import useEditor from '../store/useEditor'
import useModelingDocument from '../store/useModelingDocument'
import { moveCurveHandleInDocument, moveSelectionInDocument, resizeOpeningInDocument, updateOpeningInDocument } from '../model/editorDocument'
import { projectPointerToVerticalAxis, useWorkbenchPlane } from '../utils/workbenchPlane'
import { useThree } from '@react-three/fiber'

const POINTER = new THREE.Vector2()
const INTERSECTION = new THREE.Vector3()
const FACE_PLANE = new THREE.Plane()
const FACE_NORMAL = new THREE.Vector3()
const FACE_POINT = new THREE.Vector3()

function projectPointerToFacePlane(event, camera, domElement, raycaster, faceNormal, facePoint) {
  if (!faceNormal || !facePoint) return null
  const rect = domElement.getBoundingClientRect()
  POINTER.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  POINTER.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(POINTER, camera)
  FACE_NORMAL.set(...faceNormal).normalize()
  FACE_POINT.set(...facePoint)
  FACE_PLANE.setFromNormalAndCoplanarPoint(FACE_NORMAL, FACE_POINT)
  const hit = raycaster.ray.intersectPlane(FACE_PLANE, INTERSECTION)
  if (!hit) return null
  return [INTERSECTION.x, INTERSECTION.y, INTERSECTION.z]
}

export default function MoveTool() {
  const selectedGeometry = useEditor((state) => state.selectedGeometry)
  const setDirty = useEditor((state) => state.setDirty)
  const document = useModelingDocument((state) => state.document)
  const replaceDocument = useModelingDocument((state) => state.replaceDocument)
  const commitDocument = useModelingDocument((state) => state.commitDocument)
  const projectToGround = useWorkbenchPlane()
  const { gl, camera, raycaster } = useThree((state) => ({ gl: state.gl, camera: state.camera, raycaster: state.raycaster }))
  const dragRef = useRef(null)
  const axisLockRef = useRef(null)

  useEffect(() => {
    const canvas = gl?.domElement
    if (!canvas) return undefined

    const isOpeningSelection = selectedGeometry?.meta?.entityType === 'opening'
    const isOpeningResizeHandle = selectedGeometry?.meta?.entityType === 'opening-resize-handle'
    const isCurveControl = selectedGeometry?.meta?.entityType === 'curve-control'

    const startCurveControlDrag = (segmentId, control) => {
      if (!segmentId || !control) return
      dragRef.current = {
        mode: 'curve-control',
        originDocument: useModelingDocument.getState().document,
        segmentId,
        control,
      }
    }

    const handleCurveControlDragStart = (event) => {
      startCurveControlDrag(event.detail?.segmentId, event.detail?.control)
    }

    const handleMouseDown = (event) => {
      if (event.button !== 0 || !selectedGeometry) return
      if (isOpeningSelection || isOpeningResizeHandle) {
        const facePoint = projectPointerToFacePlane(
          event,
          camera,
          canvas,
          raycaster,
          selectedGeometry.meta?.faceNormal,
          selectedGeometry.meta?.facePoint,
        )
        if (!facePoint) return
        dragRef.current = {
          mode: isOpeningResizeHandle ? 'opening-resize' : 'opening',
          originDocument: document,
          openingId: selectedGeometry.meta?.openingId || selectedGeometry.entityId,
          resizeHandle: selectedGeometry.meta?.resizeHandle || null,
          faceNormal: selectedGeometry.meta?.faceNormal,
          facePoint: selectedGeometry.meta?.facePoint,
        }
        return
      }
      if (isCurveControl) {
        const projection = projectToGround(event, { snapDisabled: event.altKey })
        if (!projection) return
        startCurveControlDrag(selectedGeometry.meta?.segmentId, selectedGeometry.meta?.control)
        return
      }
      const projection = projectToGround(event, { snapDisabled: event.altKey })
      if (!projection) return
      dragRef.current = {
        mode: 'selection',
        originDocument: document,
        startPoint: projection.snapped,
        startPoint3D: [projection.snapped[0], 0, projection.snapped[1]],
        axisLock: axisLockRef.current,
      }
    }

    const handleMouseMove = (event) => {
      if (!dragRef.current || !selectedGeometry) return
      if (dragRef.current.mode === 'opening') {
        const point = projectPointerToFacePlane(
          event,
          camera,
          canvas,
          raycaster,
          dragRef.current.faceNormal,
          dragRef.current.facePoint,
        )
        if (!point) return
        const result = updateOpeningInDocument(dragRef.current.originDocument, dragRef.current.openingId, {
          point,
          source: 'opening-drag',
        })
        if (result.error) return
        replaceDocument(result.document, { recordHistory: false })
        return
      }
      if (dragRef.current.mode === 'opening-resize') {
        const point = projectPointerToFacePlane(
          event,
          camera,
          canvas,
          raycaster,
          dragRef.current.faceNormal,
          dragRef.current.facePoint,
        )
        if (!point) return
        const result = resizeOpeningInDocument(
          dragRef.current.originDocument,
          dragRef.current.openingId,
          dragRef.current.resizeHandle,
          point,
          { source: 'opening-resize-drag' },
        )
        if (result.error) return
        replaceDocument(result.document, { recordHistory: false })
        return
      }
      if (dragRef.current.mode === 'curve-control') {
        const projection = projectToGround(event, { snapDisabled: event.altKey })
        if (!projection) return
        const result = moveCurveHandleInDocument(dragRef.current.originDocument, dragRef.current.segmentId, dragRef.current.control, projection.snapped)
        if (result.error) return
        replaceDocument(result.document, { recordHistory: false })
        return
      }
      const projection = projectToGround(event, { snapDisabled: event.altKey })
      if (!projection) return
      if (dragRef.current.axisLock === 'vertical') {
        const verticalProjection = projectPointerToVerticalAxis({
          event,
          camera,
          domElement: canvas,
          raycaster,
          origin: dragRef.current.startPoint3D,
          snapDisabled: event.altKey,
        })
        if (!verticalProjection) return
        const delta3D = [
          0,
          verticalProjection.snapped[1] - dragRef.current.startPoint3D[1],
          0,
        ]
        replaceDocument(moveSelectionInDocument(dragRef.current.originDocument, selectedGeometry, delta3D), { recordHistory: false })
        return
      }
      const delta = [
        projection.snapped[0] - dragRef.current.startPoint[0],
        projection.snapped[1] - dragRef.current.startPoint[1],
      ]
      replaceDocument(moveSelectionInDocument(dragRef.current.originDocument, selectedGeometry, delta), { recordHistory: false })
    }

    const handleMouseUp = () => {
      if (!dragRef.current) return
      commitDocument(
        useModelingDocument.getState().document,
        dragRef.current.originDocument,
        dragRef.current.mode === 'opening-resize' ? '调整开洞尺寸' : dragRef.current.mode === 'opening' ? '调整开洞' : dragRef.current.mode === 'curve-control' ? '调整曲线' : '移动',
      )
      dragRef.current = null
      setDirty(true)
    }

    const handleKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey) return
      if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'z') {
        event.preventDefault()
        axisLockRef.current = axisLockRef.current === 'vertical' ? null : 'vertical'
      } else if (event.key === 'Escape') {
        axisLockRef.current = null
      }
    }

    canvas.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('studio:curve-control-dragstart', handleCurveControlDragStart)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('studio:curve-control-dragstart', handleCurveControlDragStart)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [camera, commitDocument, document, gl, projectToGround, raycaster, replaceDocument, selectedGeometry, setDirty])

  return null
}
