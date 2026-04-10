/**
 * WallGhost — 墙体绘制预览
 * 显示半透明的预览墙体
 */
import { useMemo } from 'react'
import { Edges } from '@react-three/drei'

export default function WallGhost({ start, end, height = 2.8, thickness = 0.2 }) {
    const { position, rotation, length } = useMemo(() => {
        if (!start || !end) return null

        const dx = end.x - start.x
        const dz = end.z - start.z
        const length = Math.sqrt(dx * dx + dz * dz)
        const angle = Math.atan2(dz, dx)

        return {
            position: {
                x: (start.x + end.x) / 2,
                y: height / 2,
                z: (start.z + end.z) / 2
            },
            rotation: angle,
            length
        }
    }, [start, end, height])

    if (!position || length < 0.01) return null

    return (
        <group
            position={[position.x, position.y, position.z]}
            rotation={[0, -rotation, 0]}
        >
            <mesh>
                <boxGeometry args={[length, height, thickness]} />
                <meshStandardMaterial
                    color="#818CF8"
                    transparent
                    opacity={0.3}
                />
            </mesh>
            <mesh>
                <boxGeometry args={[length, height, thickness]} />
                <meshBasicMaterial color="#818CF8" wireframe />
            </mesh>
        </group>
    )
}