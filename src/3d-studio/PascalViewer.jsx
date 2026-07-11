import {
  sceneRegistry,
  useScene,
} from '@pascal-app/core'
import {
  Bvh,
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
} from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import useViewer from '../../node_modules/@pascal-app/viewer/dist/store/use-viewer.js'
import { PerfMonitor } from '../../node_modules/@pascal-app/viewer/dist/components/viewer/perf-monitor.js'
import { SelectionManager } from '../../node_modules/@pascal-app/viewer/dist/components/viewer/selection-manager.js'
import { GuideSystem } from '../../node_modules/@pascal-app/viewer/dist/systems/guide/guide-system.js'
import { getLevelHeight } from '../../node_modules/@pascal-app/viewer/dist/systems/level/level-utils.js'
import useEditor from './store/useEditor'

const LIGHT_BG = '#e7edf6'
const GRID_MINOR = '#c9d3e0'
const GRID_MAJOR = '#94a6bf'
const GROUND_COLOR = '#dde5f1'
const AXIS_X = '#d14343'
const AXIS_Y = '#2f71da'
const AXIS_Z = '#2b8a57'
const EXPLODED_GAP = 5

function hasViewerDebugFlag(flag) {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).has(flag)
}

function AnimatedBackground() {
  const targetColor = useMemo(() => new THREE.Color(LIGHT_BG), [])

  useFrame(({ scene }) => {
    if (!(scene.background && scene.background instanceof THREE.Color)) {
      scene.background = targetColor.clone()
      return
    }
    scene.background.lerp(targetColor, 0.18)
  })

  return null
}

function GPUDeviceWatcher() {
  const gl = useThree((state) => state.gl)

  useEffect(() => {
    const device = gl?.backend?.device
    if (!device) return undefined

    device.lost.then((info) => {
      console.error(
        `[viewer] WebGPU device lost: reason="${info.reason}", message="${info.message}". The page must be reloaded to recover the GPU context.`,
      )
    })

    return undefined
  }, [gl])

  return null
}

function ViewerEffects() {
  const gl = useThree((state) => state.gl)
  const renderBackend = gl?.userData?.renderBackend || gl?.domElement?.dataset?.rendererBackend || (gl?.isWebGPURenderer ? 'webgpu' : 'unknown')

  if (renderBackend !== 'webgpu') return null

  return <GPUDeviceWatcher />
}

function StudioLevelSystem() {
  useFrame((_, delta) => {
    const nodes = useScene.getState().nodes
    const levelMode = useViewer.getState().levelMode
    const selectedLevel = useViewer.getState().selection.levelId
    const entries = []

    sceneRegistry.byType.level.forEach((levelId) => {
      const obj = sceneRegistry.nodes.get(levelId)
      const level = nodes[levelId]
      if (obj && level) {
        entries.push({ levelId, index: level.level ?? 0, obj })
      }
    })

    entries.sort((a, b) => a.index - b.index)

    let cumulativeY = 0
    for (const { levelId, index, obj } of entries) {
      const level = nodes[levelId]
      const baseY = cumulativeY
      const explodedExtra = levelMode === 'exploded' ? index * EXPLODED_GAP : 0
      const targetY = baseY + explodedExtra

      // Avoid positive render priorities here: they disable R3F auto-rendering.
      obj.position.y = THREE.MathUtils.lerp(obj.position.y, targetY, delta * 12)
      obj.visible = levelMode !== 'solo' || level?.id === selectedLevel || !selectedLevel
      cumulativeY += getLevelHeight(levelId, nodes)
    }
  })

  return null
}

async function createWebGpuRenderer(props) {
  const THREE_WEBGPU = await import('three/webgpu')
  const renderer = new THREE_WEBGPU.WebGPURenderer({
    ...props,
    antialias: true,
    alpha: false,
  })
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.9
  await renderer.init()
  renderer.setClearColor(LIGHT_BG, 1)
  renderer.userData = renderer.userData || {}
  renderer.userData.renderBackend = renderer.isWebGPURenderer ? 'webgpu' : 'webgl2-fallback'
  if (renderer.domElement) {
    renderer.domElement.dataset.rendererBackend = renderer.userData.renderBackend
  }
  return renderer
}

function createWebGlRenderer(props) {
  const renderer = new THREE.WebGLRenderer({
    ...props,
    antialias: true,
    alpha: false,
  })
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.9
  renderer.setClearColor(LIGHT_BG, 1)
  renderer.userData = renderer.userData || {}
  renderer.userData.renderBackend = 'webgl2'
  if (renderer.domElement) {
    renderer.domElement.dataset.rendererBackend = renderer.userData.renderBackend
  }
  return renderer
}

function StudioLights({ enableShadows = true }) {
  return (
    <>
      <ambientLight intensity={0.72} />
      <directionalLight
        castShadow={enableShadows}
        intensity={1.05}
        position={[18, 28, 16]}
        shadow-mapSize-height={2048}
        shadow-mapSize-width={2048}
      />
      <directionalLight intensity={0.35} position={[-14, 12, -10]} color="#9ec5ff" />
    </>
  )
}

function ViewerDiagnostics() {
  const lastSampleRef = useRef(0)

  useFrame(({ camera, clock, scene, gl }) => {
    const now = clock.getElapsedTime()
    if (now - lastSampleRef.current < 0.25) return
    lastSampleRef.current = now

    let meshCount = 0
    let lightCount = 0
    let lineCount = 0

    scene.traverse((object) => {
      if (object?.isMesh) meshCount += 1
      if (object?.isLight) lightCount += 1
      if (object?.isLine || object?.isLineSegments) lineCount += 1
    })

    if (typeof window !== 'undefined') {
      const { selection } = useViewer.getState()
      window.__ARCSPRO_VIEWER_STATE__ = {
        frameAt: new Date().toISOString(),
        elapsed: now,
        rendererBackend: gl?.userData?.renderBackend || gl?.domElement?.dataset?.rendererBackend || 'unknown',
        sceneChildren: scene.children.length,
        meshCount,
        lightCount,
        lineCount,
        camera: {
          position: {
            x: Number(camera.position.x.toFixed(3)),
            y: Number(camera.position.y.toFixed(3)),
            z: Number(camera.position.z.toFixed(3)),
          },
          type: camera.type,
        },
        selection: {
          selectedIds: [...(selection?.selectedIds || [])],
          levelId: selection?.levelId || null,
          zoneId: selection?.zoneId || null,
        },
      }
      if (import.meta.env.DEV) {
        window.__ARCSPRO_VIEWER_DEBUG__ = {
          scene,
          camera,
          gl,
          THREE,
        }
      }
    }
  })

  return null
}

function DevDebugMarker({ sceneBounds, referenceMode = 'world' }) {
  if (!import.meta.env.DEV) return null
  if (!hasViewerDebugFlag('showDebugMarker')) return null

  const width = Math.max(sceneBounds?.width || 24, 8)
  const depth = Math.max(sceneBounds?.depth || 18, 8)
  const target = referenceMode === 'bounded' ? [width / 2, 1.2, depth / 2] : [0, 1.2, 0]

  return (
    <mesh position={target} renderOrder={1000}>
      <boxGeometry args={[2.4, 2.4, 2.4]} />
      <meshStandardMaterial color="#ff2d55" emissive="#6b1026" emissiveIntensity={0.8} />
    </mesh>
  )
}

function CameraBoundLayer({ children }) {
  return <group>{children}</group>
}

function InfiniteGroundPlane({ enabled = true }) {
  const visible = useViewer((state) => state.showGroundPlane ?? true)
  if (!enabled || !visible) return null

  return (
    <CameraBoundLayer>
      <mesh position={[0, -0.002, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[640, 640]} />
        <meshStandardMaterial color={GROUND_COLOR} roughness={0.96} metalness={0.02} />
      </mesh>
    </CameraBoundLayer>
  )
}

function MajorMinorGrid() {
  const showGrid = useViewer((state) => state.showGrid ?? true)
  const minorGrid = useMemo(() => {
    const helper = new THREE.GridHelper(640, 128, GRID_MAJOR, GRID_MINOR)
    helper.position.y = 0.01
    if (Array.isArray(helper.material)) {
      helper.material.forEach((material) => {
        material.transparent = true
        material.opacity = 0.72
        material.depthWrite = false
      })
    } else {
      helper.material.transparent = true
      helper.material.opacity = 0.72
      helper.material.depthWrite = false
    }
    return helper
  }, [])

  useEffect(() => () => {
    minorGrid.geometry?.dispose?.()
    if (Array.isArray(minorGrid.material)) {
      minorGrid.material.forEach((material) => material.dispose?.())
    } else {
      minorGrid.material?.dispose?.()
    }
  }, [minorGrid])

  if (!showGrid) return null

  return (
    <primitive object={minorGrid} />
  )
}

function WorldAxesAtOrigin({ enabled = true }) {
  const showWorldAxes = useViewer((state) => state.showWorldAxes ?? true)

  if (!enabled || !showWorldAxes) return null

  return (
    <group renderOrder={12}>
      <AxisRod axis="x" color={AXIS_X} length={18} />
      <AxisRod axis="z" color={AXIS_Z} length={18} />
      <AxisRod axis="y" color={AXIS_Y} length={8} />
    </group>
  )
}

function OriginDisc({ enabled = true }) {
  const showWorldAxes = useViewer((state) => state.showWorldAxes ?? true)
  if (!enabled || !showWorldAxes) return null

  return (
    <group>
      <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={15}>
        <circleGeometry args={[0.35, 32]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={1} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={16}>
        <ringGeometry args={[0.35, 0.48, 48]} />
        <meshBasicMaterial color="#0f172a" transparent opacity={0.45} depthWrite={false} />
      </mesh>
    </group>
  )
}

function AxisRod({ axis, color, length }) {
  const isY = axis === 'y'
  const rotation = axis === 'x'
    ? [0, 0, -Math.PI / 2]
    : axis === 'z'
      ? [Math.PI / 2, 0, 0]
      : [0, 0, 0]
  const position = axis === 'x'
    ? [length / 2, 0.18, 0]
    : axis === 'z'
      ? [0, 0.18, length / 2]
      : [0, length / 2, 0]

  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow={false} renderOrder={14}>
        <cylinderGeometry args={[0.06, 0.06, length, 12]} />
        <meshBasicMaterial color={color} depthWrite={false} />
      </mesh>
      <mesh position={[0, length / 2 + (isY ? 0.2 : 0.1), 0]} renderOrder={15}>
        <coneGeometry args={[0.18, 0.45, 12]} />
        <meshBasicMaterial color={color} depthWrite={false} />
      </mesh>
    </group>
  )
}

function SiteBoundary() {
  const nodes = useScene((state) => state.nodes)
  const showSiteBoundary = useViewer((state) => state.showSiteBoundary ?? true)

  const geometry = useMemo(() => {
    const siteNode = Object.values(nodes || {}).find((node) => node?.type === 'site')
    const points = siteNode?.polygon?.points || null
    if (!points || points.length < 2) return null

    const vertices = []
    for (const [x, z] of points) {
      vertices.push(x ?? 0, 0.015, z ?? 0)
    }
    vertices.push(points[0][0] ?? 0, 0.015, points[0][1] ?? 0)

    const nextGeometry = new THREE.BufferGeometry()
    nextGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    return nextGeometry
  }, [nodes])

  useEffect(() => () => {
    geometry?.dispose()
  }, [geometry])

  if (!showSiteBoundary || !geometry) return null

  return (
    <line geometry={geometry} renderOrder={10}>
      <lineBasicMaterial color="#f59e0b" transparent opacity={0.92} depthWrite={false} />
    </line>
  )
}

function EditorReferenceFrame({ showGroundPlane = true, showWorldAxes = true }) {
  return (
    <>
      <InfiniteGroundPlane enabled={showGroundPlane} />
      <MajorMinorGrid />
      <SiteBoundary />
      <WorldAxesAtOrigin enabled={showWorldAxes} />
      <OriginDisc enabled={showWorldAxes} />
    </>
  )
}

function ViewerCameras({ sceneBounds }) {
  const cameraMode = useViewer((state) => state.cameraMode)
  const span = Math.max(sceneBounds?.width || 24, sceneBounds?.depth || 18, sceneBounds?.height || 9, 16)
  const far = Math.max(1600, span * 4)

  return (
    <>
      <PerspectiveCamera makeDefault={cameraMode === 'perspective'} far={far} fov={46} near={0.1} position={[16, 12, 16]} />
      <OrthographicCamera makeDefault={cameraMode === 'orthographic'} far={far} near={-far} position={[16, 12, 16]} zoom={24} />
    </>
  )
}

function SceneViewportController({ lightweight = false, sceneBounds, referenceMode = 'world' }) {
  const camera = useThree((state) => state.camera)
  const controlsRef = useRef(null)
  const viewPreset = useEditor((state) => state.viewportView)
  const cameraMode = useViewer((state) => state.cameraMode)
  const setCameraDragging = useViewer((state) => state.setCameraDragging)

  const target = useMemo(() => {
    const width = Math.max(sceneBounds?.width || 24, 8)
    const depth = Math.max(sceneBounds?.depth || 18, 8)
    const centerX = Number.isFinite(Number(sceneBounds?.centerX)) ? Number(sceneBounds.centerX) : null
    const centerY = Number.isFinite(Number(sceneBounds?.centerY)) ? Number(sceneBounds.centerY) : null
    const centerZ = Number.isFinite(Number(sceneBounds?.centerZ)) ? Number(sceneBounds.centerZ) : null

    if (referenceMode === 'bounded') {
      return {
        x: centerX ?? width / 2,
        y: centerY ?? 0,
        z: centerZ ?? depth / 2,
      }
    }

    return { x: centerX ?? 0, y: centerY ?? 0, z: centerZ ?? 0 }
  }, [referenceMode, sceneBounds?.centerX, sceneBounds?.centerY, sceneBounds?.centerZ, sceneBounds?.depth, sceneBounds?.width])

  const span = Math.max(sceneBounds?.width || 24, sceneBounds?.depth || 18, sceneBounds?.height || 9, 16)

  useFrame(() => {
    if (viewPreset !== 'top') return

    const distance = Math.max(span * 0.95, 14)
    camera.position.set(target.x, distance * 1.1, target.z)
    camera.up.set(0, 0, -1)
    camera.lookAt(target.x, target.y, target.z)

    if (camera.isOrthographicCamera) {
      camera.zoom = Math.max(12, 60 / span)
    }
    camera.updateProjectionMatrix()

    if (controlsRef.current) {
      controlsRef.current.target.set(target.x, target.y, target.z)
    }
  })

  useEffect(() => {
    const distance = Math.max(span * 0.95, 14)
    const positionByView = {
      iso: [target.x + distance, Math.max(distance * 0.75, 12), target.z + distance],
      top: [target.x, distance * 1.1, target.z],
      front: [target.x, Math.max(distance * 0.38, 8), target.z + distance],
      right: [target.x + distance, Math.max(distance * 0.38, 8), target.z],
    }

    const nextPosition = positionByView[viewPreset] || positionByView.iso

    if (controlsRef.current) {
      controlsRef.current.target.set(target.x, target.y, target.z)
    }

    camera.position.set(...nextPosition)

    if (viewPreset === 'top') {
      camera.up.set(0, 0, -1)
    } else {
      camera.up.set(0, 1, 0)
    }

    camera.lookAt(target.x, target.y, target.z)

    if (camera.isOrthographicCamera) {
      camera.zoom = Math.max(12, 60 / span)
      camera.updateProjectionMatrix()
    } else {
      camera.updateProjectionMatrix()
    }

    if (controlsRef.current) {
      if (viewPreset !== 'top') {
        controlsRef.current.update()
      }
    }
  }, [camera, cameraMode, span, target, viewPreset])

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      dampingFactor={lightweight ? 0 : 0.08}
      enableDamping={!lightweight}
      enabled={viewPreset !== 'top'}
      enablePan
      enableRotate={viewPreset !== 'top'}
      maxPolarAngle={viewPreset === 'top' ? 0.0001 : Math.PI / 2.02}
      minPolarAngle={viewPreset === 'top' ? 0.0001 : 0}
      mouseButtons={{
        LEFT: -1,
        MIDDLE: THREE.MOUSE?.PAN ?? 2,
        RIGHT: THREE.MOUSE?.ROTATE ?? 0,
      }}
      onEnd={() => setCameraDragging(false)}
      onStart={() => setCameraDragging(true)}
      screenSpacePanning
    />
  )
}

export default function PascalViewer({
  children,
  toolOverlays,
  enableBvh = true,
  enableShadows = true,
  selectionManager = 'default',
  perf = false,
  preferWebGpu = true,
  sceneBounds,
  referenceMode = 'world',
  defaultView = 'iso',
  lightweight = false,
  showAxisGizmo = true,
  showGroundPlane = true,
}) {
  const theme = useViewer((state) => state.theme)
  const canvasGl = lightweight
    ? { alpha: false, antialias: false, powerPreference: 'low-power', preserveDrawingBuffer: false }
    : ((props) => (
      preferWebGpu
        ? createWebGpuRenderer({ ...props, preserveDrawingBuffer: true })
        : createWebGlRenderer({ ...props, preserveDrawingBuffer: true })
    ))

  useEffect(() => {
    const previousTheme = useViewer.getState().theme

    useViewer.getState().setTheme('light')
    useEditor.getState().setViewportView(defaultView)

    return () => {
      if (previousTheme !== useViewer.getState().theme) {
        useViewer.getState().setTheme(previousTheme)
      }
    }
  }, [defaultView, showAxisGizmo, showGroundPlane])

  return (
    <Canvas
      className={`transition-colors duration-700 ${theme === 'light' ? 'bg-[#edf1f7]' : 'bg-[#1f2433]'}`}
      dpr={lightweight ? 1 : [1, 1.5]}
      frameloop={lightweight ? 'demand' : 'always'}
      gl={canvasGl}
      resize={{ debounce: 100 }}
      shadows={enableShadows ? { type: THREE.PCFShadowMap, enabled: true } : false}
      style={{ width: '100%', height: '100%' }}
      onCreated={({ gl }) => {
        gl.setClearColor(LIGHT_BG, 1)
        gl.userData = gl.userData || {}
        gl.userData.renderBackend = gl.userData.renderBackend || (gl.isWebGLRenderer ? 'webgl2' : (gl.isWebGPURenderer ? 'webgpu' : 'unknown'))
        if (gl.domElement) gl.domElement.dataset.rendererBackend = gl.userData.renderBackend
        if (typeof window !== 'undefined') {
          window.__ARCSPRO_RENDERERS__ = {
            PascalViewer: {
              backend: gl?.userData?.renderBackend || (gl?.isWebGPURenderer ? 'webgpu' : 'unknown'),
            },
          }
        }
      }}
    >
      <color attach="background" args={[LIGHT_BG]} />
      <ViewerCameras sceneBounds={sceneBounds} />
      <SceneViewportController lightweight={lightweight} referenceMode={referenceMode} sceneBounds={sceneBounds} />
      {lightweight ? null : <AnimatedBackground />}
      <StudioLights enableShadows={enableShadows} />
      {lightweight ? null : <EditorReferenceFrame showGroundPlane={showGroundPlane} showWorldAxes={showAxisGizmo} />}
      <DevDebugMarker sceneBounds={sceneBounds} referenceMode={referenceMode} />
      {enableBvh ? <Bvh>{children}</Bvh> : children}
      {toolOverlays}
      {lightweight ? null : <StudioLevelSystem />}
      {lightweight ? null : <GuideSystem />}
      {lightweight ? null : <ViewerDiagnostics />}
      {selectionManager === 'default' ? <SelectionManager /> : null}
      {perf ? <PerfMonitor /> : null}
      {lightweight ? null : <ViewerEffects />}
    </Canvas>
  )
}
