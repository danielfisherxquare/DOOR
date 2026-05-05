/**
 * SunUmbrella — 3×3m 方形遮阳伞
 * 中央立柱 + 方形伞面 + 骨架
 */
import * as THREE from 'three'

export default function SunUmbrella({ color = '#E53E3E', scale = 1 }) {
    const W = 3 * scale
    const D = 3 * scale
    const H = 2.5 * scale
    const poleR = 0.04
    const ribR = 0.012

    return (
        <group>
            {/* 中央立柱 */}
            <mesh position={[0, H / 2, 0]}>
                <cylinderGeometry args={[poleR, poleR * 1.2, H, 8]} />
                <meshStandardMaterial color="#555" metalness={0.6} roughness={0.3} />
            </mesh>

            {/* 伞面 — 使用扁平圆柱模拟布面 */}
            <mesh position={[0, H - 0.01, 0]}>
                <cylinderGeometry args={[W / 2 * 1.02, W / 2 * 0.98, 0.02, 8]} />
                <meshStandardMaterial color={color} roughness={0.85} side={THREE.DoubleSide} />
            </mesh>

            {/* 伞面底边线框 */}
            <lineSegments position={[0, H - 0.01, 0]}>
                <edgesGeometry args={[new THREE.CylinderGeometry(W / 2, W / 2, 0.02, 8)]} />
                <lineBasicMaterial color="#333" />
            </lineSegments>

            {/* 伞骨 — 从中心向四角延伸 */}
            {[
                [W / 2, 0], [-W / 2, 0], [0, D / 2], [0, -D / 2],
            ].map(([dx, dz], i) => (
                <mesh key={`rib-${i}`} position={[dx / 2, H - 0.02, dz / 2]} rotation={[
                    dz !== 0 ? Math.atan2(-0.15, Math.abs(dz / 2)) : 0,
                    0,
                    dx !== 0 ? Math.atan2(0.15, Math.abs(dx / 2)) : 0,
                ]}>
                    <cylinderGeometry args={[ribR, ribR, Math.sqrt((dx / 2) ** 2 + (dz / 2) ** 2 + 0.15 ** 2), 4]} />
                    <meshStandardMaterial color="#777" metalness={0.5} roughness={0.4} />
                </mesh>
            ))}

            {/* 伞顶装饰 */}
            <mesh position={[0, H + 0.04, 0]}>
                <sphereGeometry args={[0.03, 8, 6]} />
                <meshStandardMaterial color="#444" metalness={0.6} roughness={0.3} />
            </mesh>
        </group>
    )
}
