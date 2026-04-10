import { Suspense, useEffect, useMemo } from 'react'
import { Canvas, useThree, extend } from '@react-three/fiber'
import { Bounds, Grid, OrbitControls } from '@react-three/drei'
import * as THREE from 'three/webgpu'
import { createPreferredRenderer } from '../../utils/createPreferredRenderer'

// 注册 WebGPU 节点类型
extend(THREE)

const MM_TO_SCENE = 0.001

function readValue(record, ...keys) {
    for (const key of keys) {
        if (record?.[key] !== undefined && record?.[key] !== null) return record[key]
    }
    return null
}

function pointFrom(record) {
    if (!record) return { x: 0, y: 0, z: 0 }
    return {
        x: Number(readValue(record, 'x') || 0) * MM_TO_SCENE,
        y: Number(readValue(record, 'y') || 0) * MM_TO_SCENE,
        z: Number(readValue(record, 'z') || 0) * MM_TO_SCENE,
    }
}

function dimsFrom(record, fallback = { width: 1, height: 1, depth: 1 }) {
    if (!record) return fallback
    return {
        width: Math.max(Number(readValue(record, 'widthMm', 'width_mm') || fallback.width / MM_TO_SCENE), 1) * MM_TO_SCENE,
        height: Math.max(Number(readValue(record, 'heightMm', 'height_mm') || fallback.height / MM_TO_SCENE), 1) * MM_TO_SCENE,
        depth: Math.max(Number(readValue(record, 'depthMm', 'depth_mm') || fallback.depth / MM_TO_SCENE), 1) * MM_TO_SCENE,
    }
}

function SceneCamera({ warehouseSize, viewMode }) {
    const { camera } = useThree()
    useEffect(() => {
        const span = Math.max(warehouseSize.width, warehouseSize.depth, warehouseSize.height) || 20
        const views = {
            iso: [span * 1.15, span * 0.95, span * 1.15],
            top: [0, span * 1.8, 0.001],
            side: [span * 1.6, span * 0.55, 0],
        }
        const [x, y, z] = views[viewMode] || views.iso
        camera.position.set(x, y, z)
        camera.lookAt(0, warehouseSize.height * 0.2, 0)
        camera.updateProjectionMatrix()
    }, [camera, viewMode, warehouseSize.depth, warehouseSize.height, warehouseSize.width])
    return null
}

function SceneGrid(props) {
    const gl = useThree((state) => state.gl)
    const renderBackend = gl?.domElement?.dataset?.rendererBackend

    if (renderBackend === 'webgpu') return null

    return <Grid {...props} />
}

function WarehouseShell({ warehouseSize }) {
    return (
        <group>
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[warehouseSize.width, warehouseSize.depth]} />
                <meshStandardMaterial color="#dce7f5" />
            </mesh>
            <lineSegments position={[0, warehouseSize.height / 2, 0]}>
                <edgesGeometry args={[new THREE.BoxGeometry(warehouseSize.width, warehouseSize.height, warehouseSize.depth)]} />
                <lineBasicMaterial color="#475569" />
            </lineSegments>
        </group>
    )
}

function ZoneMeshes({ zones = [] }) {
    return zones.map((zone) => {
        const bounds = readValue(zone, 'bounds_mm', 'boundsMm') || {}
        const width = Math.max(Number(readValue(bounds, 'widthMm', 'width_mm') || 0), 1) * MM_TO_SCENE
        const height = Math.max(Number(readValue(bounds, 'heightMm', 'height_mm') || 600), 600) * MM_TO_SCENE
        const depth = Math.max(Number(readValue(bounds, 'depthMm', 'depth_mm') || 0), 1) * MM_TO_SCENE
        const x = Number(readValue(bounds, 'x') || 0) * MM_TO_SCENE + width / 2
        const y = Number(readValue(bounds, 'y') || 0) * MM_TO_SCENE + height / 2
        const z = Number(readValue(bounds, 'z') || 0) * MM_TO_SCENE + depth / 2
        return (
            <mesh key={`zone-${zone.id}`} position={[x, y, z]}>
                <boxGeometry args={[width, height, depth]} />
                <meshStandardMaterial color="#7dd3fc" transparent opacity={0.12} />
            </mesh>
        )
    })
}

function RackMeshes({ racks = [] }) {
    return racks.map((rack) => {
        const templateDimensions = readValue(rack, 'outer_dimensions_mm', 'outerDimensionsMm') ||
            readValue(rack, 'rack_template_outer_dimensions_mm', 'rackTemplateOuterDimensionsMm')
        const size = dimsFrom(templateDimensions, { width: 2.4, height: 3.2, depth: 1 })
        const position = pointFrom(readValue(rack, 'position_mm', 'positionMm'))
        return (
            <mesh
                key={`rack-${rack.id}`}
                position={[position.x + size.width / 2, position.y + size.height / 2, position.z + size.depth / 2]}
                castShadow
                receiveShadow
            >
                <boxGeometry args={[size.width, size.height, size.depth]} />
                <meshStandardMaterial color="#334155" roughness={0.65} metalness={0.15} />
            </mesh>
        )
    })
}

function LocationMeshes({ locations = [], selectedLocationId, onSelectLocation }) {
    return locations.map((location) => {
        const size = dimsFrom(readValue(location, 'dimensions_mm', 'dimensionsMm'), { width: 0.8, height: 0.8, depth: 0.8 })
        const transform = pointFrom(readValue(location, 'transform'))
        const used = Number(readValue(location, 'used_capacity', 'usedCapacity') || 0)
        const capacity = Math.max(Number(readValue(location, 'capacity') || 1), 1)
        const status = readValue(location, 'status')
        const ratio = Math.min(used / capacity, 1)
        const color = selectedLocationId === location.id
            ? '#fb7185'
            : ratio > 0
                ? '#f59e0b'
                : status === 'locked'
                    ? '#94a3b8'
                    : '#10b981'

        return (
            <mesh
                key={`location-${location.id}`}
                position={[transform.x + size.width / 2, transform.y + size.height / 2, transform.z + size.depth / 2]}
                onClick={(event) => {
                    event.stopPropagation()
                    onSelectLocation?.(location.id)
                }}
                castShadow
            >
                <boxGeometry args={[size.width, size.height, size.depth]} />
                <meshStandardMaterial color={color} transparent opacity={selectedLocationId === location.id ? 0.95 : 0.75} />
            </mesh>
        )
    })
}

function ObjectMeshes({ objects = [], locations = [] }) {
    const locationMap = useMemo(() => new Map(locations.map((location) => [location.id, location])), [locations])

    return objects.map((object) => {
        const location = locationMap.get(readValue(object, 'current_location_id', 'currentLocationId'))
        if (!location) return null

        const locationTransform = pointFrom(readValue(location, 'transform'))
        const locationSize = dimsFrom(readValue(location, 'dimensions_mm', 'dimensionsMm'), { width: 0.8, height: 0.8, depth: 0.8 })
        const objectSize = dimsFrom(readValue(object, 'dimensions_mm', 'dimensionsMm'), {
            width: locationSize.width * 0.72,
            height: locationSize.height * 0.72,
            depth: locationSize.depth * 0.72,
        })
        const shapeType = readValue(object, 'shape_type', 'shapeType') || 'box'
        const position = [
            locationTransform.x + locationSize.width / 2,
            locationTransform.y + objectSize.height / 2,
            locationTransform.z + locationSize.depth / 2,
        ]

        if (shapeType === 'drum') {
            return (
                <mesh key={`object-${object.id}`} position={position} castShadow>
                    <cylinderGeometry args={[objectSize.width / 2, objectSize.width / 2, objectSize.height, 24]} />
                    <meshStandardMaterial color="#2563eb" roughness={0.45} metalness={0.1} />
                </mesh>
            )
        }

        return (
            <mesh key={`object-${object.id}`} position={position} castShadow>
                <boxGeometry args={[objectSize.width, objectSize.height, objectSize.depth]} />
                <meshStandardMaterial color={shapeType === 'bin' ? '#0f766e' : '#1d4ed8'} roughness={0.45} metalness={0.08} />
            </mesh>
        )
    })
}

export default function TwinSceneCanvas({
    scene,
    viewMode = 'iso',
    selectedLocationId = null,
    onSelectLocation,
}) {
    const warehouseDimensions = dimsFrom(readValue(scene?.warehouse, 'dimensions_mm', 'dimensionsMm'), { width: 24, height: 9, depth: 18 })
    const centered = {
        width: warehouseDimensions.width,
        height: warehouseDimensions.height,
        depth: warehouseDimensions.depth,
    }

    return (
        <Canvas
            shadows
            dpr={[1, 1.5]}
            camera={{ fov: 42, near: 0.1, far: 2000 }}
            gl={(props) => createPreferredRenderer(props, {
                label: 'TwinSceneCanvas',
            })}
            style={{ width: '100%', height: '100%' }}
            onPointerMissed={() => onSelectLocation?.(null)}
        >
            <color attach="background" args={['#eef4fb']} />
            <fog attach="fog" args={['#eef4fb', 18, 80]} />
            <ambientLight intensity={0.7} />
            <directionalLight position={[12, 18, 8]} intensity={1.2} castShadow shadow-mapSize={[2048, 2048]} />
            <pointLight position={[-8, 6, -8]} intensity={0.25} color="#38bdf8" />
            <Suspense fallback={null}>
                <SceneCamera warehouseSize={centered} viewMode={viewMode} />
                <OrbitControls
                    makeDefault
                    enableDamping
                    dampingFactor={0.08}
                    maxPolarAngle={Math.PI / 2.05}
                    enableRotate={viewMode !== 'top'}
                />
                <SceneGrid
                    position={[centered.width / 2, 0, centered.depth / 2]}
                    args={[Math.max(centered.width, centered.depth) * 1.4, Math.max(centered.width, centered.depth) * 1.4]}
                    cellSize={1}
                    cellThickness={0.5}
                    sectionSize={5}
                    sectionThickness={1}
                    fadeDistance={60}
                    fadeStrength={1.4}
                    cellColor="#cbd5e1"
                    sectionColor="#94a3b8"
                />
                <Bounds fit clip observe margin={1.25}>
                    <group position={[-centered.width / 2, 0, -centered.depth / 2]}>
                        <WarehouseShell warehouseSize={centered} />
                        <ZoneMeshes zones={scene?.zones} />
                        <RackMeshes racks={scene?.racks} />
                        <LocationMeshes
                            locations={scene?.locations}
                            selectedLocationId={selectedLocationId}
                            onSelectLocation={onSelectLocation}
                        />
                        <ObjectMeshes objects={scene?.objects} locations={scene?.locations} />
                    </group>
                </Bounds>
            </Suspense>
        </Canvas>
    )
}
