/**
 * WallWithOpenings — 带开口的墙体渲染
 * 使用 CSG 在墙体上切割门窗开口
 */
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Edges } from '@react-three/drei'
import { cutWallOpenings } from '../../utils/csgUtils'
import { getWallLength, getWallAngle } from '../../utils/snapEngine'
import DoorMesh from './DoorMesh'
import WindowMesh from './WindowMesh'

const MATERIAL_COLORS = {
    concrete: '#9CA3AF',
    brick: '#B45309',
    glass: '#60A5FA',
    wood: '#8B5A2B',
}

export default function WallWithOpenings({
    wall,
    isSelected,
    onClick,
    mode
}) {
    const geometryRef = useRef()

    const { position, rotation, length, height, thickness } = useMemo(() => {
        if (!wall?.start || !wall?.end) return null

        const len = getWallLength(wall)
        const angleDeg = getWallAngle(wall)
        const angleRad = -angleDeg * (Math.PI / 180)
        const h = wall.height || 2.8
        const t = wall.thickness || 0.2

        return {
            position: {
                x: (wall.start.x + wall.end.x) / 2,
                y: h / 2,
                z: (wall.start.z + wall.end.z) / 2
            },
            rotation: angleRad,
            length: len,
            height: h,
            thickness: t
        }
    }, [wall])

    // 生成带开口的几何体
    const wallGeometry = useMemo(() => {
        if (!length || !height || !thickness) return null

        // 如果没有开口，返回基础几何体
        if (!wall.openings || wall.openings.length === 0) {
            return new THREE.BoxGeometry(length, height, thickness)
        }

        // 使用 CSG 切割开口
        try {
            return cutWallOpenings(
                { length, height, thickness },
                wall.openings
            )
        } catch (e) {
            console.warn('CSG 切割失败，使用基础几何体:', e)
            return new THREE.BoxGeometry(length, height, thickness)
        }
    }, [length, height, thickness, wall.openings])

    if (!position || !wallGeometry) return null

    const material = wall.material || 'concrete'

    // 渲染门窗预制件
    const renderOpenings = () => {
        if (!wall.openings || wall.openings.length === 0) return null

        return wall.openings.map((opening, index) => {
            const openingX = (opening.position - 0.5) * length
            const sillHeight = opening.sillHeight || 0
            const openingY = sillHeight + opening.height / 2 - height / 2

            if (opening.type === 'door') {
                return (
                    <DoorMesh
                        key={`door-${opening.id || index}`}
                        opening={opening}
                        position={[openingX, openingY, 0]}
                    />
                )
            }

            if (opening.type === 'window') {
                return (
                    <WindowMesh
                        key={`window-${opening.id || index}`}
                        opening={opening}
                        position={[openingX, openingY, 0]}
                    />
                )
            }

            return null
        })
    }

    return (
        <group
            position={[position.x, position.y, position.z]}
            rotation={[0, rotation, 0]}
        >
            {/* 墙体 mesh */}
            <mesh
                ref={geometryRef}
                geometry={wallGeometry}
                onClick={(e) => {
                    e.stopPropagation()
                    if (mode === 'select' || mode === 'delete') {
                        onClick?.()
                    }
                }}
                castShadow
                receiveShadow
            >
                <meshStandardMaterial
                    color={isSelected ? '#A5B4FC' : (MATERIAL_COLORS[material] || MATERIAL_COLORS.concrete)}
                    roughness={0.8}
                    side={THREE.DoubleSide}
                />
                {isSelected && <Edges scale={1.02} color="#818CF8" />}
            </mesh>

            {/* 门窗渲染 */}
            {renderOpenings()}
        </group>
    )
}

/**
 * WallWithOpeningsBatch — 墙体批量渲染组件
 */
export function WallWithOpeningsBatch({ walls = [], selection, onSelect, mode }) {
    return walls.map((wall) => (
        <WallWithOpenings
            key={`wall-${wall.id}`}
            wall={wall}
            isSelected={selection?.type === 'wall' && selection?.id === wall.id}
            onClick={() => onSelect?.('wall', wall.id)}
            mode={mode}
        />
    ))
}