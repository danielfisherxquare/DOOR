/**
 * RampMesh — 坡道渲染组件
 */
import { useMemo } from 'react'
import { Edges } from '@react-three/drei'
import * as THREE from 'three'
import { getStructurePreset } from '../../data/structurePresets'

export default function RampMesh({
    structure,
    isSelected,
    onClick,
    mode,
}) {
    const preset = useMemo(() => {
        if (structure?.presetId) return getStructurePreset(structure.presetId)
        return null
    }, [structure?.presetId])

    const rampWidth = structure?.rampWidth || preset?.rampWidth || 1.2
    const rampSlope = structure?.rampSlope || preset?.rampSlope || 8
    const dimensions = structure?.dimensions || preset?.dimensions || { width: 1.2, height: 0.7, depth: 5.0 }
    const rampType = structure?.rampType || preset?.rampType || 'wheelchair'
    const color = preset?.color || '#A8A29E'
    const position = structure?.position || { x: 0, y: 0, z: 0 }
    const rotation = structure?.rotation || 0

    const { x, y, z } = position
    const { width, height, depth } = dimensions

    // 计算坡道形状
    const slopeRad = (rampSlope * Math.PI) / 180
    const actualHeight = depth * Math.tan(slopeRad)

    // 创建坡道几何体
    const rampGeometry = useMemo(() => {
        const shape = new THREE.Shape()
        shape.moveTo(0, 0)
        shape.lineTo(depth, 0)
        shape.lineTo(depth, actualHeight)
        shape.lineTo(0, 0)

        const extrudeSettings = {
            steps: 1,
            depth: width,
            bevelEnabled: false,
        }

        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings)
        return geometry
    }, [depth, actualHeight, width])

    // 扶手高度
    const handrailHeight = 0.9

    return (
        <group position={[x, y, z]} rotation={[0, rotation, 0]}>
            {/* 坡道主体 */}
            <mesh
                geometry={rampGeometry}
                rotation={[0, 0, 0]}
                position={[-width / 2, 0, 0]}
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
                    color={isSelected ? '#A5B4FC' : color}
                    roughness={0.8}
                    side={THREE.DoubleSide}
                />
                {isSelected && <Edges scale={1.02} color="#818CF8" />}
            </mesh>

            {/* 无障碍坡道扶手 */}
            {rampType === 'wheelchair' && (
                <>
                    {/* 左侧扶手立柱 */}
                    {[0, depth / 2, depth].map((zPos, i) => (
                        <mesh
                            key={`left-post-${i}`}
                            position={[-width / 2 - 0.05, (i === 1 ? actualHeight / 2 : (i === 2 ? actualHeight : 0)) + 0.45, zPos]}
                        >
                            <cylinderGeometry args={[0.02, 0.02, handrailHeight, 8]} />
                            <meshStandardMaterial color="#64748B" metalness={0.6} roughness={0.3} />
                        </mesh>
                    ))}
                    {/* 右侧扶手立柱 */}
                    {[0, depth / 2, depth].map((zPos, i) => (
                        <mesh
                            key={`right-post-${i}`}
                            position={[width / 2 + 0.05, (i === 1 ? actualHeight / 2 : (i === 2 ? actualHeight : 0)) + 0.45, zPos]}
                        >
                            <cylinderGeometry args={[0.02, 0.02, handrailHeight, 8]} />
                            <meshStandardMaterial color="#64748B" metalness={0.6} roughness={0.3} />
                        </mesh>
                    ))}
                    {/* 左侧扶手 */}
                    <mesh
                        position={[-width / 2 - 0.05, handrailHeight + 0.02, depth / 2]}
                        rotation={[slopeRad, 0, 0]}
                    >
                        <cylinderGeometry args={[0.025, 0.025, depth / Math.cos(slopeRad) * 1.02, 8]} />
                        <meshStandardMaterial color="#64748B" metalness={0.6} roughness={0.3} />
                    </mesh>
                    {/* 右侧扶手 */}
                    <mesh
                        position={[width / 2 + 0.05, handrailHeight + 0.02, depth / 2]}
                        rotation={[slopeRad, 0, 0]}
                    >
                        <cylinderGeometry args={[0.025, 0.025, depth / Math.cos(slopeRad) * 1.02, 8]} />
                        <meshStandardMaterial color="#64748B" metalness={0.6} roughness={0.3} />
                    </mesh>
                </>
            )}

            {/* 选择高亮 */}
            {isSelected && (
                <mesh position={[0, actualHeight / 2, depth / 2]}>
                    <boxGeometry args={[width + 0.2, actualHeight + 0.2, depth + 0.2]} />
                    <meshBasicMaterial color="#818CF8" wireframe />
                </mesh>
            )}
        </group>
    )
}