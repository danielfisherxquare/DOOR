/**
 * WallMesh — 墙体渲染组件
 * 将 wall 数据渲染为 3D mesh
 */
import { useMemo } from 'react'
import { Edges } from '@react-three/drei'
import { getWallLength, getWallAngle } from '../../utils/snapEngine'

const MATERIAL_COLORS = {
    concrete: '#9CA3AF',
    brick: '#B45309',
    glass: '#60A5FA',
    wood: '#8B5A2B',
}

export default function WallMesh({ wall, isSelected, onClick, mode }) {
    const { position, rotation, length } = useMemo(() => {
        if (!wall?.start || !wall?.end) return null

        const length = getWallLength(wall)
        const angleDeg = getWallAngle(wall)
        const angleRad = -angleDeg * (Math.PI / 180)

        return {
            position: {
                x: (wall.start.x + wall.end.x) / 2,
                y: (wall.height || 2.8) / 2,
                z: (wall.start.z + wall.end.z) / 2
            },
            rotation: angleRad,
            length
        }
    }, [wall])

    if (!position || length < 0.01) return null

    const height = wall.height || 2.8
    const thickness = wall.thickness || 0.2
    const material = wall.material || 'concrete'

    const handleClick = (e) => {
        e.stopPropagation()
        if (mode === 'select' || mode === 'delete') {
            onClick?.()
        }
    }

    return (
        <group
            position={[position.x, position.y, position.z]}
            rotation={[0, rotation, 0]}
        >
            <mesh
                onClick={handleClick}
                castShadow
                receiveShadow
            >
                <boxGeometry args={[length, height, thickness]} />
                <meshStandardMaterial
                    color={isSelected ? '#A5B4FC' : (MATERIAL_COLORS[material] || MATERIAL_COLORS.concrete)}
                    roughness={0.8}
                />
                {isSelected && (
                    <Edges scale={1.02} color="#818CF8" />
                )}
            </mesh>
        </group>
    )
}

/**
 * WallMeshes — 墙体批量渲染组件
 */
export function WallMeshes({ walls = [], selection, onSelect, mode }) {
    return walls.map((wall) => (
        <WallMesh
            key={`wall-${wall.id}`}
            wall={wall}
            isSelected={selection?.type === 'wall' && selection?.id === wall.id}
            onClick={() => onSelect?.('wall', wall.id)}
            mode={mode}
        />
    ))
}