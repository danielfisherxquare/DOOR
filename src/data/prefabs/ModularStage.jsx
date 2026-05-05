/**
 * ModularStage — 1.22×1.22m 组合舞台
 * 台面板 + 4根可调高度支腿 + 交叉支撑
 */

export default function ModularStage({ color = '#1A1A1A', heightMm = 600 }) {
    const W = 1.22
    const D = 1.22
    const H = heightMm / 1000
    const deckThickness = 0.04
    const legR = 0.025
    const legH = H - deckThickness
    const inset = 0.05
    const halfW = W / 2 - inset
    const halfD = D / 2 - inset
    const braceR = 0.008

    const legPositions = [
        [-halfW, -halfD],
        [halfW, -halfD],
        [halfW, halfD],
        [-halfW, halfD],
    ]

    // 交叉支撑（两个面的对角线）
    const braces = []
    if (legH > 0.1) {
        // 前面 (Z=-halfD)：左下→右上 & 右下→左上
        const braceLen = Math.sqrt(legH ** 2 + (halfW * 2) ** 2)
        const angle = Math.atan2(legH, halfW * 2)
        braces.push(
            <mesh key="brace-front-1" position={[0, legH / 2, -halfD]}
                rotation={[0, 0, angle]}>
                <cylinderGeometry args={[braceR, braceR, braceLen * 0.92, 4]} />
                <meshStandardMaterial color="#999" metalness={0.5} roughness={0.4} />
            </mesh>,
            <mesh key="brace-front-2" position={[0, legH / 2, -halfD]}
                rotation={[0, 0, -angle]}>
                <cylinderGeometry args={[braceR, braceR, braceLen * 0.92, 4]} />
                <meshStandardMaterial color="#999" metalness={0.5} roughness={0.4} />
            </mesh>,
        )
        // 侧面 (X=-halfW)：前下→后上 & 后下→前上
        const sideBraceLen = Math.sqrt(legH ** 2 + (halfD * 2) ** 2)
        const sideAngle = Math.atan2(legH, halfD * 2)
        braces.push(
            <mesh key="brace-side-1" position={[-halfW, legH / 2, 0]}
                rotation={[sideAngle, 0, 0]}>
                <cylinderGeometry args={[braceR, braceR, sideBraceLen * 0.92, 4]} />
                <meshStandardMaterial color="#999" metalness={0.5} roughness={0.4} />
            </mesh>,
            <mesh key="brace-side-2" position={[-halfW, legH / 2, 0]}
                rotation={[-sideAngle, 0, 0]}>
                <cylinderGeometry args={[braceR, braceR, sideBraceLen * 0.92, 4]} />
                <meshStandardMaterial color="#999" metalness={0.5} roughness={0.4} />
            </mesh>,
        )
    }

    return (
        <group>
            {/* 台面板 */}
            <mesh position={[0, H - deckThickness / 2, 0]}>
                <boxGeometry args={[W, deckThickness, D]} />
                <meshStandardMaterial color={color} roughness={0.6} metalness={0.05} />
            </mesh>

            {/* 四根支腿 */}
            {legPositions.map(([x, z], i) => (
                <mesh key={`leg-${i}`} position={[x, legH / 2, z]}>
                    <cylinderGeometry args={[legR, legR, legH, 8]} />
                    <meshStandardMaterial color="#777" metalness={0.6} roughness={0.3} />
                </mesh>
            ))}

            {/* 交叉支撑 */}
            {braces}
        </group>
    )
}
