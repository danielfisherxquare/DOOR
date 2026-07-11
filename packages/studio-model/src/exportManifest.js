export const EXPORT_COORDINATE_SYSTEMS = Object.freeze({
  WGS84: Object.freeze({
    type: 'wgs84',
    xAxis: 'longitude',
    yAxis: 'latitude',
    zAxis: 'height',
  }),
  ARCSPRO_LOCAL_Y_UP: Object.freeze({
    type: 'door-local-y-up',
    xAxis: 'east meters from origin',
    yAxis: 'up meters',
    zAxis: 'north meters from origin',
  }),
  SLICER_Z_UP: Object.freeze({
    type: 'slicer-z-up',
    xAxis: 'east',
    yAxis: 'north',
    zAxis: 'up',
  }),
});

function hashExportName(value) {
  let hash = 2166136261;
  Array.from(String(value || '')).forEach((character) => {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  });
  return (hash >>> 0).toString(36).slice(0, 6);
}

export function toAsciiSafeExportBaseName(value, fallback = 'door-export') {
  const originalBaseName = String(value || fallback).trim() || fallback;
  const asciiName = originalBaseName
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  const suffix = /[^\x20-\x7E]/.test(originalBaseName) ? '-' + hashExportName(originalBaseName) : '';
  return asciiName ? asciiName + suffix : fallback + '-' + hashExportName(originalBaseName);
}

export function buildExportFilenamePolicy(value, options = {}) {
  const fallback = options.fallback || 'door-export';
  const originalBaseName = String(value || fallback).trim() || fallback;
  const baseName = toAsciiSafeExportBaseName(originalBaseName, fallback);
  return {
    originalBaseName,
    baseName,
    filenamePolicy: 'ascii-safe',
    asciiOnly: /^[\x20-\x7E]+$/.test(baseName),
    changed: baseName !== originalBaseName,
  };
}

export function resolveExportCoordinateSystem(coordinateSystem) {
  if (!coordinateSystem) return EXPORT_COORDINATE_SYSTEMS.ARCSPRO_LOCAL_Y_UP;
  if (typeof coordinateSystem === 'string') {
    return EXPORT_COORDINATE_SYSTEMS[coordinateSystem] || EXPORT_COORDINATE_SYSTEMS.ARCSPRO_LOCAL_Y_UP;
  }
  return {
    type: coordinateSystem.type || 'custom',
    xAxis: coordinateSystem.xAxis || 'x',
    yAxis: coordinateSystem.yAxis || 'y',
    zAxis: coordinateSystem.zAxis || 'z',
  };
}

export function buildExportManifest({
  kind,
  name,
  source,
  coordinateSystem,
  input,
  stats,
  diagnostics,
  resources,
  readiness,
  generatedAt,
  filenameFallback,
} = {}) {
  return {
    kind: kind || 'door-export',
    generatedAt: generatedAt || new Date().toISOString(),
    source: source || null,
    export: {
      ...buildExportFilenamePolicy(name || kind, {
        fallback: filenameFallback || kind || 'door-export',
      }),
      coordinateSystem: resolveExportCoordinateSystem(coordinateSystem),
    },
    input: input || null,
    stats: stats || {},
    diagnostics: diagnostics || {},
    resources: Array.isArray(resources) ? resources : [],
    readiness: readiness || null,
  };
}

export function buildTerrainPatchDiagnostics(terrainPatch) {
  const rows = Math.max(Math.floor(Number(terrainPatch?.rows) || 0), 0);
  const cols = Math.max(Math.floor(Number(terrainPatch?.cols) || 0), 0);
  const expectedHeightCount = rows * cols;
  const heights = Array.isArray(terrainPatch?.heightsRelative)
    ? terrainPatch.heightsRelative
    : (Array.isArray(terrainPatch?.heights) ? terrainPatch.heights : []);
  const finiteHeightCount = heights.filter((value) => Number.isFinite(Number(value))).length;
  const cellMask = Array.isArray(terrainPatch?.cellMask) ? terrainPatch.cellMask : [];
  const validCellCount = cellMask.length
    ? cellMask.filter(Boolean).length
    : Math.max((rows - 1) * (cols - 1), 0);
  const warnings = [];

  if (rows < 2 || cols < 2) warnings.push('terrain-grid-too-small');
  if (heights.length < expectedHeightCount) warnings.push('terrain-height-grid-incomplete');
  if (finiteHeightCount < heights.length) warnings.push('terrain-height-grid-has-non-finite-values');
  if (cellMask.length && !validCellCount) warnings.push('terrain-cell-mask-empty');

  return {
    source: terrainPatch?.source || null,
    rows,
    cols,
    expectedHeightCount,
    heightCount: heights.length,
    finiteHeightCount,
    missingHeightCount: Math.max(expectedHeightCount - heights.length, 0),
    cellCount: Math.max((rows - 1) * (cols - 1), 0),
    validCellCount,
    maskedCellCount: cellMask.length ? Math.max(cellMask.length - validCellCount, 0) : 0,
    resolutionMeters: Number.isFinite(Number(terrainPatch?.resolutionMeters))
      ? Number(terrainPatch.resolutionMeters)
      : null,
    boundsMeters: terrainPatch?.boundsMeters || null,
    complete: rows >= 2 && cols >= 2 && heights.length >= expectedHeightCount && finiteHeightCount === heights.length,
    warnings,
  };
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function finiteNumber(value) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : null;
}

function emptyBounds() {
  return {
    minX: null,
    maxX: null,
    minY: null,
    maxY: null,
    minZ: null,
    maxZ: null,
    width: 0,
    height: 0,
    depth: 0,
  };
}

function updateBounds(bounds, x, y, z) {
  if (bounds.minX === null || x < bounds.minX) bounds.minX = x;
  if (bounds.maxX === null || x > bounds.maxX) bounds.maxX = x;
  if (bounds.minY === null || y < bounds.minY) bounds.minY = y;
  if (bounds.maxY === null || y > bounds.maxY) bounds.maxY = y;
  if (bounds.minZ === null || z < bounds.minZ) bounds.minZ = z;
  if (bounds.maxZ === null || z > bounds.maxZ) bounds.maxZ = z;
}

function finalizeBounds(bounds) {
  if (bounds.minX === null) return emptyBounds();
  return {
    ...bounds,
    width: Number((bounds.maxX - bounds.minX).toFixed(6)),
    height: Number((bounds.maxY - bounds.minY).toFixed(6)),
    depth: Number((bounds.maxZ - bounds.minZ).toFixed(6)),
  };
}

function buildMeshGeometryPreflight(mesh, options = {}) {
  const vertices = ensureArray(mesh?.vertices);
  const indices = ensureArray(mesh?.indices);
  const vertexCount = Math.floor(vertices.length / 3);
  const triangleCount = Math.floor(indices.length / 3);
  const warnings = [];
  const bounds = emptyBounds();
  let invalidVertexValueCount = 0;
  let invalidIndexCount = 0;

  if (vertexCount === 0 || triangleCount === 0) warnings.push('mesh-empty');
  if (vertices.length % 3 !== 0) warnings.push('mesh-vertex-tuple-incomplete');
  if (indices.length % 3 !== 0) warnings.push('mesh-index-tuple-incomplete');

  for (let index = 0; index < vertexCount; index += 1) {
    const offset = index * 3;
    const x = finiteNumber(vertices[offset]);
    const y = finiteNumber(vertices[offset + 1]);
    const z = finiteNumber(vertices[offset + 2]);
    if (x === null || y === null || z === null) {
      invalidVertexValueCount += 1;
      continue;
    }
    updateBounds(bounds, x, y, z);
  }

  indices.forEach((value) => {
    const index = finiteNumber(value);
    if (index === null || !Number.isInteger(index) || index < 0 || index >= vertexCount) {
      invalidIndexCount += 1;
    }
  });

  if (invalidVertexValueCount) warnings.push('mesh-non-finite-vertex');
  if (invalidIndexCount) warnings.push('mesh-index-out-of-range');

  const finalizedBounds = finalizeBounds(bounds);
  const maxMajorSpanMeters = Number(options.maxMajorSpanMeters);
  const majorSpanMeters = Math.max(finalizedBounds.width, finalizedBounds.height, finalizedBounds.depth);
  if (Number.isFinite(maxMajorSpanMeters) && majorSpanMeters > maxMajorSpanMeters) {
    warnings.push('mesh-bounds-too-large');
  }

  return {
    id: mesh?.id || null,
    vertexCount,
    triangleCount,
    invalidVertexValueCount,
    invalidIndexCount,
    bounds: finalizedBounds,
    majorSpanMeters,
    status: invalidVertexValueCount || invalidIndexCount || !vertexCount || !triangleCount ? 'error' : (warnings.length ? 'warning' : 'ok'),
    warnings,
  };
}

function mergeBounds(left, right) {
  if (!right || right.minX === null) return left;
  if (!left || left.minX === null) return { ...right };
  updateBounds(left, right.minX, right.minY, right.minZ);
  updateBounds(left, right.maxX, right.maxY, right.maxZ);
  return left;
}

export function buildGeometryPreflight(meshes, options = {}) {
  const meshChecks = ensureArray(meshes).map((mesh) => buildMeshGeometryPreflight(mesh, options));
  const invalidMeshCount = meshChecks.filter((mesh) => mesh.status === 'error').length;
  const warningMeshCount = meshChecks.filter((mesh) => mesh.status === 'warning').length;
  const warningCodes = [...new Set(meshChecks.flatMap((mesh) => mesh.warnings))];
  const combinedBounds = finalizeBounds(meshChecks.reduce((bounds, mesh) => mergeBounds(bounds, mesh.bounds), emptyBounds()));

  return {
    status: invalidMeshCount ? 'error' : (warningMeshCount ? 'warning' : 'ok'),
    meshCount: meshChecks.length,
    invalidMeshCount,
    warningMeshCount,
    totalVertices: meshChecks.reduce((sum, mesh) => sum + mesh.vertexCount, 0),
    totalTriangles: meshChecks.reduce((sum, mesh) => sum + mesh.triangleCount, 0),
    bounds: combinedBounds,
    warningCodes,
    meshes: meshChecks,
  };
}
