import type { MapTreeNode } from '../../stores/mapStore';

export const TERRAIN_WORK_ZONE_PRESETS = [
  { zoneType: 'focus-zone', label: '重点区工作区', color: '#f59e0b', fillOpacity: 0.18, strokeWeight: 3, dashArray: '8 6' },
  { zoneType: 'terrain-clip', label: '地形裁剪区', color: '#14b8a6', fillOpacity: 0.14, strokeWeight: 2, dashArray: '10 6' },
  { zoneType: 'corridor-zone', label: '赛道走廊区', color: '#8b5cf6', fillOpacity: 0.12, strokeWeight: 2, dashArray: '12 8' },
] as const;

export type TerrainWorkZonePreset = typeof TERRAIN_WORK_ZONE_PRESETS[number];

export function getTerrainWorkZonePreset(zoneType?: string | null): TerrainWorkZonePreset {
  return TERRAIN_WORK_ZONE_PRESETS.find((item) => item.zoneType === zoneType) || TERRAIN_WORK_ZONE_PRESETS[0];
}

export function getTerrainWorkZoneLabel(zoneType?: string | null): string {
  return getTerrainWorkZonePreset(zoneType).label;
}

function cloneGeometry<T>(geometry?: T): T | undefined {
  if (!geometry) return undefined;
  return JSON.parse(JSON.stringify(geometry));
}

function normalizePolygonGeometry(geometry: any): GeoJSON.Polygon | undefined {
  const nextGeometry = cloneGeometry(geometry) as GeoJSON.Polygon | undefined;
  if (!nextGeometry || nextGeometry.type !== 'Polygon' || !Array.isArray(nextGeometry.coordinates)) {
    return nextGeometry;
  }

  const firstEntry = nextGeometry.coordinates[0] as any;
  if (Array.isArray(firstEntry) && typeof firstEntry[0] === 'number' && typeof firstEntry[1] === 'number') {
    nextGeometry.coordinates = [nextGeometry.coordinates as unknown as GeoJSON.Position[]];
  }

  return nextGeometry;
}

export function isSiteModeBoundTerrainWorkZone(value: any): boolean {
  return value?.siteModeBound === true
    || value?.metadata?.purpose === 'site-mode'
    || Boolean(value?.snapshotJson?.siteBake);
}

export function isInternalMapSelectionExportZone(value: any): boolean {
  return value?.metadata?.internal === true
    || value?.metadata?.purpose === 'map-selection-export'
    || value?.metadata?.source === 'map-selection-export';
}

export function terrainWorkZoneToMapNode(zone: any): MapTreeNode {
  const preset = getTerrainWorkZonePreset(zone?.zoneType);
  const manifestSummary = zone?.publishTarget?.manifestSummary || null;
  const exportPackageSummary = zone?.publishTarget?.exportPackageSummary || null;

  return {
    id: zone?.metadata?.mapNodeId || `terrain-zone:${zone.id}`,
    name: zone?.name || getTerrainWorkZoneLabel(zone?.zoneType),
    type: 'feature',
    icon: 'terrain',
    visible: true,
    source: 'terrain-work-zone',
    featureType: 'polygon',
    geometry: normalizePolygonGeometry(zone?.clipPolygonWgs84),
    color: preset.color,
    fillColor: preset.color,
    fillOpacity: preset.fillOpacity,
    strokeColor: preset.color,
    strokeWeight: preset.strokeWeight,
    strokeOpacity: 0.95,
    focusZoneId: zone?.id || null,
    backendWorkZoneId: zone?.id || null,
    siteModeBound: isSiteModeBoundTerrainWorkZone(zone),
    zoneType: zone?.zoneType || 'focus-zone',
    terrainResolution: zone?.terrainResolution ?? 2,
    terrainPatchGeneratedAt: zone?.metadata?.terrainPatchGeneratedAt || zone?.snapshotJson?.terrainPatch?.sampledAt || null,
    terrainHeightDeltaMeters: zone?.metadata?.terrainHeightDeltaMeters ?? zone?.snapshotJson?.terrainPatch?.heightDeltaMeters ?? null,
    includedObjectIds: Array.isArray(zone?.includedObjectIds) ? zone.includedObjectIds : [],
    publishManifestGeneratedAt: zone?.publishTarget?.lastManifestGeneratedAt || zone?.metadata?.publishManifestGeneratedAt || null,
    publishManifestObjectCount: manifestSummary?.totalObjects ?? null,
    publishManifestBatchCount: manifestSummary?.batchCount ?? null,
    publishManifestLodSummary: manifestSummary?.byLodLevel || null,
    publishManifestInstancingEligibleCount: manifestSummary?.optimization?.instancingEligibleCount ?? null,
    publishManifestGeometryFamilyCount: manifestSummary?.optimization?.geometryFamilyCount ?? null,
    exportPackageGeneratedAt: zone?.publishTarget?.exportPackageGeneratedAt || zone?.metadata?.exportPackageGeneratedAt || null,
    exportPackageResourceCount: exportPackageSummary?.totalResources ?? null,
    exportPackageLodResources: exportPackageSummary?.byLod || null,
    exportPackageInstancingReadyResources: exportPackageSummary?.optimization?.instancingReadyResources ?? null,
    exportPackageInstancingReadyObjects: exportPackageSummary?.optimization?.instancingReadyObjects ?? null,
    exportTaskId: zone?.publishTarget?.exportTaskId || zone?.metadata?.exportTaskId || null,
    exportTaskStatus: zone?.publishTarget?.exportTaskStatus || zone?.metadata?.exportTaskStatus || null,
    exportOutputRoot: zone?.publishTarget?.exportOutputRoot || zone?.metadata?.exportOutputRoot || null,
    geometrySource: zone?.publishTarget?.geometrySource || zone?.metadata?.geometrySource || null,
    syncStatus: 'synced',
    sourceProjectId: zone?.projectId || null,
  };
}

export function terrainWorkZoneToGeoJSONFeature(zone: any, nodeId?: string): GeoJSON.Feature | null {
  if (!zone?.clipPolygonWgs84) return null;
  const nextNode = terrainWorkZoneToMapNode(zone);
  const id = nodeId || nextNode.id;
  const preset = getTerrainWorkZonePreset(zone?.zoneType);

  return {
    type: 'Feature',
    id,
    geometry: normalizePolygonGeometry(zone.clipPolygonWgs84) as GeoJSON.Geometry,
    properties: {
      id,
      name: nextNode.name,
      featureType: nextNode.featureType,
      color: preset.color,
      strokeColor: preset.color,
      strokeWeight: nextNode.strokeWeight,
      strokeOpacity: nextNode.strokeOpacity,
      fillColor: preset.color,
      fillOpacity: nextNode.fillOpacity,
      focusZoneId: nextNode.focusZoneId,
      backendWorkZoneId: nextNode.backendWorkZoneId,
      siteModeBound: nextNode.siteModeBound,
      zoneType: nextNode.zoneType,
      terrainResolution: nextNode.terrainResolution,
      terrainPatchGeneratedAt: nextNode.terrainPatchGeneratedAt,
      terrainHeightDeltaMeters: nextNode.terrainHeightDeltaMeters,
      includedObjectIds: nextNode.includedObjectIds,
      publishManifestGeneratedAt: nextNode.publishManifestGeneratedAt,
      publishManifestObjectCount: nextNode.publishManifestObjectCount,
      publishManifestBatchCount: nextNode.publishManifestBatchCount,
      publishManifestLodSummary: nextNode.publishManifestLodSummary,
      publishManifestInstancingEligibleCount: nextNode.publishManifestInstancingEligibleCount,
      publishManifestGeometryFamilyCount: nextNode.publishManifestGeometryFamilyCount,
      exportPackageGeneratedAt: nextNode.exportPackageGeneratedAt,
      exportPackageResourceCount: nextNode.exportPackageResourceCount,
      exportPackageLodResources: nextNode.exportPackageLodResources,
      exportPackageInstancingReadyResources: nextNode.exportPackageInstancingReadyResources,
      exportPackageInstancingReadyObjects: nextNode.exportPackageInstancingReadyObjects,
      exportTaskId: nextNode.exportTaskId,
      exportTaskStatus: nextNode.exportTaskStatus,
      exportOutputRoot: nextNode.exportOutputRoot,
      geometrySource: nextNode.geometrySource,
      syncStatus: nextNode.syncStatus,
      sourceProjectId: nextNode.sourceProjectId,
      source: 'terrain-work-zone',
      dashArray: preset.dashArray,
    },
  };
}
