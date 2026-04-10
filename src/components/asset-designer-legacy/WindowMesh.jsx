/**
 * WindowMesh — 窗渲染组件
 */
import { useMemo } from 'react'
import { getOpeningPreset } from '../../data/openingPresets'

export default function WindowMesh({ opening, position }) {
    const preset = useMemo(() => {
        if (opening?.prefabId) {
            return getOpeningPreset(opening.prefabId)
        }
        return null
    }, [opening?.prefabId])

    const width = opening?.width || preset?.width || 1.0
    const height = opening?.height || preset?.height || 1.2
    const frameColor = preset?.frameColor || '#F5F5F5'
    const glassColor = preset?.glassColor || '#87CEEB'

    const frameWidth = 0.04
    const frameDepth = 0.06

    return (
        <group position={position}>
            {/* 玻璃 */}
            <mesh>
                <boxGeometry args={[width - frameWidth * 2, height - frameWidth * 2, 0.01]} />
                <meshPhysicalMaterial
                    color={glassColor}
                    transparent
                    opacity={0.4}
                    roughness={0}
                    metalness={0}
                    transmission={0.9}
                    thickness={0.01}
                />
            </mesh>

            {/* 窗框顶部 */}
            <mesh position={[0, height / 2 - frameWidth / 2, 0]}>
                <boxGeometry args={[width, frameWidth, frameDepth]} />
                <meshStandardMaterial color={frameColor} roughness={0.4} />
            </mesh>

            {/* 窗框底部 */}
            <mesh position={[0, -height / 2 + frameWidth / 2, 0]}>
                <boxGeometry args={[width, frameWidth, frameDepth]} />
                <meshStandardMaterial color={frameColor} roughness={0.4} />
            </mesh>

            {/* 窗框左侧 */}
            <mesh position={[-width / 2 + frameWidth / 2, 0, 0]}>
                <boxGeometry args={[frameWidth, height, frameDepth]} />
                <meshStandardMaterial color={frameColor} roughness={0.4} />
            </mesh>

            {/* 窗框右侧 */}
            <mesh position={[width / 2 - frameWidth / 2, 0, 0]}>
                <boxGeometry args={[frameWidth, height, frameDepth]} />
                <meshStandardMaterial color={frameColor} roughness={0.4} />
            </mesh>

            {/* 中间横框 */}
            <mesh position={[0, 0, 0]}>
                <boxGeometry args={[width - frameWidth * 2, frameWidth, frameDepth]} />
                <meshStandardMaterial color={frameColor} roughness={0.4} />
            </mesh>

            {/* 中间竖框 (宽度大于 1.2m 时) */}
            {width > 1.2 && (
                <mesh position={[0, 0, 0]}>
                    <boxGeometry args={[frameWidth, height - frameWidth * 2, frameDepth]} />
                    <meshStandardMaterial color={frameColor} roughness={0.4} />
                </mesh>
            )}
        </group>
    )
}