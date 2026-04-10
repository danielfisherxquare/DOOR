/**
 * DOOR to Pascal Data Adapter
 * 转换 DOOR snapshot_json 与 Pascal schema nodes 之间的数据格式
 *
 * Pascal schema 层级:
 *   site → building → level → wall / zone / slab / ceiling / item
 *
 * DOOR snapshot 结构:
 *   warehouse (flat): lines[], walls[], prefabs[], zones[], racks[], structures[]
 */

const uuidv4 = () => (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });

// ──────────────────────────────────────────────────
// ID 生成（符合 Pascal template literal 约定）
// ──────────────────────────────────────────────────

function wallId(raw)      { return raw?.startsWith('wall_') ? raw : `wall_${raw || uuidv4()}`; }
function lineId(raw)      { return raw?.startsWith('line_') ? raw : `line_${raw || uuidv4()}`; }
function zoneId(raw)      { return raw?.startsWith('zone_') ? raw : `zone_${raw || uuidv4()}`; }
function itemId(raw)      { return raw?.startsWith('item_') ? raw : `item_${raw || uuidv4()}`; }
function buildingId(raw)  { return raw?.startsWith('building_') ? raw : `building_${raw || uuidv4()}`; }
function levelId(raw)     { return raw?.startsWith('level_') ? raw : `level_${raw || uuidv4()}`; }
function siteId(raw)      { return raw?.startsWith('site_') ? raw : `site_${raw || uuidv4()}`; }
function slabId(raw)      { return raw?.startsWith('slab_') ? raw : `slab_${raw || uuidv4()}`; }

// 保留原始 ID 到 Pascal ID 的映射，用于逆向还原
const ID_MAP_KEY = '__doorIdMap';

// ──────────────────────────────────────────────────
// DOOR → Pascal (snapshot → nodes + rootNodeIds)
// ──────────────────────────────────────────────────

/**
 * 将 DOOR snapshot 转换为 Pascal scene 数据
 * @param {Object} snapshot - DOOR snapshot_json（含 warehouse 扁平数据）
 * @param {Object} [meta] - 额外元数据 { warehouseName, warehouseId, buildingName }
 * @returns {{ nodes: Record<string, any>, rootNodeIds: string[] }}
 */
export function convertDoorSnapshotToPascalScene(snapshot, meta = {}) {
    if (!snapshot) return { nodes: {}, rootNodeIds: [] };

    const nodes = {};
    const doorIdToPascalId = {};

    // 建立层级: site → building → level
    const sid = siteId('main');
    const bid = buildingId(meta.buildingId || 'default');
    const lid = levelId(meta.levelId || 'L001');
    const warehouseWidthMm = Number(snapshot?.warehouse?.dimensions_mm?.width_mm || snapshot?.warehouse?.dimensionsMm?.width_mm || 24000);
    const warehouseDepthMm = Number(snapshot?.warehouse?.dimensions_mm?.depth_mm || snapshot?.warehouse?.dimensionsMm?.depth_mm || 18000);
    const floorWidth = Math.max(warehouseWidthMm / 1000, 4);
    const floorDepth = Math.max(warehouseDepthMm / 1000, 4);

    // site node
    nodes[sid] = {
        id: sid,
        type: 'site',
        object: 'node',
        parentId: null,
        visible: true,
        polygon: {
            type: 'polygon',
            points: [
                [0, 0],
                [floorWidth, 0],
                [floorWidth, floorDepth],
                [0, floorDepth],
            ],
        },
        children: [bid],
        metadata: {
            doorProjectId: meta.projectId || null,
        },
    };

    // building node
    nodes[bid] = {
        id: bid,
        type: 'building',
        object: 'node',
        parentId: sid,
        name: meta.buildingName || meta.warehouseName || '建筑',
        visible: true,
        children: [lid],
        position: [0, 0, 0],
        rotation: [0, 0, 0],
    };

    // level node
    const levelChildren = [];
    nodes[lid] = {
        id: lid,
        type: 'level',
        object: 'node',
        parentId: bid,
        name: meta.levelName || '一层',
        visible: true,
        children: levelChildren,
        level: 0,
    };
    const defaultSlabId = slabId(meta.warehouseId || 'default-floor');

    nodes[defaultSlabId] = {
        id: defaultSlabId,
        type: 'slab',
        object: 'node',
        parentId: lid,
        visible: true,
        polygon: [
            [0, 0],
            [floorWidth, 0],
            [floorWidth, floorDepth],
            [0, floorDepth],
        ],
        holes: [],
        elevation: 0,
        material: { preset: 'concrete' },
    };
    levelChildren.push(defaultSlabId);

    // ── lines ──
    for (const line of snapshot.lines || []) {
        const pid = lineId(line.id);
        doorIdToPascalId[line.id] = pid;

        nodes[pid] = {
            id: pid,
            type: 'line',
            object: 'node',
            parentId: lid,
            visible: line.visible !== false,
            start: [line.start?.x || 0, line.start?.z || 0],
            end: [line.end?.x || 0, line.end?.z || 0],
            color: line.color || '#3767cf',
            children: [],
            metadata: {
                doorOriginalId: line.id,
            },
        };

        levelChildren.push(pid);
    }

    // ── walls ──
    for (const wall of snapshot.walls || []) {
        const pid = wallId(wall.id);
        doorIdToPascalId[wall.id] = pid;

        const wallChildren = [];

        // Pascal wall: start/end 为 [x, y] tuples
        // DOOR wall: start { x, z }, end { x, z }
        nodes[pid] = {
            id: pid,
            type: 'wall',
            object: 'node',
            parentId: lid,
            visible: true,
            start: [wall.start?.x || 0, wall.start?.z || 0],
            end: [wall.end?.x || 0, wall.end?.z || 0],
            height: wall.height || 2.8,
            thickness: wall.thickness || 0.2,
            children: wallChildren,
            frontSide: 'unknown',
            backSide: 'unknown',
            material: wall.material ? { preset: normalizeMaterialPreset(wall.material) } : undefined,
            metadata: {
                doorOriginalId: wall.id,
                doorOpenings: wall.openings || [],
            },
        };

        // 将门窗转为 door/window nodes (if openings exist)
        for (const opening of wall.openings || []) {
            const oid = opening.type === 'door'
                ? `door_${opening.id || uuidv4()}`
                : `window_${opening.id || uuidv4()}`;
            doorIdToPascalId[opening.id] = oid;
            wallChildren.push(oid);

            nodes[oid] = {
                id: oid,
                type: opening.type === 'door' ? 'door' : 'window',
                object: 'node',
                parentId: pid,
                wallId: pid,
                visible: true,
                position: [opening.position?.x || 0, opening.position?.y || 0, 0],
                rotation: [0, 0, 0],
                width: opening.width || 0.9,
                height: opening.height || 2.1,
            };
        }

        levelChildren.push(pid);
    }

    // ── zones ──
    for (const zone of snapshot.zones || []) {
        const pid = zoneId(zone.id);
        doorIdToPascalId[zone.id] = pid;

        // bounds_mm → polygon（4点矩形, 单位换算 mm→m）
        const bounds = zone.bounds_mm || {};
        const x = (bounds.x || 0) / 1000;
        const z = (bounds.z || 0) / 1000;
        const w = (bounds.width_mm || 6000) / 1000;
        const d = (bounds.depth_mm || 4000) / 1000;

        // 如果已有 polygon 数据，直接使用；否则从 bounds_mm 转换
        const polygon = zone.polygon || [
            [x,     z    ],
            [x + w, z    ],
            [x + w, z + d],
            [x,     z + d],
        ];

        nodes[pid] = {
            id: pid,
            type: 'zone',
            object: 'node',
            parentId: lid,
            name: zone.name || zone.code || '未命名区域',
            visible: true,
            polygon,
            color: zone.color || '#64748B',
            metadata: {
                doorOriginalId: zone.id,
                zoneType: zone.zone_type || 'general',
                boundsHeight: (bounds.height_mm || 600) / 1000,
                // 保留地图兼容用数据
                geoAnchor: zone.geoAnchor || null,
            },
        };

        levelChildren.push(pid);
    }

    // ── prefabs → items ──
    for (const prefab of snapshot.prefabs || []) {
        const pid = itemId(prefab.id);
        doorIdToPascalId[prefab.id] = pid;

        nodes[pid] = {
            id: pid,
            type: 'item',
            object: 'node',
            parentId: lid,
            visible: true,
            position: [
                prefab.position?.x || 0,
                prefab.position?.y || 0,
                prefab.position?.z || 0,
            ],
            rotation: [
                0,
                (prefab.rotationDeg || 0) * Math.PI / 180,
                0,
            ],
            scale: [1, 1, 1],
            children: [],
            asset: {
                id: prefab.prefabId || prefab.id,
                category: prefab.category || 'furniture',
                name: prefab.name || '未命名',
                thumbnail: prefab.thumbnail || '',
                src: prefab.src || prefab.modelUrl || '',
                dimensions: [1, 1, 1],
            },
            metadata: {
                doorOriginalId: prefab.id,
                doorPrefabId: prefab.prefabId,
                doorColor: prefab.color,
            },
        };

        levelChildren.push(pid);
    }

    // ── racks → items (with special metadata) ──
    for (const rack of snapshot.racks || []) {
        const pid = itemId(rack.id);
        doorIdToPascalId[rack.id] = pid;

        const pos = rack.position_mm || {};
        const dims = rack.outer_dimensions_mm || {};

        nodes[pid] = {
            id: pid,
            type: 'item',
            object: 'node',
            parentId: lid,
            visible: true,
            position: [
                (pos.x || 0) / 1000,
                (pos.y || 0) / 1000,
                (pos.z || 0) / 1000,
            ],
            rotation: [0, 0, 0],
            scale: [
                (dims.width_mm || 2400) / 1000,
                (dims.height_mm || 3200) / 1000,
                (dims.depth_mm || 1000) / 1000,
            ],
            children: [],
            asset: {
                id: `rack:${rack.rack_template_id || rack.id}`,
                category: 'rack',
                name: rack.name || rack.code || '货架',
                thumbnail: '',
                src: '',
                dimensions: [
                    (dims.width_mm || 2400) / 1000,
                    (dims.height_mm || 3200) / 1000,
                    (dims.depth_mm || 1000) / 1000,
                ],
            },
            metadata: {
                doorOriginalId: rack.id,
                doorRackTemplateId: rack.rack_template_id,
                doorFinish: rack.finish || 'steel',
                isRack: true,
            },
        };

        levelChildren.push(pid);
    }

    // ── structures → items (columns, beams, stairs, ramps) ──
    for (const structure of snapshot.structures || []) {
        const pid = itemId(structure.id);
        doorIdToPascalId[structure.id] = pid;

        const pos = structure.position || {};
        const rot = structure.rotation || {};
        const dims = structure.dimensions || { width: 0.4, height: 3, depth: 0.4 };

        nodes[pid] = {
            id: pid,
            type: 'item',
            object: 'node',
            parentId: lid,
            visible: true,
            position: [pos.x || 0, pos.y || 0, pos.z || 0],
            rotation: [rot.x || 0, rot.y || 0, rot.z || 0],
            scale: [dims.width || 1, dims.height || 1, dims.depth || 1],
            children: [],
            asset: {
                id: `structure:${structure.type || 'generic'}`,
                category: 'structure',
                name: structure.name || structure.type || '结构件',
                thumbnail: '',
                src: '',
                dimensions: [dims.width || 1, dims.height || 1, dims.depth || 1],
            },
            metadata: {
                doorOriginalId: structure.id,
                structureType: structure.type,
                isStructure: true,
            },
        };

        levelChildren.push(pid);
    }

    // 更新 level children
    nodes[lid].children = levelChildren;

    // 在 site metadata 中保存 ID 映射（用于反向转换时保持 ID 稳定）
    nodes[sid].metadata[ID_MAP_KEY] = doorIdToPascalId;

    // 保存 EditorDocument（如果存在）
    if (snapshot.editorDocument) {
        nodes[sid].metadata.editorDocument = snapshot.editorDocument;
    }

    return {
        nodes,
        rootNodeIds: [sid],
    };
}

// ──────────────────────────────────────────────────
// Pascal → DOOR (nodes → snapshot)
// ──────────────────────────────────────────────────

/**
 * 将 Pascal nodes 转换回 DOOR snapshot
 * @param {Record<string, any>} nodes - Pascal nodes
 * @returns {Object} DOOR snapshot_json (flat)
 */
export function convertPascalNodesToDoorSnapshot(nodes) {
    const snapshot = {
        lines: [],
        walls: [],
        prefabs: [],
        zones: [],
        racks: [],
        structures: [],
    };

    if (!nodes) return snapshot;

    const openingMap = {};

    for (const [id, node] of Object.entries(nodes)) {
        if (!node || !node.type) continue;
        if (node.type !== 'door' && node.type !== 'window') continue;

        const wallId = node.wallId || node.parentId;
        if (!wallId) continue;

        if (!openingMap[wallId]) {
            openingMap[wallId] = [];
        }

        const originalId = node.metadata?.doorOriginalId || id.replace(/^(door|window)_/, '');
        openingMap[wallId].push({
            id: originalId,
            type: node.type,
            position: {
                x: node.position?.[0] || 0,
                y: node.position?.[1] || 0,
            },
            width: node.width || 0.9,
            height: node.height || 2.1,
        });
    }

    for (const [id, node] of Object.entries(nodes)) {
        if (!node || !node.type) continue;

        switch (node.type) {
            case 'line': {
                const originalId = node.metadata?.doorOriginalId || id.replace(/^line_/, '');
                snapshot.lines.push({
                    id: originalId,
                    start: { x: node.start?.[0] || 0, z: node.start?.[1] || 0 },
                    end: { x: node.end?.[0] || 0, z: node.end?.[1] || 0 },
                    color: node.color || '#3767cf',
                    visible: node.visible !== false,
                });
                break;
            }

            case 'wall': {
                const originalId = node.metadata?.doorOriginalId || id.replace(/^wall_/, '');
                const currentOpenings = openingMap[node.id];
                snapshot.walls.push({
                    id: originalId,
                    start: { x: node.start?.[0] || 0, z: node.start?.[1] || 0 },
                    end: { x: node.end?.[0] || 0, z: node.end?.[1] || 0 },
                    height: node.height || 2.8,
                    thickness: node.thickness || 0.2,
                    material: node.material?.preset || 'concrete',
                    openings: currentOpenings || node.metadata?.doorOpenings || [],
                });
                break;
            }

            case 'zone': {
                const originalId = node.metadata?.doorOriginalId || id.replace(/^zone_/, '');
                // polygon → bounds_mm (取 bounding rect)
                const polygon = node.polygon || [];
                let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
                for (const [px, pz] of polygon) {
                    if (px < minX) minX = px;
                    if (pz < minZ) minZ = pz;
                    if (px > maxX) maxX = px;
                    if (pz > maxZ) maxZ = pz;
                }
                const w = maxX - minX;
                const d = maxZ - minZ;
                const h = node.metadata?.boundsHeight || 0.6;

                snapshot.zones.push({
                    id: originalId,
                    name: node.name || '区域',
                    code: node.name || '区域',
                    zone_type: node.metadata?.zoneType || 'general',
                    color: node.color || '#64748B',
                    // 保留 polygon 供地图使用
                    polygon: node.polygon,
                    geoAnchor: node.metadata?.geoAnchor || null,
                    bounds_mm: {
                        x: (isFinite(minX) ? minX : 0) * 1000,
                        y: 0,
                        z: (isFinite(minZ) ? minZ : 0) * 1000,
                        width_mm: (isFinite(w) ? w : 6) * 1000,
                        height_mm: h * 1000,
                        depth_mm: (isFinite(d) ? d : 4) * 1000,
                    },
                });
                break;
            }

            case 'item': {
                const originalId = node.metadata?.doorOriginalId || id.replace(/^item_/, '');

                if (node.metadata?.isRack) {
                    // 货架
                    snapshot.racks.push({
                        id: originalId,
                        rack_template_id: node.metadata.doorRackTemplateId || node.asset?.id?.replace('rack:', '') || '',
                        name: node.asset?.name || node.name || '货架',
                        code: node.asset?.name || node.name || '货架',
                        position_mm: {
                            x: (node.position?.[0] || 0) * 1000,
                            y: (node.position?.[1] || 0) * 1000,
                            z: (node.position?.[2] || 0) * 1000,
                        },
                        outer_dimensions_mm: {
                            width_mm: (node.scale?.[0] || 1) * 1000,
                            height_mm: (node.scale?.[1] || 1) * 1000,
                            depth_mm: (node.scale?.[2] || 1) * 1000,
                        },
                        finish: node.metadata.doorFinish || 'steel',
                    });
                } else if (node.metadata?.isStructure) {
                    // 结构件
                    snapshot.structures.push({
                        id: originalId,
                        type: node.metadata.structureType || 'column',
                        name: node.asset?.name || node.name || '结构件',
                        position: {
                            x: node.position?.[0] || 0,
                            y: node.position?.[1] || 0,
                            z: node.position?.[2] || 0,
                        },
                        rotation: {
                            x: node.rotation?.[0] || 0,
                            y: node.rotation?.[1] || 0,
                            z: node.rotation?.[2] || 0,
                        },
                        dimensions: {
                            width: node.scale?.[0] || 1,
                            height: node.scale?.[1] || 1,
                            depth: node.scale?.[2] || 1,
                        },
                    });
                } else {
                    // 普通 prefab
                    snapshot.prefabs.push({
                        id: originalId,
                        prefabId: node.metadata?.doorPrefabId || node.asset?.id || '',
                        name: node.asset?.name || node.name || '物件',
                        position: {
                            x: node.position?.[0] || 0,
                            y: node.position?.[1] || 0,
                            z: node.position?.[2] || 0,
                        },
                        rotationDeg: (node.rotation?.[1] || 0) * 180 / Math.PI,
                        color: node.metadata?.doorColor,
                        category: node.asset?.category,
                        thumbnail: node.asset?.thumbnail,
                        src: node.asset?.src,
                        modelUrl: node.asset?.src,
                    });
                }
                break;
            }

            // 跳过层级节点（site/building/level）— 不直接转成 snapshot 内容
            case 'site':
            case 'building':
            case 'level':
                break;

            default:
                break;
        }
    }

    return snapshot;
}

/**
 * 合并 Pascal nodes 变更到现有 snapshot（保留 warehouse / editorState 等顶层字段）
 * @param {Object} currentSnapshot - 当前完整 DOOR snapshot
 * @param {Record<string, any>} nodes - Pascal nodes
 * @param {Object} [editorDocument] - 可选的 EditorDocument 数据
 * @returns {Object} 合并后的 DOOR snapshot
 */
export function mergePascalNodesToSnapshot(currentSnapshot, nodes, editorDocument = null) {
    const converted = convertPascalNodesToDoorSnapshot(nodes);

    const result = {
        ...currentSnapshot,
        lines: converted.lines,
        walls: converted.walls,
        prefabs: converted.prefabs,
        zones: converted.zones,
        racks: converted.racks,
        structures: converted.structures,
    };

    // 保留 EditorDocument 数据
    if (editorDocument) {
        result.editorDocument = editorDocument;
    } else if (currentSnapshot.editorDocument) {
        result.editorDocument = currentSnapshot.editorDocument;
    }

    return result;
}

// ──────────────────────────────────────────────────
// 向后兼容别名
// ──────────────────────────────────────────────────

/** @deprecated Use convertDoorSnapshotToPascalScene instead */
export function convertDoorSnapshotToPascalNodes(snapshot) {
    const { nodes } = convertDoorSnapshotToPascalScene(snapshot);
    return nodes;
}

// ──────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────

const VALID_PRESETS = new Set([
    'custom', 'white', 'brick', 'concrete', 'wood',
    'glass', 'metal', 'plaster', 'tile', 'marble',
]);

function normalizeMaterialPreset(raw) {
    if (!raw) return 'concrete';
    const lower = String(raw).toLowerCase();
    return VALID_PRESETS.has(lower) ? lower : 'custom';
}

export default {
    convertDoorSnapshotToPascalScene,
    convertDoorSnapshotToPascalNodes,
    convertPascalNodesToDoorSnapshot,
    mergePascalNodesToSnapshot,
};
