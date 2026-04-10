import { useMemo } from 'react'
import * as THREE from 'three'

export default function SimpleLine3D({
    points = [],
    color = '#ffffff',
    opacity = 1,
    closed = false,
    thickness = 0.02,
}) {
    const segments = useMemo(() => {
        const source = closed && points.length > 2 ? [...points, points[0]] : points
        if (!Array.isArray(source) || source.length < 2) return []

        return source.slice(0, -1).map((startPoint, index) => {
            const endPoint = source[index + 1]
            const start = new THREE.Vector3(...startPoint)
            const end = new THREE.Vector3(...endPoint)
            const delta = new THREE.Vector3().subVectors(end, start)
            const length = delta.length()

            if (length < 1e-5) return null

            const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)
            const quaternion = new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(1, 0, 0),
                delta.normalize(),
            )

            return {
                key: `${index}-${startPoint.join(',')}-${endPoint.join(',')}`,
                length,
                midpoint: midpoint.toArray(),
                quaternion,
            }
        }).filter(Boolean)
    }, [closed, points])

    if (!segments.length) return null

    return (
        <group>
            {segments.map((segment) => (
                <mesh
                    key={segment.key}
                    position={segment.midpoint}
                    quaternion={segment.quaternion}
                >
                    <boxGeometry args={[segment.length, thickness, thickness]} />
                    <meshBasicMaterial color={color} transparent opacity={opacity} />
                </mesh>
            ))}
        </group>
    )
}
