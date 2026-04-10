/**
 * MeasurementOverlay — 测量结果渲染
 * 渲染保存的测量数据
 */
import { useMemo } from 'react'
import { Text } from '@react-three/drei'
import SimpleLine3D from './SimpleLine3D'

export default function MeasurementOverlay({
    measurements = [],
    warehouseOffset = { x: 0, z: 0 },
}) {
    return measurements
        .filter(m => m.visible !== false)
        .map((m) => (
            <MeasurementItem
                key={m.id}
                measurement={m}
                warehouseOffset={warehouseOffset}
            />
        ))
}

function MeasurementItem({ measurement, warehouseOffset }) {
    const { type, points, label } = measurement

    const linePoints = useMemo(() => {
        return points.map(p => [p.x + warehouseOffset.x, 0.02, p.z + warehouseOffset.z])
    }, [points, warehouseOffset])

    const labelPosition = useMemo(() => {
        if (type === 'distance' && points.length === 2) {
            return [
                (points[0].x + points[1].x) / 2 + warehouseOffset.x,
                0.3,
                (points[0].z + points[1].z) / 2 + warehouseOffset.z
            ]
        }
        if (type === 'area' && points.length >= 3) {
            // 多边形中心
            const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length
            const cz = points.reduce((sum, p) => sum + p.z, 0) / points.length
            return [cx + warehouseOffset.x, 0.3, cz + warehouseOffset.z]
        }
        if (type === 'angle' && points.length === 3) {
            // 顶点位置
            return [
                points[1].x + warehouseOffset.x,
                0.3,
                points[1].z + warehouseOffset.z
            ]
        }
        return [0, 0.3, 0]
    }, [type, points, warehouseOffset])

    return (
        <group>
            {/* 测量线 */}
            {linePoints.length >= 2 && (
                <SimpleLine3D
                    points={linePoints}
                    color="#F59E0B"
                    opacity={0.95}
                />
            )}

            {/* 面积测量闭合 */}
            {type === 'area' && points.length >= 3 && (
                <SimpleLine3D
                    points={[
                        linePoints[linePoints.length - 1],
                        linePoints[0]
                    ]}
                    color="#F59E0B"
                    opacity={0.75}
                />
            )}

            {/* 角度弧线 */}
            {type === 'angle' && points.length === 3 && (
                <AngleArc points={points} warehouseOffset={warehouseOffset} />
            )}

            {/* 标签 */}
            <Text
                position={labelPosition}
                fontSize={0.18}
                color="#F59E0B"
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.02}
                outlineColor="#000000"
            >
                {label}
            </Text>

            {/* 端点标记 */}
            {points.map((p, i) => (
                <mesh
                    key={i}
                    position={[p.x + warehouseOffset.x, 0.03, p.z + warehouseOffset.z]}
                >
                    <sphereGeometry args={[0.06, 12, 12]} />
                    <meshStandardMaterial color="#F59E0B" transparent opacity={0.6} />
                </mesh>
            ))}
        </group>
    )
}

// 角度弧线
function AngleArc({ points, warehouseOffset }) {
    const arcPoints = useMemo(() => {
        const [p1, vertex, p2] = points
        const result = []
        const segments = 16
        const radius = 0.5

        // 计算角度
        const angle1 = Math.atan2(p1.z - vertex.z, p1.x - vertex.x)
        const angle2 = Math.atan2(p2.z - vertex.z, p2.x - vertex.x)

        // 确定弧线方向（取较小的角度）
        let deltaAngle = angle2 - angle1
        if (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI
        if (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI

        // 生成弧线点
        for (let i = 0; i <= segments; i++) {
            const t = i / segments
            const angle = angle1 + deltaAngle * t
            result.push([
                vertex.x + Math.cos(angle) * radius + warehouseOffset.x,
                0.02,
                vertex.z + Math.sin(angle) * radius + warehouseOffset.z
            ])
        }

        return result
    }, [points, warehouseOffset])

    return (
        <SimpleLine3D
            points={arcPoints}
            color="#F59E0B"
            opacity={0.9}
        />
    )
}
