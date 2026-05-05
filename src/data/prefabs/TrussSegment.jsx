/**
 * TrussSegment — 桁架段 (20cm/30cm/40cm 截面)
 * 4根角管 + 顶底方框 + 对角斜撑
 * 默认竖向放置（Y轴延伸），段长 2m
 */

export default function TrussSegment({ sizeMm = 300, lengthMm = 2000, color = '#C0C0C0' }) {
    const S = sizeMm / 1000      // 截面尺寸（米）
    const L = lengthMm / 1000    // 段长（米）
    const halfS = S / 2
    const pipeR = S * 0.06       // 主管径按截面比例
    const braceR = pipeR * 0.5

    // 4根角管位置 (XZ 平面)
    const corners = [
        [-halfS, -halfS],
        [halfS, -halfS],
        [halfS, halfS],
        [-halfS, halfS],
    ]

    // 顶/底横杆的相邻角对
    const edgePairs = [[0, 1], [1, 2], [2, 3], [3, 0]]

    // 对角斜撑参数
    const braceLen = Math.sqrt(L ** 2 + S ** 2)
    const braceAngleZ = Math.atan2(S, L)  // 绕 Z 轴旋转角度

    return (
        <group>
            {/* 4 根主角管（竖向，沿 Y 轴） */}
            {corners.map(([cx, cz], i) => (
                <mesh key={`main-${i}`} position={[cx, L / 2, cz]}>
                    <cylinderGeometry args={[pipeR, pipeR, L, 6]} />
                    <meshStandardMaterial color={color} metalness={0.7} roughness={0.25} />
                </mesh>
            ))}

            {/* 顶部方框横杆 */}
            {edgePairs.map(([a, b], i) => {
                const [ax, az] = corners[a]
                const [bx, bz] = corners[b]
                const mx = (ax + bx) / 2
                const mz = (az + bz) / 2
                const barLen = Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2)
                // 横杆需要横躺并指向 a→b 方向
                const angle = Math.atan2(bx - ax, bz - az)
                return (
                    <mesh key={`top-${i}`} position={[mx, L, mz]} rotation={[Math.PI / 2, angle, 0]}>
                        <cylinderGeometry args={[braceR, braceR, barLen, 4]} />
                        <meshStandardMaterial color={color} metalness={0.7} roughness={0.25} />
                    </mesh>
                )
            })}

            {/* 底部方框横杆 */}
            {edgePairs.map(([a, b], i) => {
                const [ax, az] = corners[a]
                const [bx, bz] = corners[b]
                const mx = (ax + bx) / 2
                const mz = (az + bz) / 2
                const barLen = Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2)
                const angle = Math.atan2(bx - ax, bz - az)
                return (
                    <mesh key={`bot-${i}`} position={[mx, 0, mz]} rotation={[Math.PI / 2, angle, 0]}>
                        <cylinderGeometry args={[braceR, braceR, barLen, 4]} />
                        <meshStandardMaterial color={color} metalness={0.7} roughness={0.25} />
                    </mesh>
                )
            })}

            {/* 四面斜撑（每面一根对角线） */}
            {[
                // 前面 (Z=-halfS): 左下角→右上角
                { pos: [0, L / 2, -halfS], rot: [0, 0, braceAngleZ] },
                // 后面 (Z=+halfS): 右下角→左上角
                { pos: [0, L / 2, halfS], rot: [0, 0, -braceAngleZ] },
                // 左面 (X=-halfS): 后下角→前上角
                { pos: [-halfS, L / 2, 0], rot: [braceAngleZ, 0, 0] },
                // 右面 (X=+halfS): 前下角→后上角
                { pos: [halfS, L / 2, 0], rot: [-braceAngleZ, 0, 0] },
            ].map(({ pos, rot }, i) => (
                <mesh key={`brace-${i}`} position={pos} rotation={rot}>
                    <cylinderGeometry args={[braceR, braceR, braceLen * 0.88, 4]} />
                    <meshStandardMaterial color={color} metalness={0.6} roughness={0.3} />
                </mesh>
            ))}
        </group>
    )
}
