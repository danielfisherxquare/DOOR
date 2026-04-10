/**
 * RosenbergTent — 3×6m 罗斯伯格篷房
 * A字三角钢架 + 弧面篷布
 * segments 参数控制纵向拼接组数
 */
import * as THREE from 'three'

export default function RosenbergTent({ color = '#F5F5F0', segments = 1 }) {
    const unitW = 6     // 单组长 6m（沿 X 轴）
    const D = 3          // 深 3m（沿 Z 轴）
    const wallH = 2.0    // 侧墙高
    const peakH = 3.0    // 脊顶高
    const totalW = unitW * segments
    const halfD = D / 2
    const pipeR = 0.025

    const ridgeH = peakH - wallH
    // 斜梁长度
    const rafterLen = Math.sqrt(ridgeH ** 2 + halfD ** 2)
    // 斜梁绕 X 轴旋转角度（从竖直到倾斜）
    const rafterAngle = Math.atan2(halfD, ridgeH)

    // 生成每组的 A 字架（在 X 轴方向等距分布）
    const frames = []
    for (let s = 0; s <= segments; s++) {
        const x = s * unitW - totalW / 2
        frames.push(
            <group key={`frame-${s}`} position={[x, 0, 0]}>
                {/* 左立柱 (Z-) */}
                <mesh position={[0, wallH / 2, -halfD]}>
                    <cylinderGeometry args={[pipeR, pipeR, wallH, 6]} />
                    <meshStandardMaterial color="#888" metalness={0.6} roughness={0.3} />
                </mesh>
                {/* 右立柱 (Z+) */}
                <mesh position={[0, wallH / 2, halfD]}>
                    <cylinderGeometry args={[pipeR, pipeR, wallH, 6]} />
                    <meshStandardMaterial color="#888" metalness={0.6} roughness={0.3} />
                </mesh>
                {/* 左斜梁：从顶部脊线 [0, peakH, 0] 到左墙顶 [0, wallH, -halfD] */}
                <mesh
                    position={[0, wallH + ridgeH / 2, -halfD / 2]}
                    rotation={[-rafterAngle, 0, 0]}
                >
                    <cylinderGeometry args={[pipeR, pipeR, rafterLen, 6]} />
                    <meshStandardMaterial color="#888" metalness={0.6} roughness={0.3} />
                </mesh>
                {/* 右斜梁：从顶部脊线 [0, peakH, 0] 到右墙顶 [0, wallH, halfD] */}
                <mesh
                    position={[0, wallH + ridgeH / 2, halfD / 2]}
                    rotation={[rafterAngle, 0, 0]}
                >
                    <cylinderGeometry args={[pipeR, pipeR, rafterLen, 6]} />
                    <meshStandardMaterial color="#888" metalness={0.6} roughness={0.3} />
                </mesh>
            </group>
        )
    }

    // 脊梁（沿 X 轴的顶部纵向管）
    const ridgePipe = (
        <mesh position={[0, peakH, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[pipeR, pipeR, totalW, 6]} />
            <meshStandardMaterial color="#888" metalness={0.6} roughness={0.3} />
        </mesh>
    )

    return (
        <group>
            {frames}
            {ridgePipe}

            {/* 篷布顶部 — 简化为三角棱柱形 */}
            <mesh position={[0, wallH + ridgeH / 2, 0]}>
                <boxGeometry args={[totalW, ridgeH, D]} />
                <meshStandardMaterial color={color} transparent opacity={0.45} side={THREE.DoubleSide} roughness={0.9} />
            </mesh>

            {/* 侧墙 */}
            <mesh position={[0, wallH / 2, 0]}>
                <boxGeometry args={[totalW, wallH, D]} />
                <meshStandardMaterial color={color} transparent opacity={0.15} side={THREE.DoubleSide} />
            </mesh>

            {/* 底部线框 */}
            <lineSegments position={[0, wallH / 2, 0]}>
                <edgesGeometry args={[new THREE.BoxGeometry(totalW, wallH, D)]} />
                <lineBasicMaterial color="#BBB" />
            </lineSegments>
        </group>
    )
}
