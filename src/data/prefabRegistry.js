/**
 * PrefabRegistry — 预制物注册表
 * 中央索引，管理所有可放置的预制搭建物
 */
import { lazy } from 'react'

export const PREFAB_CATEGORIES = [
    { id: 'structure', label: '结构搭建', icon: '🏗️' },
    { id: 'equipment', label: '设施设备', icon: '🎛️' },
    { id: 'furniture', label: '功能家具', icon: '🪑' },
    { id: 'race', label: '赛事专用', icon: '🏃' },
]

const registry = []

export function registerPrefab(entry) {
    registry.push(entry)
}

export function getPrefabs() {
    return registry
}

export function getPrefabById(id) {
    return registry.find((p) => p.id === id) || null
}

export function getPrefabsByCategory(category) {
    if (category === 'all') return registry
    return registry.filter((p) => p.category === category)
}

/* ── 注册所有预制物 ─────────────────────────── */

registerPrefab({
    id: 'sun-umbrella-3x3',
    name: '3×3m 方形遮阳伞',
    category: 'structure',
    icon: '☂️',
    defaultDimensions: { widthMm: 3000, depthMm: 3000, heightMm: 2500 },
    Component: lazy(() => import('./prefabs/SunUmbrella')),
})

registerPrefab({
    id: 'european-tent-3x3',
    name: '3×3m 欧式尖顶帐篷',
    category: 'structure',
    icon: '⛺',
    defaultDimensions: { widthMm: 3000, depthMm: 3000, heightMm: 3500 },
    variants: [
        { id: '3x3', name: '3×3m', overrides: { widthMm: 3000, depthMm: 3000, heightMm: 3500 } },
        { id: '5x5', name: '5×5m', overrides: { widthMm: 5000, depthMm: 5000, heightMm: 4200 } },
    ],
    Component: lazy(() => import('./prefabs/EuropeanTent')),
})

registerPrefab({
    id: 'european-tent-5x5',
    name: '5×5m 欧式尖顶帐篷',
    category: 'structure',
    icon: '🎪',
    defaultDimensions: { widthMm: 5000, depthMm: 5000, heightMm: 4200 },
    Component: lazy(() => import('./prefabs/EuropeanTent')),
})

registerPrefab({
    id: 'crowd-barrier',
    name: '2×1m 铁马护栏',
    category: 'structure',
    icon: '🚧',
    defaultDimensions: { widthMm: 2000, depthMm: 100, heightMm: 1100 },
    Component: lazy(() => import('./prefabs/CrowdBarrier')),
})

registerPrefab({
    id: 'rosenberg-tent-3x6',
    name: '3×6m 罗斯伯格篷房',
    category: 'structure',
    icon: '🏕️',
    defaultDimensions: { widthMm: 6000, depthMm: 3000, heightMm: 3000 },
    Component: lazy(() => import('./prefabs/RosenbergTent')),
})

registerPrefab({
    id: 'modular-stage',
    name: '1.22×1.22m 组合舞台',
    category: 'structure',
    icon: '🎬',
    defaultDimensions: { widthMm: 1220, depthMm: 1220, heightMm: 600 },
    Component: lazy(() => import('./prefabs/ModularStage')),
})

registerPrefab({
    id: 'truss-segment-30',
    name: '30cm 桁架段',
    category: 'structure',
    icon: '🔩',
    defaultDimensions: { widthMm: 300, depthMm: 300, heightMm: 2000 },
    variants: [
        { id: '20cm', name: '20cm截面', overrides: { widthMm: 200, depthMm: 200 } },
        { id: '30cm', name: '30cm截面', overrides: { widthMm: 300, depthMm: 300 } },
        { id: '40cm', name: '40cm截面', overrides: { widthMm: 400, depthMm: 400 } },
    ],
    Component: lazy(() => import('./prefabs/TrussSegment')),
})
