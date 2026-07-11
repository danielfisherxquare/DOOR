import { buildGeometryPreflight } from '@arcspro/studio-model/export-manifest';
import { ensureArray, pickNumber, round } from './inventory.spatial.export-utils.js';
function hexToRgbaFactor(hexColor) {
    const normalized = String(hexColor || '#d9d9d9').replace('#', '').trim();
    const value = normalized.length === 3
        ? normalized.split('').map((char) => `${char}${char}`).join('')
        : normalized.padEnd(6, '0').slice(0, 6);
    const red = parseInt(value.slice(0, 2), 16) / 255;
    const green = parseInt(value.slice(2, 4), 16) / 255;
    const blue = parseInt(value.slice(4, 6), 16) / 255;
    return [round(red, 6), round(green, 6), round(blue, 6), 1];
}

function toBufferFromTypedArray(typedArray) {
    return Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
}

function padBuffer(buffer, padByte = 0x00) {
    const remainder = buffer.length % 4;
    if (remainder === 0) return buffer;
    return Buffer.concat([buffer, Buffer.alloc(4 - remainder, padByte)]);
}

function computeMinMax(vertices) {
    const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
    const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
    for (let index = 0; index < vertices.length; index += 3) {
        min[0] = Math.min(min[0], vertices[index]);
        min[1] = Math.min(min[1], vertices[index + 1]);
        min[2] = Math.min(min[2], vertices[index + 2]);
        max[0] = Math.max(max[0], vertices[index]);
        max[1] = Math.max(max[1], vertices[index + 1]);
        max[2] = Math.max(max[2], vertices[index + 2]);
    }
    return {
        min: min.map((value) => round(value, 6)),
        max: max.map((value) => round(value, 6)),
    };
}

function computeMinMaxForStride(values, stride) {
    const min = Array.from({ length: stride }, () => Number.POSITIVE_INFINITY);
    const max = Array.from({ length: stride }, () => Number.NEGATIVE_INFINITY);
    for (let index = 0; index < values.length; index += stride) {
        for (let offset = 0; offset < stride; offset += 1) {
            const value = pickNumber(values[index + offset], 0);
            min[offset] = Math.min(min[offset], value);
            max[offset] = Math.max(max[offset], value);
        }
    }
    return {
        min: min.map((value) => round(Number.isFinite(value) ? value : 0, 6)),
        max: max.map((value) => round(Number.isFinite(value) ? value : 0, 6)),
    };
}

function buildYRotationQuaternion(rotationDeg = 0) {
    const halfAngle = (pickNumber(rotationDeg, 0) * Math.PI) / 360;
    return [
        0,
        round(Math.sin(halfAngle), 6),
        0,
        round(Math.cos(halfAngle), 6),
    ];
}

export function buildGlbFromBatchFile(batchFile) {
    const preflight = batchFile?.metadata?.preflight || buildGeometryPreflight(batchFile?.meshes);
    if (preflight.status === 'error') {
        const error = new Error('geometry preflight failed: ' + (preflight.warningCodes.join(', ') || 'invalid geometry'));
        error.preflight = preflight;
        throw error;
    }

    const document = {
        asset: {
            version: '2.0',
            generator: 'door-focus-zone-export',
        },
        scene: 0,
        scenes: [{ nodes: [] }],
        nodes: [],
        meshes: [],
        materials: [],
        accessors: [],
        bufferViews: [],
        buffers: [{ byteLength: 0 }],
    };

    const binaryParts = [];
    let byteOffset = 0;
    const materialMap = new Map();

    const ensureMaterial = (color) => {
        const key = String(color || '#d9d9d9');
        if (materialMap.has(key)) return materialMap.get(key);
        const materialIndex = document.materials.length;
        document.materials.push({
            name: `mat-${key.replace('#', '')}`,
            pbrMetallicRoughness: {
                baseColorFactor: hexToRgbaFactor(key),
                metallicFactor: 0,
                roughnessFactor: 1,
            },
            doubleSided: true,
        });
        materialMap.set(key, materialIndex);
        return materialIndex;
    };

    ensureArray(batchFile?.meshes).forEach((meshPart) => {
        const positions = new Float32Array(ensureArray(meshPart.vertices).map((value) => pickNumber(value, 0)));
        const indices = new Uint32Array(ensureArray(meshPart.indices).map((value) => Math.max(0, Math.round(pickNumber(value, 0)))));
        const positionBuffer = toBufferFromTypedArray(positions);
        const indexBuffer = toBufferFromTypedArray(indices);

        const positionViewIndex = document.bufferViews.length;
        document.bufferViews.push({
            buffer: 0,
            byteOffset,
            byteLength: positionBuffer.length,
            target: 34962,
        });
        binaryParts.push(positionBuffer);
        byteOffset += positionBuffer.length;

        const { min, max } = computeMinMax(ensureArray(meshPart.vertices));
        const positionAccessorIndex = document.accessors.length;
        document.accessors.push({
            bufferView: positionViewIndex,
            componentType: 5126,
            count: positions.length / 3,
            type: 'VEC3',
            min,
            max,
        });

        const indexViewIndex = document.bufferViews.length;
        document.bufferViews.push({
            buffer: 0,
            byteOffset,
            byteLength: indexBuffer.length,
            target: 34963,
        });
        binaryParts.push(indexBuffer);
        byteOffset += indexBuffer.length;

        const indexAccessorIndex = document.accessors.length;
        document.accessors.push({
            bufferView: indexViewIndex,
            componentType: 5125,
            count: indices.length,
            type: 'SCALAR',
            min: indices.length ? [0] : undefined,
            max: indices.length ? [Math.max(...indices)] : undefined,
        });

        const meshIndex = document.meshes.length;
        document.meshes.push({
            name: meshPart.id,
            primitives: [{
                attributes: { POSITION: positionAccessorIndex },
                indices: indexAccessorIndex,
                mode: 4,
                material: ensureMaterial(meshPart.color),
            }],
            extras: {
                sourceObjectId: meshPart.sourceObjectId || null,
                objectType: meshPart.objectType || null,
                lodLevel: meshPart.lodLevel || null,
                primitive: meshPart.primitive || null,
            },
        });

        const nodeIndex = document.nodes.length;
        document.nodes.push({
            name: meshPart.id,
            mesh: meshIndex,
        });
        document.scenes[0].nodes.push(nodeIndex);
    });

    const binaryChunk = Buffer.concat(binaryParts);
    document.buffers[0].byteLength = binaryChunk.length;

    const jsonChunk = padBuffer(Buffer.from(JSON.stringify(document), 'utf8'), 0x20);
    const paddedBinaryChunk = padBuffer(binaryChunk, 0x00);
    const totalLength = 12 + 8 + jsonChunk.length + 8 + paddedBinaryChunk.length;
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546C67, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(totalLength, 8);

    const jsonHeader = Buffer.alloc(8);
    jsonHeader.writeUInt32LE(jsonChunk.length, 0);
    jsonHeader.writeUInt32LE(0x4E4F534A, 4);

    const binHeader = Buffer.alloc(8);
    binHeader.writeUInt32LE(paddedBinaryChunk.length, 0);
    binHeader.writeUInt32LE(0x004E4942, 4);

    return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, paddedBinaryChunk]);
}

export function buildInstancedGlbFromTemplates(templates, resource) {
    const document = {
        asset: {
            version: '2.0',
            generator: 'door-focus-zone-export-instancing',
        },
        extensionsUsed: ['EXT_mesh_gpu_instancing'],
        extensionsRequired: ['EXT_mesh_gpu_instancing'],
        scene: 0,
        scenes: [{ nodes: [] }],
        nodes: [],
        meshes: [],
        materials: [],
        accessors: [],
        bufferViews: [],
        buffers: [{ byteLength: 0 }],
    };

    const binaryParts = [];
    let byteOffset = 0;
    const materialMap = new Map();

    const ensureMaterial = (color) => {
        const key = String(color || '#d9d9d9');
        if (materialMap.has(key)) return materialMap.get(key);
        const materialIndex = document.materials.length;
        document.materials.push({
            name: `mat-${key.replace('#', '')}`,
            pbrMetallicRoughness: {
                baseColorFactor: hexToRgbaFactor(key),
                metallicFactor: 0,
                roughnessFactor: 1,
            },
            doubleSided: true,
        });
        materialMap.set(key, materialIndex);
        return materialIndex;
    };

    const pushViewAndAccessor = ({ typedArray, target, componentType, type, min, max }) => {
        const buffer = toBufferFromTypedArray(typedArray);
        const bufferViewIndex = document.bufferViews.length;
        document.bufferViews.push({
            buffer: 0,
            byteOffset,
            byteLength: buffer.length,
            ...(target ? { target } : {}),
        });
        binaryParts.push(buffer);
        byteOffset += buffer.length;

        const accessorIndex = document.accessors.length;
        document.accessors.push({
            bufferView: bufferViewIndex,
            componentType,
            count: typedArray.length / ({ SCALAR: 1, VEC3: 3, VEC4: 4 }[type] || 1),
            type,
            ...(min ? { min } : {}),
            ...(max ? { max } : {}),
        });
        return accessorIndex;
    };

    ensureArray(templates).forEach((template, templateIndex) => {
        const instances = ensureArray(template?.instances);
        const templateMeshes = ensureArray(template?.templateMeshes);
        if (!instances.length || !templateMeshes.length) return;

        const translationsArray = new Float32Array(instances.flatMap((instance) => ([
            pickNumber(instance?.translation?.x, 0),
            pickNumber(instance?.translation?.y, 0),
            pickNumber(instance?.translation?.z, 0),
        ])));
        const rotationsArray = new Float32Array(instances.flatMap((instance) => buildYRotationQuaternion(instance?.rotationDeg)));
        const scalesArray = new Float32Array(instances.flatMap((instance) => ([
            pickNumber(instance?.scale?.x, 1),
            pickNumber(instance?.scale?.y, 1),
            pickNumber(instance?.scale?.z, 1),
        ])));

        const translationBounds = computeMinMaxForStride(Array.from(translationsArray), 3);
        const scaleBounds = computeMinMaxForStride(Array.from(scalesArray), 3);
        const translationAccessorIndex = pushViewAndAccessor({
            typedArray: translationsArray,
            componentType: 5126,
            type: 'VEC3',
            min: translationBounds.min,
            max: translationBounds.max,
        });
        const rotationAccessorIndex = pushViewAndAccessor({
            typedArray: rotationsArray,
            componentType: 5126,
            type: 'VEC4',
        });
        const scaleAccessorIndex = pushViewAndAccessor({
            typedArray: scalesArray,
            componentType: 5126,
            type: 'VEC3',
            min: scaleBounds.min,
            max: scaleBounds.max,
        });

        templateMeshes.forEach((meshPart, meshIndex) => {
            const positions = new Float32Array(ensureArray(meshPart.vertices).map((value) => pickNumber(value, 0)));
            const indices = new Uint32Array(ensureArray(meshPart.indices).map((value) => Math.max(0, Math.round(pickNumber(value, 0)))));
            const { min, max } = computeMinMax(ensureArray(meshPart.vertices));

            const positionAccessorIndex = pushViewAndAccessor({
                typedArray: positions,
                target: 34962,
                componentType: 5126,
                type: 'VEC3',
                min,
                max,
            });
            const indexAccessorIndex = pushViewAndAccessor({
                typedArray: indices,
                target: 34963,
                componentType: 5125,
                type: 'SCALAR',
                min: indices.length ? [0] : undefined,
                max: indices.length ? [Math.max(...indices)] : undefined,
            });

            const meshIndexInDocument = document.meshes.length;
            document.meshes.push({
                name: `${template.key || `template-${templateIndex + 1}`}-${meshPart.id || meshIndex + 1}`,
                primitives: [{
                    attributes: { POSITION: positionAccessorIndex },
                    indices: indexAccessorIndex,
                    mode: 4,
                    material: ensureMaterial(meshPart.color),
                }],
                extras: {
                    templateKey: template?.key || null,
                    geometryFamily: template?.geometryFamily || null,
                    appearanceKey: template?.appearanceKey || null,
                    resourceId: resource?.id || null,
                },
            });

            const nodeIndex = document.nodes.length;
            document.nodes.push({
                name: `${template.key || `template-${templateIndex + 1}`}-node-${meshIndex + 1}`,
                mesh: meshIndexInDocument,
                extensions: {
                    EXT_mesh_gpu_instancing: {
                        attributes: {
                            TRANSLATION: translationAccessorIndex,
                            ROTATION: rotationAccessorIndex,
                            SCALE: scaleAccessorIndex,
                        },
                    },
                },
            });
            document.scenes[0].nodes.push(nodeIndex);
        });
    });

    const binaryChunk = Buffer.concat(binaryParts);
    document.buffers[0].byteLength = binaryChunk.length;

    const jsonChunk = padBuffer(Buffer.from(JSON.stringify(document), 'utf8'), 0x20);
    const paddedBinaryChunk = padBuffer(binaryChunk, 0x00);
    const totalLength = 12 + 8 + jsonChunk.length + 8 + paddedBinaryChunk.length;
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546C67, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(totalLength, 8);

    const jsonHeader = Buffer.alloc(8);
    jsonHeader.writeUInt32LE(jsonChunk.length, 0);
    jsonHeader.writeUInt32LE(0x4E4F534A, 4);

    const binHeader = Buffer.alloc(8);
    binHeader.writeUInt32LE(paddedBinaryChunk.length, 0);
    binHeader.writeUInt32LE(0x004E4942, 4);

    return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, paddedBinaryChunk]);
}
