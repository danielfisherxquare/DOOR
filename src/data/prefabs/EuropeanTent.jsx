/**
 * EuropeanTent — 欧式尖顶帐篷
 * 4 根立柱 + 金字塔锥形篷顶 + 底部围布
 * 通过 size prop 切换 3×3m / 5×5m
 */
import * as THREE from 'three'

export default function EuropeanTent({ color = '#FFFFFF', size = '3x3' }) {
    const is5 = size === '5x5'
    const W = is5 ? 5 : 3
    const D = is5 ? 5 : 3
    const wallH = is5 ? 2.4 : 2.0
    const peakH = is5 ? 4.2 : 3.5
    const poleR = 0.03
    const halfW = W / 2
    const halfD = D / 2
    const coneH = peakH - wallH

    // 立柱位置（四角内缩 5cm）
    const inset = 0.05
    const poles = [
        [-halfW + inset, -halfD + inset],
        [halfW - inset, -halfD + inset],
        [halfW - inset, halfD - inset],
        [-halfW + inset, halfD - inset],
    ]

    // 构建金字塔锥顶几何体（4面金字塔）
    const roofRadius = Math.max(halfW, halfD) * 1.05

    return (
        <group>
            {/* 四根立柱 */}
            {poles.map(([px, pz], i) => (
                <mesh key={`pole-${i}`} position={[px, wallH / 2, pz]}>
                    <cylinderGeometry args={[poleR, poleR, wallH, 6]} />
                    <meshStandardMaterial color="#888" metalness={0.5} roughness={0.4} />
                </mesh>
            ))}

            {/* 金字塔锥形篷顶 — 使用 4 段锥体 */}
            <mesh position={[0, wallH + coneH / 2, 0]} rotation={[0, Math.PI / 4, 0]}>
                <coneGeometry args={[roofRadius, coneH, 4]} />
                <meshStandardMaterial color={color} roughness={0.85} side={THREE.DoubleSide} />
            </mesh>

            {/* 顶部线框 */}
            <lineSegments position={[0, wallH + coneH / 2, 0]} rotation={[0, Math.PI / 4, 0]}>
                <edgesGeometry args={[new THREE.ConeGeometry(roofRadius, coneH, 4)]} />
                <lineBasicMaterial color="#999" />
            </lineSegments>

            {/* 底部围布（半透明） */}
            <mesh position={[0, wallH / 2, 0]}>
                <boxGeometry args={[W, wallH, D]} />
                <meshStandardMaterial
                    color={color}
                    transparent
                    opacity={0.12}
                    side={THREE.DoubleSide}
                />
            </mesh>

            {/* 底部围布线框 */}
            <lineSegments position={[0, wallH / 2, 0]}>
                <edgesGeometry args={[new THREE.BoxGeometry(W, wallH, D)]} />
                <lineBasicMaterial color="#CCC" />
            </lineSegments>

            {/* 顶尖装饰 */}
            <mesh position={[0, peakH + 0.05, 0]}>
                <sphereGeometry args={[0.04, 8, 6]} />
                <meshStandardMaterial color="#DDD" metalness={0.3} roughness={0.5} />
            </mesh>
        </group>
    )
}
