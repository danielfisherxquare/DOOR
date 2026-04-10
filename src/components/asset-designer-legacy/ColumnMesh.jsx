/**
 * ColumnMesh — 柱子渲染组件
 */
import { useMemo } from 'react'
import { Edges } from '@react-three/drei'
import { getStructurePreset } from '../../data/structurePresets'

export default function ColumnMesh({
    structure,
    isSelected,
    onClick,
    mode,
}) {
    const preset = useMemo(() => {
        if (structure?.presetId) return getStructurePreset(structure.presetId)
        return null
    }, [structure?.presetId])

    const dimensions = structure?.dimensions || preset?.dimensions || { width: 0.4, height: 3.0, depth: 0.4 }
    const columnType = structure?.columnType || preset?.columnType || 'rectangular'
    const color = preset?.color || '#9CA3AF'
    const position = structure?.position || { x: 0, y: 0, z: 0 }
    const rotation = structure?.rotation || 0

    const { x, y, z } = position
    const { width, height, depth } = dimensions

    // 渲染不同类型的柱子
    const renderGeometry = () => {
        if (columnType === 'circular') {
            return <cylinderGeometry args={[width / 2, width / 2, height, 24]} />
        }

        if (columnType === 'steel_h') {
            // H型钢柱 - 使用简化的交叉形状
            return (
                <>
                    {/* 翼缘 */}
                    <mesh position={[0, 0, 0]}>
                        <boxGeometry args={[width * 1.5, height, depth * 0.3]} />
                        <meshStandardMaterial color={color} metalness={0.6} roughness={0.3} />
                    </mesh>
                    {/* 腹板 */}
                    <mesh position={[0, 0, 0]}>
                        <boxGeometry args={[width * 0.3, height, depth]} />
                        <meshStandardMaterial color={color} metalness={0.6} roughness={0.3} />
                    </mesh>
                </>
            )
        }

        // 默认矩形柱
        return <boxGeometry args={[width, height, depth]} />
    }

    // 柱子底部在 y=0，向上延伸
    const yOffset = height / 2

    return (
        <group position={[x, yOffset, z]} rotation={[0, rotation, 0]}>
            {columnType === 'steel_h' ? (
                renderGeometry()
            ) : (
                <mesh
                    onClick={(e) => {
                        e.stopPropagation()
                        if (mode === 'select' || mode === 'delete') {
                            onClick?.()
                        }
                    }}
                    castShadow
                    receiveShadow
                >
                    {renderGeometry()}
                    <meshStandardMaterial
                        color={isSelected ? '#A5B4FC' : color}
                        roughness={columnType === 'steel_h' ? 0.3 : 0.7}
                        metalness={columnType === 'steel_h' ? 0.6 : 0}
                    />
                    {isSelected && <Edges scale={1.02} color="#818CF8" />}
                </mesh>
            )}

            {/* H型钢选择高亮 */}
            {columnType === 'steel_h' && isSelected && (
                <mesh>
                    <boxGeometry args={[width * 1.6, height, depth * 1.1]} />
                    <meshBasicMaterial color="#818CF8" wireframe />
                </mesh>
            )}

            {/* H型钢交互平面 */}
            {columnType === 'steel_h' && (
                <mesh
                    onClick={(e) => {
                        e.stopPropagation()
                        if (mode === 'select' || mode === 'delete') {
                            onClick?.()
                        }
                    }}
                    visible={false}
                >
                    <boxGeometry args={[width * 1.5, height, depth]} />
                    <meshBasicMaterial transparent opacity={0} />
                </mesh>
            )}
        </group>
    )
}