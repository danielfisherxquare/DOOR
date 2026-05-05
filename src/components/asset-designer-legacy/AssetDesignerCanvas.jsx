import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Canvas, useThree, extend } from '@react-three/fiber'
import { OrbitControls, Edges } from '@react-three/drei'
import * as THREE from 'three/webgpu'
import { createPreferredRenderer } from '../../utils/createPreferredRenderer'

// 注册 WebGPU 节点类型以便后续能够支持 R3F 中的 Nodes/Materials
if (THREE.WebGPURenderer) {
    extend(THREE)
}
import { zoneColorPresets, floorMaterialPresets, rackFinishPresets, getZoneColor, outdoorGroundPresets } from '../../data/materialPresets'
import { getPrefabById } from '../../data/prefabRegistry'
import PrefabMesh from './PrefabMesh'
import { WallWithOpeningsBatch } from './WallWithOpenings'
import WallDrawTool from './WallDrawTool'
import OpeningPlacer from './OpeningPlacer'
import StructureMeshes from './StructureMeshes'
import StructurePlacer from './StructurePlacer'
import LevelElevationMarker from './LevelElevationMarker'
import MeasureTool from './MeasureTool'
import MeasurementOverlay from './MeasurementOverlay'
import { filterByLevel } from '../../utils/levelUtils'
import { snapToGrid, GRID_SIZE } from '../../utils/snapEngine'

const MM_TO_SCENE = 0.001

// 辅助函数
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

// 相机控制
function SceneCamera({ warehouseSize }) {
    const { camera } = useThree()
    useEffect(() => {
        const span = Math.max(warehouseSize.width, warehouseSize.depth, warehouseSize.height) || 20
        camera.position.set(span * 1.15, span * 0.95, span * 1.15)
        camera.lookAt(0, warehouseSize.height * 0.2, 0)
        camera.updateProjectionMatrix()
    }, [camera, warehouseSize.depth, warehouseSize.height, warehouseSize.width])
    return null
}

function GroundGrid({
    width,
    depth,
    theme = 'dark',
    sceneType = 'warehouse',
}) {
    const texture = useMemo(() => {
        const canvas = document.createElement('canvas')
        canvas.width = 512
        canvas.height = 512
        const context = canvas.getContext('2d')
        if (!context) return null

        context.clearRect(0, 0, canvas.width, canvas.height)

        const minorColor = theme === 'light'
            ? 'rgba(71, 85, 105, 0.12)'
            : (sceneType === 'outdoor-event' ? 'rgba(134, 239, 172, 0.14)' : 'rgba(125, 211, 252, 0.12)')
        const majorColor = theme === 'light'
            ? 'rgba(37, 99, 235, 0.18)'
            : (sceneType === 'outdoor-event' ? 'rgba(74, 222, 128, 0.2)' : 'rgba(129, 140, 248, 0.2)')

        const cell = canvas.width / 5

        for (let index = 0; index <= 5; index += 1) {
            const position = Math.round(index * cell)
            context.strokeStyle = index === 0 || index === 5 ? majorColor : minorColor
            context.lineWidth = index === 0 || index === 5 ? 2 : 1

            context.beginPath()
            context.moveTo(position, 0)
            context.lineTo(position, canvas.height)
            context.stroke()

            context.beginPath()
            context.moveTo(0, position)
            context.lineTo(canvas.width, position)
            context.stroke()
        }

        const nextTexture = new THREE.CanvasTexture(canvas)
        nextTexture.wrapS = THREE.RepeatWrapping
        nextTexture.wrapT = THREE.RepeatWrapping
        nextTexture.repeat.set(Math.max(width / 5, 1), Math.max(depth / 5, 1))
        nextTexture.anisotropy = 8
        nextTexture.needsUpdate = true
        return nextTexture
    }, [depth, sceneType, theme, width])

    useEffect(() => () => texture?.dispose(), [texture])

    if (!texture) return null

    return (
        <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0.012, 0]}
            raycast={() => null}
            renderOrder={2}
        >
            <planeGeometry args={[width, depth]} />
            <meshBasicMaterial
                map={texture}
                transparent
                opacity={0.95}
                depthWrite={false}
            />
        </mesh>
    )
}

// 仓库外壳与地板点击区域
function WarehouseShell({ warehouseSize, mode, activeTemplateId, activePrefabId, onAddRack, onAddPrefab, onAddZone, floorColor, edgeColor, sceneType, theme }) {
    const [ghostPos, setGhostPos] = useState(null)
    const isPlacing = (mode === 'place' && (activeTemplateId || activePrefabId)) || mode === 'zone'

    const snapPlacementPoint = useCallback((worldPoint) => {
        const localPoint = {
            x: worldPoint.x + warehouseSize.width / 2,
            z: worldPoint.z + warehouseSize.depth / 2,
        }
        const snapped = snapToGrid(localPoint, GRID_SIZE)
        return {
            local: snapped,
            world: {
                x: snapped.x - warehouseSize.width / 2,
                z: snapped.z - warehouseSize.depth / 2,
            },
        }
    }, [warehouseSize.depth, warehouseSize.width])

    // WarehouseShell group 位于 [width/2, 0, depth/2]，因此地板中心在世界原点
    // e.point 是世界坐标，需要加回外层 group 的偏移量才是外层 group 的局部坐标
    const handlePointerMove = useCallback((e) => {
        if (!isPlacing) {
            if (ghostPos) setGhostPos(null)
            return
        }
        e.stopPropagation()
        const snapped = snapPlacementPoint(e.point)
        setGhostPos([snapped.world.x, 0.1, snapped.world.z])
    }, [ghostPos, isPlacing, snapPlacementPoint])

    const handleClick = useCallback((e) => {
        if (!isPlacing) return
        e.stopPropagation()
        const snapped = snapPlacementPoint(e.point)
        const localX = snapped.local.x
        const localZ = snapped.local.z
        setGhostPos([snapped.world.x, 0.1, snapped.world.z])
        if (activePrefabId) {
            onAddPrefab?.(activePrefabId, { x: localX, z: localZ })
        } else if (activeTemplateId) {
            onAddRack?.(activeTemplateId, { x: localX, z: localZ })
        } else if (mode === 'zone') {
            onAddZone?.({ x: localX, z: localZ })
        }
    }, [activePrefabId, activeTemplateId, isPlacing, mode, onAddPrefab, onAddRack, onAddZone, snapPlacementPoint])

    // Ghost 预览渲染
    const renderGhost = () => {
        if (!isPlacing || !ghostPos) return null

        if (activePrefabId) {
            const meta = getPrefabById(activePrefabId)
            if (!meta) return null
            const Component = meta.Component
            return (
                <group position={[ghostPos[0], 0, ghostPos[2]]}>
                    <Suspense fallback={null}>
                        <group>
                            <Component />
                            <mesh position={[0, (meta.defaultDimensions.heightMm / 1000) / 2, 0]}>
                                <boxGeometry args={[
                                    meta.defaultDimensions.widthMm / 1000,
                                    meta.defaultDimensions.heightMm / 1000,
                                    meta.defaultDimensions.depthMm / 1000,
                                ]} />
                                <meshStandardMaterial color="#818CF8" transparent opacity={0.15} />
                            </mesh>
                        </group>
                    </Suspense>
                </group>
            )
        }

        // 货架 Ghost
        if (activeTemplateId) {
            return (
                <mesh position={[ghostPos[0], 1.6, ghostPos[2]]}>
                    <boxGeometry args={[2.4, 3.2, 1.0]} />
                    <meshStandardMaterial color="#818CF8" transparent opacity={0.5} />
                    <Edges scale={1.05} color="#C7D2FE" />
                </mesh>
            )
        }

        // 分区 Ghost
        if (mode === 'zone') {
            const isEvent = sceneType === 'outdoor-event'
            const zoneW = isEvent ? 5 : 6
            const zoneD = isEvent ? 5 : 4
            const zoneH = 0.6
            return (
                <mesh position={[ghostPos[0], zoneH / 2, ghostPos[2]]}>
                    <boxGeometry args={[zoneW, zoneH, zoneD]} />
                    <meshStandardMaterial color="#7dd3fc" transparent opacity={0.3} />
                    <Edges scale={1.02} color="#38bdf8" />
                </mesh>
            )
        }

        return null
    }

    return (
        <group position={[warehouseSize.width / 2, 0, warehouseSize.depth / 2]}>
            {/* 地板接收事件 */}
            <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                receiveShadow
                onPointerMove={handlePointerMove}
                onClick={handleClick}
            >
                <planeGeometry args={[warehouseSize.width, warehouseSize.depth]} />
                <meshStandardMaterial color={floorColor} roughness={0.8} />
            </mesh>
            <GroundGrid width={warehouseSize.width} depth={warehouseSize.depth} theme={theme} sceneType={sceneType} />
            <lineSegments position={[0, warehouseSize.height / 2, 0]}>
                <edgesGeometry args={[new THREE.BoxGeometry(warehouseSize.width, warehouseSize.height, warehouseSize.depth)]} />
                <lineBasicMaterial color={edgeColor} />
            </lineSegments>

            {renderGhost()}
        </group>
    )
}

// 区域渲染
function ZoneMeshes({ zones = [], selection, onSelect, mode, paintMode, activeMaterialId, onUpdateZone }) {
    return zones.map((zone) => {
        const bounds = readValue(zone, 'bounds_mm', 'boundsMm') || {}
        const width = Math.max(Number(readValue(bounds, 'widthMm', 'width_mm') || 0), 1) * MM_TO_SCENE
        const height = Math.max(Number(readValue(bounds, 'heightMm', 'height_mm') || 600), 600) * MM_TO_SCENE
        const depth = Math.max(Number(readValue(bounds, 'depthMm', 'depth_mm') || 0), 1) * MM_TO_SCENE
        const x = Number(readValue(bounds, 'x') || 0) * MM_TO_SCENE + width / 2
        const y = Number(readValue(bounds, 'y') || 0) * MM_TO_SCENE + height / 2
        const z = Number(readValue(bounds, 'z') || 0) * MM_TO_SCENE + depth / 2

        const isSelected = selection?.type === 'zone' && selection?.id === zone.id
        const baseColor = getZoneColor(readValue(zone, 'zone_type', 'zoneType'))
        const color = isSelected ? '#A5B4FC' : baseColor

        return (
            <mesh
                key={`zone-${zone.id}`}
                position={[x, y, z]}
                onClick={(e) => {
                    e.stopPropagation()
                    if (paintMode === 'zoneColor' && activeMaterialId) {
                        onUpdateZone?.(zone.id, { zoneType: activeMaterialId })
                    } else if (mode === 'select' || mode === 'delete') {
                        onSelect('zone', zone.id)
                    }
                }}
            >
                <boxGeometry args={[width, height, depth]} />
                <meshStandardMaterial color={color} transparent opacity={isSelected ? 0.3 : 0.12} />
                {isSelected && <Edges scale={1.01} threshold={15} color="#818CF8" />}
            </mesh>
        )
    })
}

// 货架渲染
function RackMeshes({ racks = [], selection, onSelect, mode, paintMode, activeMaterialId, onUpdateRack }) {
    return racks.map((rack) => {
        const templateDimensions = readValue(rack, 'outer_dimensions_mm', 'outerDimensionsMm') ||
            readValue(rack, 'rack_template_outer_dimensions_mm', 'rackTemplateOuterDimensionsMm')
        const size = dimsFrom(templateDimensions, { width: 2.4, height: 3.2, depth: 1 })
        const position = pointFrom(readValue(rack, 'position_mm', 'positionMm'))

        const isSelected = selection?.type === 'rack' && selection?.id === rack.id

        const finishMap = {
            steel: '#475569',
            wood: '#8B5A2B',
            blue: '#2563EB',
            orange: '#EA580C',
        }
        const assignedFinish = readValue(rack, 'finish') || 'steel'
        const baseColor = finishMap[assignedFinish] || finishMap.steel
        const color = isSelected ? '#A5B4FC' : baseColor

        return (
            <mesh
                key={`rack-${rack.id}`}
                position={[position.x + size.width / 2, position.y + size.height / 2, position.z + size.depth / 2]}
                castShadow
                receiveShadow
                onClick={(e) => {
                    e.stopPropagation()
                    if (paintMode === 'rackFinish' && activeMaterialId) {
                        onUpdateRack?.(rack.id, { finish: activeMaterialId })
                    } else if (mode === 'select' || mode === 'delete') {
                        onSelect('rack', rack.id)
                    }
                }}
            >
                <boxGeometry args={[size.width, size.height, size.depth]} />
                <meshStandardMaterial color={color} roughness={0.65} metalness={0.15} />
                {isSelected && <Edges scale={1.02} threshold={15} color="#818CF8" />}
            </mesh>
        )
    })
}

// 预制物实例渲染
function PrefabInstances({ prefabs = [], selection, onSelect, mode }) {
    return prefabs.map((inst) => (
        <PrefabMesh
            key={`prefab-${inst.id}`}
            instance={inst}
            isSelected={selection?.type === 'prefab' && selection?.id === inst.id}
            onClick={() => {
                if (mode === 'select' || mode === 'delete') {
                    onSelect('prefab', inst.id)
                }
            }}
        />
    ))
}

export default function AssetDesignerCanvas({
    warehouse,
    zones = [],
    racks = [],
    prefabs = [],
    walls = [],
    structures = [],
    levels = [],
    activeLevelId = 'L001',
    viewMode = 'single',
    selection,
    onSelectEntity,
    mode,
    paintMode,
    activeMaterialId,
    activeTemplateId,
    activePrefabId,
    openingMode,
    activeOpeningPreset,
    activeStructurePreset,
    measurements = [],
    measurementMode,
    onUpdateZone,
    onUpdateRack,
    onAddRack,
    onAddPrefab,
    onAddZone,
    onAddWall,
    onAddOpening,
    onAddStructure,
    onAddMeasurement,
    onWallPreview,
    theme = 'dark',
    sceneType = 'warehouse',
}) {
    const isLight = theme === 'light'
    const isEvent = sceneType === 'outdoor-event'

    // 赛事模式使用户外色调
    const bgColor = isLight
        ? (isEvent ? '#E8F0E0' : '#E8ECF1')
        : (isEvent ? '#1A2018' : '#181820')
    const floorColor = isLight
        ? (isEvent ? '#7BC47F' : '#D4D8DE')
        : (isEvent ? '#2D4A2E' : '#1E1E24')
    const edgeColor = isLight ? '#94A3B8' : '#64748B'
    const warehouseDimensions = dimsFrom(readValue(warehouse, 'dimensions_mm', 'dimensionsMm'), { width: 24, height: 9, depth: 18 })
    const centered = {
        width: warehouseDimensions.width,
        height: warehouseDimensions.height,
        depth: warehouseDimensions.depth,
    }

    // 楼层过滤
    const filteredZones = useMemo(() => filterByLevel(zones, activeLevelId, viewMode, activeLevelId, levels), [zones, viewMode, activeLevelId, levels])
    const filteredRacks = useMemo(() => filterByLevel(racks, activeLevelId, viewMode, activeLevelId, levels), [racks, viewMode, activeLevelId, levels])
    const filteredPrefabs = useMemo(() => filterByLevel(prefabs, activeLevelId, viewMode, activeLevelId, levels), [prefabs, viewMode, activeLevelId, levels])
    const filteredWalls = useMemo(() => filterByLevel(walls, activeLevelId, viewMode, activeLevelId, levels), [walls, viewMode, activeLevelId, levels])
    const filteredStructures = useMemo(() => filterByLevel(structures, activeLevelId, viewMode, activeLevelId, levels), [structures, viewMode, activeLevelId, levels])

    return (
        <Canvas
            shadows
            dpr={[1, 1.5]}
            camera={{ fov: 42, near: 0.1, far: 2000 }}
            gl={(props) => createPreferredRenderer(props, {
                label: 'AssetDesignerCanvas',
                preserveDrawingBuffer: true,
            })}
            style={{ width: '100%', height: '100%' }}
            onPointerMissed={() => {
                if (mode === 'select' || mode === 'paint') {
                    onSelectEntity(null, null)
                }
            }}
        >
            <color attach="background" args={[bgColor]} />
            <fog attach="fog" args={[bgColor, 80, 500]} />
            <ambientLight intensity={isLight ? 1.2 : 0.7} />
            <directionalLight position={[12, 18, 8]} intensity={isLight ? 1.8 : 1.5} castShadow shadow-mapSize={[2048, 2048]} />
            <pointLight position={[-8, 6, -8]} intensity={isLight ? 0.3 : 0.5} color={isLight ? '#818CF8' : '#6366F1'} />

            <Suspense fallback={null}>
                <SceneCamera warehouseSize={centered} />
                <OrbitControls
                    makeDefault
                    enableDamping
                    dampingFactor={0.08}
                    maxPolarAngle={Math.PI / 2.05}
                />
                <group position={[-centered.width / 2, 0, -centered.depth / 2]}>
                    <WarehouseShell
                        warehouseSize={centered}
                        mode={mode}
                        activeTemplateId={activeTemplateId}
                        activePrefabId={activePrefabId}
                        onAddRack={onAddRack}
                        onAddPrefab={onAddPrefab}
                        onAddZone={onAddZone}
                        floorColor={floorColor}
                        edgeColor={edgeColor}
                        sceneType={sceneType}
                        theme={theme}
                    />
                    <ZoneMeshes
                        zones={filteredZones}
                        selection={selection}
                        onSelect={onSelectEntity}
                        mode={mode}
                        paintMode={paintMode}
                        activeMaterialId={activeMaterialId}
                        onUpdateZone={onUpdateZone}
                    />
                    <RackMeshes
                        racks={filteredRacks}
                        selection={selection}
                        onSelect={onSelectEntity}
                        mode={mode}
                        paintMode={paintMode}
                        activeMaterialId={activeMaterialId}
                        onUpdateRack={onUpdateRack}
                    />
                    <PrefabInstances
                        prefabs={filteredPrefabs}
                        selection={selection}
                        onSelect={onSelectEntity}
                        mode={mode}
                    />
                    {/* 墙体渲染 - 使用带开口的墙体组件 */}
                    <WallWithOpeningsBatch
                        walls={filteredWalls}
                        selection={selection}
                        onSelect={onSelectEntity}
                        mode={mode}
                    />
                </group>

                {/* 结构元素渲染 */}
                <StructureMeshes
                    structures={filteredStructures}
                    selection={selection}
                    onSelect={onSelectEntity}
                    mode={mode}
                />

                {/* 楼层标高标记 */}
                {levels.length > 1 && (
                    <LevelElevationMarker
                        levels={levels}
                        activeLevelId={activeLevelId}
                        warehouseSize={centered}
                    />
                )}

                {/* 测量结果渲染 */}
                <MeasurementOverlay
                    measurements={measurements}
                    warehouseOffset={{ x: centered.width / 2, z: centered.depth / 2 }}
                />

                {/* 交互类工具包含大尺寸透明平面，不参与 Bounds 自动适配以免把相机拉飞 */}
                {mode === 'wall' && (
                    <WallDrawTool
                        walls={walls}
                        onPreview={onWallPreview}
                        gridSnapEnabled
                        onCommit={(wallData) => {
                            const localStart = {
                                x: wallData.start.x + centered.width / 2,
                                z: wallData.start.z + centered.depth / 2,
                            }
                            const localEnd = {
                                x: wallData.end.x + centered.width / 2,
                                z: wallData.end.z + centered.depth / 2,
                            }
                            onAddWall?.(localStart, localEnd)
                        }}
                        onCancel={() => onSelectEntity(null, null)}
                    />
                )}

                {(mode === 'door' || mode === 'window') && (
                    <OpeningPlacer
                        walls={walls}
                        selection={selection}
                        openingType={mode}
                        activePreset={activeOpeningPreset}
                        onPlace={onAddOpening}
                        onCancel={() => onSelectEntity(null, null)}
                        warehouseOffset={{ x: centered.width / 2, z: centered.depth / 2 }}
                    />
                )}

                {['column', 'beam', 'stair', 'ramp'].includes(mode) && (
                    <StructurePlacer
                        structureType={mode}
                        activePreset={activeStructurePreset}
                        onPlace={onAddStructure}
                        onCancel={() => onSelectEntity(null, null)}
                        warehouseOffset={{ x: centered.width / 2, z: centered.depth / 2 }}
                    />
                )}

                {mode === 'measure' && measurementMode && (
                    <MeasureTool
                        mode={measurementMode}
                        walls={walls}
                        gridSnapEnabled
                        onCommit={onAddMeasurement}
                        onCancel={() => onSelectEntity(null, null)}
                        warehouseOffset={{ x: centered.width / 2, z: centered.depth / 2 }}
                    />
                )}
            </Suspense>
        </Canvas>
    )
}
