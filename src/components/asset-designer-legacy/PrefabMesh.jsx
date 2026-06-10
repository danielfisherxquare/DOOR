/**
 * PrefabMesh — 预制物统一渲染组件
 * 根据 prefabId 从注册表查找对应 Component 并渲染
 * 位置使用场景坐标（米），与外层 group 的局部坐标系一致
 */
import { Suspense } from 'react'
import { getPrefabById } from '../../data/prefabRegistry'

export default function PrefabMesh({ instance, isSelected, onClick }) {
    const meta = getPrefabById(instance.prefabId || instance.prefab_id)
    if (!meta) return null

    const Component = meta.Component
    // 位置直接使用场景坐标（米），兼容旧版 position_mm 格式
    const pos = instance.position || instance.position_mm || instance.positionMm || { x: 0, y: 0, z: 0 }
    let x, y, z
    if (instance.position) {
        // 新格式：直接场景坐标（米）
        x = pos.x || 0
        y = pos.y || 0
        z = pos.z || 0
    } else {
        // 旧格式兼容：mm → 场景坐标
        x = (pos.x || 0) * 0.001
        y = (pos.y || 0) * 0.001
        z = (pos.z || 0) * 0.001
    }
    const rotY = (instance.rotationDeg || 0) * (Math.PI / 180)

    // 选中包围框尺寸（米）
    const bboxW = meta.defaultDimensions.widthMm / 1000
    const bboxH = meta.defaultDimensions.heightMm / 1000
    const bboxD = meta.defaultDimensions.depthMm / 1000

    return (
        <group
            position={[x, y, z]}
            rotation={[0, rotY, 0]}
            onClick={(e) => {
                e.stopPropagation()
                onClick?.(e)
            }}
        >
            <Suspense fallback={
                <mesh>
                    <boxGeometry args={[bboxW, bboxH, bboxD]} />
                    <meshStandardMaterial color="#6366F1" wireframe />
                </mesh>
            }>
                <Component
                    color={instance.color || undefined}
                    size={instance.size || undefined}
                    heightMm={instance.heightMm || undefined}
                    sizeMm={instance.sizeMm || undefined}
                    segments={instance.segments || undefined}
                />
            </Suspense>
            {isSelected && (
                <mesh position={[0, bboxH / 2, 0]}>
                    <boxGeometry args={[bboxW * 1.05, bboxH * 1.05, bboxD * 1.05]} />
                    <meshBasicMaterial color="#818CF8" wireframe transparent opacity={0.5} />
                </mesh>
            )}
        </group>
    )
}
