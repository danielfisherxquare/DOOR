import type { MapTreeNode } from '../../stores/mapStore';

export const SPATIAL_OBJECT_PRESETS = [
  { objectType: 'generic', label: '通用对象', placementMode: 'follow-terrain', featureType: 'polygon' },
  { objectType: 'tent', label: '帐篷', placementMode: 'level-platform', featureType: 'polygon' },
  { objectType: 'stage', label: '舞台', placementMode: 'level-platform', featureType: 'polygon' },
  { objectType: 'arch', label: '赛事拱门', placementMode: 'level-platform', featureType: 'polygon' },
  { objectType: 'light_tower', label: '灯光塔', placementMode: 'vertical-keep', featureType: 'marker' },
  { objectType: 'supply_station', label: '补给站', placementMode: 'level-platform', featureType: 'polygon' },
  { objectType: 'medical_station', label: '医疗站', placementMode: 'level-platform', featureType: 'polygon' },
  { objectType: 'fence_segment', label: '围栏段', placementMode: 'follow-terrain', featureType: 'polyline' },
  { objectType: 'route_sign', label: '路标', placementMode: 'vertical-keep', featureType: 'marker' },
] as const;

export type SpatialObjectPreset = typeof SPATIAL_OBJECT_PRESETS[number];

export interface SpatialObjectDto {
  id: string | number;
  projectId?: string | null;
  objectType?: string | null;
  templateId?: string | null;
  variantId?: string | null;
  title?: string | null;
  placementMode?: MapTreeNode['placementMode'];
  brandingPackId?: string | null;
  focusZoneId?: string | null;
  metadata?: {
    geometry?: GeoJSON.Geometry | null;
    featureType?: MapTreeNode['featureType'];
    mapNodeId?: string | null;
    radius?: number | null;
    templateName?: string | null;
    assetTemplateSource?: string | null;
    assetTemplateKind?: string | null;
  } | null;
  materialVariant?: {
    color?: string | null;
    strokeColor?: string | null;
    fasciaStyle?: string | null;
    sponsorName?: string | null;
    accentColor?: string | null;
  } | null;
  renderProfile?: {
    fillOpacity?: number | null;
    strokeWeight?: number | null;
  } | null;
}

export function getSpatialObjectPreset(objectType?: string | null): SpatialObjectPreset {
  return SPATIAL_OBJECT_PRESETS.find((item) => item.objectType === objectType) || SPATIAL_OBJECT_PRESETS[0];
}

export function getSpatialObjectLabel(objectType?: string | null): string {
  return getSpatialObjectPreset(objectType).label;
}

function toMapFeatureType(geometry?: GeoJSON.Geometry | null): MapTreeNode['featureType'] {
  switch (geometry?.type) {
    case 'LineString':
      return 'polyline';
    case 'Point':
      return 'marker';
    case 'Polygon':
      return 'polygon';
    default:
      return 'polygon';
  }
}

function cloneFeatureGeometry(geometry?: GeoJSON.Geometry | null): GeoJSON.Geometry | undefined {
  if (!geometry) return undefined;
  return JSON.parse(JSON.stringify(geometry));
}

function computeAnchorFromGeometry(geometry?: GeoJSON.Geometry | null) {
  if (!geometry) return { latitude: 30.57, longitude: 104.07, height: 0 };

  if (geometry.type === 'Point') {
    const [longitude, latitude] = geometry.coordinates;
    return { latitude, longitude, height: 0 };
  }

  if (geometry.type === 'LineString') {
    const coords = geometry.coordinates || [];
    if (!coords.length) return { latitude: 30.57, longitude: 104.07, height: 0 };
    const sums = coords.reduce((acc, [longitude, latitude]) => {
      acc.longitude += longitude;
      acc.latitude += latitude;
      return acc;
    }, { longitude: 0, latitude: 0 });
    return {
      latitude: sums.latitude / coords.length,
      longitude: sums.longitude / coords.length,
      height: 0,
    };
  }

  if (geometry.type === 'Polygon') {
    const ring = geometry.coordinates?.[0] || [];
    const points = ring.length > 1 && ring[0]?.[0] === ring[ring.length - 1]?.[0] && ring[0]?.[1] === ring[ring.length - 1]?.[1]
      ? ring.slice(0, -1)
      : ring;
    if (!points.length) return { latitude: 30.57, longitude: 104.07, height: 0 };
    const sums = points.reduce((acc, [longitude, latitude]) => {
      acc.longitude += longitude;
      acc.latitude += latitude;
      return acc;
    }, { longitude: 0, latitude: 0 });
    return {
      latitude: sums.latitude / points.length,
      longitude: sums.longitude / points.length,
      height: 0,
    };
  }

  return { latitude: 30.57, longitude: 104.07, height: 0 };
}

export function mapNodeToSpatialObjectPayload(node: MapTreeNode) {
  return {
    objectType: node.objectType || 'generic',
    templateId: node.templateId || null,
    variantId: node.variantId || null,
    title: node.name || getSpatialObjectLabel(node.objectType),
    placementMode: node.placementMode || getSpatialObjectPreset(node.objectType).placementMode,
    anchorWgs84: computeAnchorFromGeometry(node.geometry),
    footprint: node.geometry?.type === 'Polygon' ? cloneFeatureGeometry(node.geometry) : null,
    lodProfile: {
      mode: node.objectType === 'tent' ? 'focus' : 'corridor',
      featureType: node.featureType || toMapFeatureType(node.geometry),
    },
    materialVariant: {
      color: node.fillColor || node.color || '#3388ff',
      accentColor: node.accentColor || node.strokeColor || node.fillColor || node.color || '#ffffff',
      strokeColor: node.strokeColor || '#3388ff',
      fasciaStyle: node.fasciaStyle || 'classic',
      sponsorName: node.sponsorName || null,
    },
    brandingPackId: node.brandingPackId || null,
    renderProfile: {
      fillOpacity: node.fillOpacity ?? 0.3,
      strokeWeight: node.strokeWeight ?? 3,
    },
    metadata: {
      geometry: cloneFeatureGeometry(node.geometry),
      radius: node.radius ?? null,
      featureType: node.featureType || toMapFeatureType(node.geometry),
      mapNodeId: node.id,
      templateName: node.templateName || null,
      assetTemplateSource: node.assetTemplateSource || null,
      assetTemplateKind: node.assetTemplateKind || null,
      source: 'map',
    },
    status: 'active',
    focusZoneId: node.focusZoneId || null,
  };
}

export function spatialObjectToMapNode(object: SpatialObjectDto): MapTreeNode {
  const geometry = object?.metadata?.geometry || null;
  const preset = getSpatialObjectPreset(object?.objectType);
  const featureType = object?.metadata?.featureType || toMapFeatureType(geometry);
  const fillColor = object?.materialVariant?.color || '#3388ff';
  const strokeColor = object?.materialVariant?.strokeColor || fillColor;

  return {
    id: object?.metadata?.mapNodeId || `spatial:${String(object.id)}`,
    name: object?.title || getSpatialObjectLabel(object?.objectType),
    type: 'feature',
    icon: preset.objectType === 'tent' ? '⛺' : preset.objectType === 'stage' ? '🎪' : preset.objectType === 'light_tower' ? '💡' : 'place',
    visible: true,
    source: 'spatial-object',
    featureType,
    geometry,
    radius: object?.metadata?.radius ?? undefined,
    color: fillColor,
    fillColor,
    fillOpacity: object?.renderProfile?.fillOpacity ?? 0.3,
    strokeColor,
    strokeWeight: object?.renderProfile?.strokeWeight ?? 3,
    strokeOpacity: 0.9,
    objectType: object?.objectType || 'generic',
    templateId: object?.templateId || null,
    templateName: object?.metadata?.templateName || null,
    variantId: object?.variantId || null,
    assetTemplateSource: object?.metadata?.assetTemplateSource || null,
    assetTemplateKind: object?.metadata?.assetTemplateKind || null,
    placementMode: object?.placementMode || preset.placementMode,
    brandingPackId: object?.brandingPackId || null,
    fasciaStyle: object?.materialVariant?.fasciaStyle || 'classic',
    sponsorName: object?.materialVariant?.sponsorName || null,
    accentColor: object?.materialVariant?.accentColor || strokeColor,
    focusZoneId: object?.focusZoneId || null,
    backendObjectId: object?.id == null ? null : String(object.id),
    syncStatus: 'synced',
    sourceProjectId: object?.projectId || null,
  };
}

export function spatialObjectToGeoJSONFeature(object: SpatialObjectDto, nodeId?: string): GeoJSON.Feature | null {
  const geometry = object?.metadata?.geometry;
  if (!geometry) return null;

  const nextNode = spatialObjectToMapNode(object);
  const id = nodeId || nextNode.id;

  return {
    type: 'Feature',
    id,
    geometry,
    properties: {
      id,
      name: nextNode.name,
      featureType: nextNode.featureType,
      color: nextNode.color,
      strokeColor: nextNode.strokeColor,
      strokeWeight: nextNode.strokeWeight,
      strokeOpacity: nextNode.strokeOpacity,
      fillColor: nextNode.fillColor,
      fillOpacity: nextNode.fillOpacity,
      radius: nextNode.radius,
      objectType: nextNode.objectType,
      templateId: nextNode.templateId,
      templateName: nextNode.templateName,
      variantId: nextNode.variantId,
      placementMode: nextNode.placementMode,
      brandingPackId: nextNode.brandingPackId,
      fasciaStyle: nextNode.fasciaStyle,
      sponsorName: nextNode.sponsorName,
      accentColor: nextNode.accentColor,
      focusZoneId: nextNode.focusZoneId,
      backendObjectId: nextNode.backendObjectId,
      backendWorkZoneId: nextNode.backendWorkZoneId,
      zoneType: nextNode.zoneType,
      terrainResolution: nextNode.terrainResolution,
      includedObjectIds: nextNode.includedObjectIds,
      syncStatus: nextNode.syncStatus,
      sourceProjectId: nextNode.sourceProjectId,
      source: 'spatial-object',
    },
  };
}
