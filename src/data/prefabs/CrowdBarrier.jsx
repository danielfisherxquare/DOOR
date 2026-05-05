/**
 * CrowdBarrier — 2×1m 铁马护栏
 * 两根竖管 + 多根横管 + 底部支脚
 */

export default function CrowdBarrier({ color = '#C0C0C0' }) {
    const W = 2       // 宽 2m
    const H = 1.1     // 高 1.1m
    const pipeR = 0.02
    const footW = 0.4
    const footH = 0.04
    const halfW = W / 2

    // 横杆高度（均匀分布）
    const barHeights = [0.15, 0.4, 0.65, 0.9, H]

    return (
        <group>
            {/* 左右立柱 */}
            {[-halfW, halfW].map((x, i) => (
                <mesh key={`pole-${i}`} position={[x, H / 2, 0]}>
                    <cylinderGeometry args={[pipeR, pipeR, H, 8]} />
                    <meshStandardMaterial color={color} metalness={0.7} roughness={0.25} />
                </mesh>
            ))}

            {/* 横杆 — rotation=[0,0,π/2] 使圆柱横躺在 X 方向 */}
            {barHeights.map((y, i) => (
                <mesh key={`bar-${i}`} position={[0, y, 0]} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[pipeR * 0.8, pipeR * 0.8, W, 8]} />
                    <meshStandardMaterial color={color} metalness={0.7} roughness={0.25} />
                </mesh>
            ))}

            {/* 底部支脚（左右各一个，沿 Z 方向展开提供稳定性） */}
            {[-halfW, halfW].map((x, i) => (
                <mesh key={`foot-${i}`} position={[x, footH / 2, 0]}>
                    <boxGeometry args={[0.06, footH, footW]} />
                    <meshStandardMaterial color={color} metalness={0.6} roughness={0.3} />
                </mesh>
            ))}
        </group>
    )
}
