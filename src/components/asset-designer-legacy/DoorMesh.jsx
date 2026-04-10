/**
 * DoorMesh — 门渲染组件
 */
import { useMemo } from 'react'
import { getOpeningPreset } from '../../data/openingPresets'

export default function DoorMesh({ opening, position }) {
    const preset = useMemo(() => {
        if (opening?.prefabId) {
            return getOpeningPreset(opening.prefabId)
        }
        return null
    }, [opening?.prefabId])

    const width = opening?.width || preset?.width || 0.9
    const height = opening?.height || preset?.height || 2.1
    const thickness = preset?.thickness || 0.05
    const color = preset?.color || '#8B5A2B'
    const isDouble = preset?.isDouble || false
    const isSliding = preset?.isSliding || false

    // 门框尺寸
    const frameDepth = 0.08
    const frameWidth = 0.06

    // 单扇门宽度
    const leafWidth = isDouble ? (width - frameWidth) / 2 : width - frameWidth * 2

    return (
        <group position={position}>
            {/* 门板 */}
            {!isDouble ? (
                // 单开门
                <mesh position={[0, 0, thickness / 2]}>
                    <boxGeometry args={[leafWidth, height - frameWidth, thickness]} />
                    <meshStandardMaterial color={color} roughness={0.6} />
                </mesh>
            ) : (
                // 双开门
                <>
                    <mesh position={[-leafWidth / 2 - frameWidth / 4, 0, thickness / 2]}>
                        <boxGeometry args={[leafWidth, height - frameWidth, thickness]} />
                        <meshStandardMaterial color={color} roughness={0.6} />
                    </mesh>
                    <mesh position={[leafWidth / 2 + frameWidth / 4, 0, thickness / 2]}>
                        <boxGeometry args={[leafWidth, height - frameWidth, thickness]} />
                        <meshStandardMaterial color={color} roughness={0.6} />
                    </mesh>
                </>
            )}

            {/* 门框顶部 */}
            <mesh position={[0, height / 2 - frameWidth / 2, 0]}>
                <boxGeometry args={[width, frameWidth, frameDepth]} />
                <meshStandardMaterial color="#F5F5F5" roughness={0.4} />
            </mesh>

            {/* 门框左侧 */}
            <mesh position={[-width / 2 + frameWidth / 2, 0, 0]}>
                <boxGeometry args={[frameWidth, height, frameDepth]} />
                <meshStandardMaterial color="#F5F5F5" roughness={0.4} />
            </mesh>

            {/* 门框右侧 */}
            <mesh position={[width / 2 - frameWidth / 2, 0, 0]}>
                <boxGeometry args={[frameWidth, height, frameDepth]} />
                <meshStandardMaterial color="#F5F5F5" roughness={0.4} />
            </mesh>

            {/* 双开门中间框 */}
            {isDouble && (
                <mesh position={[0, 0, 0]}>
                    <boxGeometry args={[frameWidth / 2, height - frameWidth * 2, frameDepth]} />
                    <meshStandardMaterial color="#F5F5F5" roughness={0.4} />
                </mesh>
            )}

            {/* 门把手 */}
            {!isDouble && (
                <mesh position={[width / 2 - 0.12, 0, thickness / 2 + 0.02]}>
                    <cylinderGeometry args={[0.02, 0.02, 0.08, 8]} />
                    <meshStandardMaterial color="#D4AF37" metalness={0.8} roughness={0.2} />
                </mesh>
            )}

            {/* 双开门把手 */}
            {isDouble && (
                <>
                    <mesh position={[-0.05, 0, thickness / 2 + 0.02]}>
                        <cylinderGeometry args={[0.015, 0.015, 0.06, 8]} />
                        <meshStandardMaterial color="#D4AF37" metalness={0.8} roughness={0.2} />
                    </mesh>
                    <mesh position={[0.05, 0, thickness / 2 + 0.02]}>
                        <cylinderGeometry args={[0.015, 0.015, 0.06, 8]} />
                        <meshStandardMaterial color="#D4AF37" metalness={0.8} roughness={0.2} />
                    </mesh>
                </>
            )}

            {/* 推拉门轨道 */}
            {isSliding && (
                <mesh position={[0, height / 2 + 0.02, 0]}>
                    <boxGeometry args={[width + 0.1, 0.04, frameDepth]} />
                    <meshStandardMaterial color="#64748B" roughness={0.3} />
                </mesh>
            )}
        </group>
    )
}