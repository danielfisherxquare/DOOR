import { useCallback } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import useViewer from '../../../node_modules/@pascal-app/viewer/dist/store/use-viewer.js'

const WORKBENCH_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const POINTER = new THREE.Vector2()
const INTERSECTION = new THREE.Vector3()
const VERTICAL_AXIS = new THREE.Vector3(0, 1, 0)
const RAY_ORIGIN_TO_AXIS = new THREE.Vector3()
const SKETCH_PLANE_NORMAL = new THREE.Vector3()
const SKETCH_PLANE_ORIGIN = new THREE.Vector3()
const SKETCH_PLANE_X = new THREE.Vector3()
const SKETCH_PLANE_Y = new THREE.Vector3()
const SKETCH_PLANE = new THREE.Plane()

function roundTo(value, step) {
  if (!step) return value
  return Math.round(value / step) * step
}

function normalizeAxisLock(axisLock, origin, point) {
  if (axisLock && axisLock !== 'infer') return axisLock
  if (!origin || !point) return null
  const dx = Math.abs(point[0] - origin[0])
  const dz = Math.abs(point[1] - origin[1])
  if (dx < 1e-4 && dz < 1e-4) return null
  return dx >= dz ? 'x' : 'z'
}

function applyAxisLock(point, origin, axisLock) {
  if (!origin || !axisLock) return point
  if (axisLock === 'x') return [point[0], origin[1]]
  if (axisLock === 'z') return [origin[0], point[1]]
  return point
}

function snapPoint(point, origin, axisLock, snapStep) {
  if (!snapStep) return point
  if (axisLock === 'x') return [roundTo(point[0], snapStep), origin?.[1] ?? point[1]]
  if (axisLock === 'z') return [origin?.[0] ?? point[0], roundTo(point[1], snapStep)]
  return [roundTo(point[0], snapStep), roundTo(point[1], snapStep)]
}

export function projectPointerToGround({
  event,
  camera,
  domElement,
  raycaster,
  origin = null,
  axisLock = null,
  snapDisabled = false,
  planeElevation = 0,
}) {
  if (!event || !camera || !domElement || !raycaster) return null

  const rect = domElement.getBoundingClientRect()
  POINTER.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  POINTER.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(POINTER, camera)
  WORKBENCH_PLANE.constant = -planeElevation

  const hit = raycaster.ray.intersectPlane(WORKBENCH_PLANE, INTERSECTION)
  if (!hit) return null

  const raw = [INTERSECTION.x, INTERSECTION.z]
  const effectiveAxisLock = normalizeAxisLock(axisLock, origin, raw)
  const constrained = applyAxisLock(raw, origin, effectiveAxisLock)
  const { snapEnabled = true, snapStep = 0.5 } = useViewer.getState()
  const shouldSnap = snapEnabled && !snapDisabled
  const snapped = shouldSnap
    ? snapPoint(constrained, origin, effectiveAxisLock, snapStep)
    : constrained

  return {
    valid: true,
    pointer: {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    },
    planeElevation,
    world: constrained,
    snapped,
    axisLock: effectiveAxisLock,
    snapEnabled: shouldSnap,
    snapStep,
  }
}

export function projectPointerToSketchPlane({
  event,
  camera,
  domElement,
  raycaster,
  plane = null,
  origin = null,
  axisLock = null,
  snapDisabled = false,
  planeElevation = 0,
}) {
  if (!plane || !event || !camera || !domElement || !raycaster) {
    return projectPointerToGround({ event, camera, domElement, raycaster, origin, axisLock, snapDisabled, planeElevation })
  }

  const normal = plane.normal || [0, 1, 0]
  if (Math.abs(normal[0]) < 0.001 && Math.abs(normal[1] - 1) < 0.001 && Math.abs(normal[2]) < 0.001) {
    return projectPointerToGround({ event, camera, domElement, raycaster, origin, axisLock, snapDisabled, planeElevation: plane.origin?.[1] ?? planeElevation })
  }

  const rect = domElement.getBoundingClientRect()
  POINTER.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  POINTER.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(POINTER, camera)

  SKETCH_PLANE_NORMAL.set(normal[0] || 0, normal[1] || 0, normal[2] || 0).normalize()
  SKETCH_PLANE_ORIGIN.set(plane.origin?.[0] || 0, plane.origin?.[1] || 0, plane.origin?.[2] || 0)
  SKETCH_PLANE.setFromNormalAndCoplanarPoint(SKETCH_PLANE_NORMAL, SKETCH_PLANE_ORIGIN)

  const hit = raycaster.ray.intersectPlane(SKETCH_PLANE, INTERSECTION)
  if (!hit) return null

  SKETCH_PLANE_X.set(plane.xAxis?.[0] ?? 1, plane.xAxis?.[1] ?? 0, plane.xAxis?.[2] ?? 0).normalize()
  SKETCH_PLANE_Y.set(plane.yAxis?.[0] ?? 0, plane.yAxis?.[1] ?? 0, plane.yAxis?.[2] ?? 1).normalize()
  const relative = INTERSECTION.clone().sub(SKETCH_PLANE_ORIGIN)
  const raw = [relative.dot(SKETCH_PLANE_X), relative.dot(SKETCH_PLANE_Y)]
  const effectiveAxisLock = normalizeAxisLock(axisLock, origin, raw)
  const constrained = applyAxisLock(raw, origin, effectiveAxisLock)
  const { snapEnabled = true, snapStep = 0.5 } = useViewer.getState()
  const shouldSnap = snapEnabled && !snapDisabled
  const snapped = shouldSnap
    ? snapPoint(constrained, origin, effectiveAxisLock, snapStep)
    : constrained
  const world = SKETCH_PLANE_ORIGIN.clone()
    .add(SKETCH_PLANE_X.clone().multiplyScalar(snapped[0]))
    .add(SKETCH_PLANE_Y.clone().multiplyScalar(snapped[1]))

  return {
    valid: true,
    pointer: {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    },
    planeElevation: plane.origin?.[1] ?? planeElevation,
    world: constrained,
    worldPoint: [world.x, world.y, world.z],
    snapped,
    axisLock: effectiveAxisLock,
    snapEnabled: shouldSnap,
    snapStep,
  }
}

export function projectPointerToVerticalAxis({
  event,
  camera,
  domElement,
  raycaster,
  origin,
  snapDisabled = false,
}) {
  return projectPointerToAxis({
    event,
    camera,
    domElement,
    raycaster,
    origin,
    axis: [0, 1, 0],
    axisLock: 'vertical',
    snapDisabled,
  })
}

export function projectPointerToAxis({
  event,
  camera,
  domElement,
  raycaster,
  origin,
  axis = [0, 1, 0],
  axisLock = 'axis',
  snapDisabled = false,
}) {
  if (!event || !camera || !domElement || !raycaster || !origin) return null

  const rect = domElement.getBoundingClientRect()
  POINTER.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  POINTER.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(POINTER, camera)

  const axisOrigin = new THREE.Vector3(origin[0], origin[1] || 0, origin[2])
  const axisDirection = new THREE.Vector3(axis[0] || 0, axis[1] || 0, axis[2] || 0).normalize()
  const rayDirection = raycaster.ray.direction
  const rayAxisDot = rayDirection.dot(axisDirection)
  const denominator = 1 - rayAxisDot * rayAxisDot
  let axisDistance = 0

  if (Math.abs(denominator) > 1e-5) {
    RAY_ORIGIN_TO_AXIS.subVectors(raycaster.ray.origin, axisOrigin)
    axisDistance = (RAY_ORIGIN_TO_AXIS.dot(axisDirection) - rayAxisDot * RAY_ORIGIN_TO_AXIS.dot(rayDirection)) / denominator
  }

  const { snapEnabled = true, snapStep = 0.5 } = useViewer.getState()
  const shouldSnap = snapEnabled && !snapDisabled
  const snappedDistance = shouldSnap ? roundTo(axisDistance, snapStep) : axisDistance
  const snappedPoint = axisOrigin.clone().add(axisDirection.clone().multiplyScalar(snappedDistance))

  return {
    valid: true,
    pointer: {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    },
    world: [snappedPoint.x, snappedPoint.y, snappedPoint.z],
    snapped: [snappedPoint.x, snappedPoint.y, snappedPoint.z],
    axisDistance: snappedDistance,
    axisLock,
    snapEnabled: shouldSnap,
    snapStep,
    degenerate: Math.abs(denominator) <= 1e-5,
  }
}

export function useWorkbenchPlane() {
  const { camera, gl, raycaster } = useThree()

  return useCallback((event, options = {}) => projectPointerToGround({
    event,
    camera,
    domElement: gl.domElement,
    raycaster,
    ...options,
  }), [camera, gl, raycaster])
}

export function useSketchPlaneProjection() {
  const { camera, gl, raycaster } = useThree()

  return useCallback((event, options = {}) => projectPointerToSketchPlane({
    event,
    camera,
    domElement: gl.domElement,
    raycaster,
    ...options,
  }), [camera, gl, raycaster])
}
