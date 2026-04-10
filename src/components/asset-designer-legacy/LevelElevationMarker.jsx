/**
 * LevelElevationMarker — 3D 楼层标高标记
 * 在 3D 视图边缘显示楼层高度参考线
 */
import { useMemo } from 'react'
import { Text, Line } from '@react-three/drei'

export default function LevelElevationMarker({
    levels,
    activeLevelId,
    warehouseSize,
}) {
    // 标记位置：场景右侧边缘
    const markerX = (warehouseSize?.width || 24) / 2 + 2
    const lineWidth = 3

    const markers = useMemo(() => {
        if (!levels || levels.length === 0) return []

        return levels.map((level) => {
            const isActive = level.id === activeLevelId
            return {
                id: level.id,
                name: level.name,
                elevation: level.elevation,
                topElevation: level.elevation + level.height,
                isActive,
                color: isActive ? '#818CF8' : '#64748B',
            }
        })
    }, [levels, activeLevelId])

    if (!markers.length) return null

    return (
        <group>
            {markers.map((marker) => (
                <group key={marker.id}>
                    {/* 底部参考线 */}
                    <Line
                        points={[
                            [markerX - lineWidth, marker.elevation, 0],
                            [markerX, marker.elevation, 0],
                        ]}
                        color={marker.color}
                        lineWidth={2}
                    />

                    {/* 楼层名称 */}
                    <Text
                        position={[markerX + 0.5, marker.elevation + 0.15, 0]}
                        fontSize={0.18}
                        color={marker.color}
                        anchorX="left"
                        anchorY="middle"
                    >
                        {marker.name}
                    </Text>

                    {/* 标高值 */}
                    <Text
                        position={[markerX + 0.5, marker.elevation - 0.15, 0]}
                        fontSize={0.14}
                        color={marker.color}
                        anchorX="left"
                        anchorY="middle"
                        opacity={0.7}
                    >
                        {`+${marker.elevation.toFixed(1)}m`}
                    </Text>

                    {/* 层高范围虚线（仅当前楼层） */}
                    {marker.isActive && (
                        <Line
                            points={[
                                [markerX - lineWidth - 0.5, marker.elevation, 0],
                                [markerX - lineWidth - 0.5, marker.topElevation, 0],
                            ]}
                            color={marker.color}
                            lineWidth={1}
                            dashed
                            dashSize={0.1}
                            gapSize={0.05}
                        />
                    )}
                </group>
            ))}

            {/* 地面标记 */}
            <Line
                points={[
                    [markerX - lineWidth - 1, 0, 0],
                    [markerX, 0, 0],
                ]}
                color="#94A3B8"
                lineWidth={2}
            />
            <Text
                position={[markerX + 0.5, 0, 0]}
                fontSize={0.16}
                color="#94A3B8"
                anchorX="left"
                anchorY="middle"
            >
                ±0.0m
            </Text>
        </group>
    )
}