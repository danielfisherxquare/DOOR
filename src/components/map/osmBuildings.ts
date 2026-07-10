import * as Cesium from 'cesium';
import type { HiddenOsmBuilding } from '../../stores/mapStore';

type ViewportBBox = { south: number; west: number; north: number; east: number };

type OverpassElement = {
  type: string;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
  members?: Array<{
    type: string;
    role: string;
    geometry?: Array<{ lat: number; lon: number }>;
  }>;
};

type GeoJsonFeature = {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown };
};

type PickedOsmFeatureLike = {
  primitive?: unknown;
  tileset?: unknown;
  content?: {
    tileset?: unknown;
    tile?: { tileset?: unknown };
  };
  getProperty?: (name: string) => unknown;
  getPropertyInherited?: (name: string) => unknown;
};

export function getViewportBBox(viewer: Cesium.Viewer): ViewportBBox | null {
  const canvas = viewer.scene.canvas;
  const camera = viewer.camera;
  const ellipsoid = viewer.scene.globe.ellipsoid;
  const corners = [
    new Cesium.Cartesian2(0, 0),
    new Cesium.Cartesian2(canvas.width, 0),
    new Cesium.Cartesian2(canvas.width, canvas.height),
    new Cesium.Cartesian2(0, canvas.height),
    new Cesium.Cartesian2(canvas.width / 2, canvas.height / 2),
  ];

  let lonMin = 180;
  let lonMax = -180;
  let latMin = 90;
  let latMax = -90;
  let validCount = 0;

  for (const corner of corners) {
    const ray = camera.getPickRay(corner);
    if (!ray) continue;
    const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
    if (!cartesian) continue;
    const carto = ellipsoid.cartesianToCartographic(cartesian);
    const lon = Cesium.Math.toDegrees(carto.longitude);
    const lat = Cesium.Math.toDegrees(carto.latitude);
    lonMin = Math.min(lonMin, lon);
    lonMax = Math.max(lonMax, lon);
    latMin = Math.min(latMin, lat);
    latMax = Math.max(latMax, lat);
    validCount += 1;
  }

  if (validCount < 2) return null;
  const lonSpan = lonMax - lonMin;
  const latSpan = latMax - latMin;
  if (lonSpan > 0.05 || latSpan > 0.05) {
    const centerLon = (lonMin + lonMax) / 2;
    const centerLat = (latMin + latMax) / 2;
    const halfSpan = 0.02;
    return {
      south: centerLat - halfSpan,
      west: centerLon - halfSpan,
      north: centerLat + halfSpan,
      east: centerLon + halfSpan,
    };
  }
  return { south: latMin, west: lonMin, north: latMax, east: lonMax };
}

export function buildOverpassQuery(bbox: ViewportBBox): string {
  return `[out:json][timeout:15][bbox:${bbox.south},${bbox.west},${bbox.north},${bbox.east}];(way["building"];relation["building"];);out geom;`;
}

export function getOverpassEndpointLabel(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function overpassToGeoJson(data: { elements: OverpassElement[] }): {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
} {
  const features: GeoJsonFeature[] = [];

  for (const element of data.elements) {
    if (element.type === 'way' && element.geometry) {
      const coordinates = element.geometry.map((point) => [point.lon, point.lat]);
      if (coordinates.length >= 3) {
        const first = coordinates[0];
        const last = coordinates[coordinates.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) coordinates.push([...first]);
        features.push({
          type: 'Feature',
          properties: element.tags || {},
          geometry: { type: 'Polygon', coordinates: [coordinates] },
        });
      }
    } else if (element.type === 'relation' && element.members) {
      const outers: number[][][] = [];
      const inners: number[][][] = [];
      for (const member of element.members) {
        if (!member.geometry) continue;
        const ring = member.geometry.map((point) => [point.lon, point.lat]);
        if (ring.length < 3) continue;
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
        if (member.role === 'outer') outers.push(ring);
        else if (member.role === 'inner') inners.push(ring);
      }
      for (const outer of outers) {
        features.push({
          type: 'Feature',
          properties: element.tags || {},
          geometry: { type: 'Polygon', coordinates: [outer, ...inners] },
        });
      }
    }
  }

  return { type: 'FeatureCollection', features };
}

function getOsmBuildingKey(elementType: string, elementId: number): string {
  return `${elementType}:${elementId}`;
}

export function getOsmBuildingLabel(building: Pick<HiddenOsmBuilding, 'name' | 'elementId'>): string {
  const name = building.name?.trim();
  return name || `OSM 建筑 #${building.elementId}`;
}

export function createOsmBuildingsStyle(hiddenOsmBuildings: HiddenOsmBuilding[]): Cesium.Cesium3DTileStyle {
  if (hiddenOsmBuildings.length === 0) return new Cesium.Cesium3DTileStyle({ show: true });

  const conditions = hiddenOsmBuildings.map((building) => [
    `\${elementType} === ${JSON.stringify(building.elementType)} && \${elementId} === ${building.elementId}`,
    'false',
  ]);
  conditions.push(['true', 'true']);

  return new Cesium.Cesium3DTileStyle({ show: { conditions } });
}

export function applyOsmBuildingsStyle(
  viewer: Cesium.Viewer,
  tileset: Cesium.Cesium3DTileset,
  hiddenOsmBuildings: HiddenOsmBuilding[],
): void {
  tileset.style = createOsmBuildingsStyle(hiddenOsmBuildings);
  viewer.scene.requestRender();
}

export function getPickedObjects(viewer: Cesium.Viewer, pixel: Cesium.Cartesian2): unknown[] {
  try {
    const drilled = viewer.scene.drillPick(pixel, 12);
    if (Array.isArray(drilled) && drilled.length > 0) return drilled;
  } catch {
    // Fall through to single-pick mode.
  }

  const picked = viewer.scene.pick(pixel);
  return Cesium.defined(picked) ? [picked] : [];
}

function readPickedFeatureProperty(feature: PickedOsmFeatureLike, name: string): unknown {
  const directValue = typeof feature.getProperty === 'function' ? feature.getProperty(name) : undefined;
  if (directValue !== undefined) return directValue;
  return typeof feature.getPropertyInherited === 'function' ? feature.getPropertyInherited(name) : undefined;
}

function isSameOsmTileset(
  feature: PickedOsmFeatureLike,
  osmTileset: Cesium.Cesium3DTileset | null,
): boolean {
  if (!osmTileset) return false;
  return (
    feature.primitive === osmTileset ||
    feature.tileset === osmTileset ||
    feature.content?.tileset === osmTileset ||
    feature.content?.tile?.tileset === osmTileset
  );
}

export function extractPickedOsmBuilding(
  pickedObject: unknown,
  osmTileset: Cesium.Cesium3DTileset | null,
): HiddenOsmBuilding | null {
  if (!pickedObject || !osmTileset || typeof pickedObject !== 'object') return null;

  const feature = pickedObject as PickedOsmFeatureLike;
  if (typeof feature.getProperty !== 'function' && typeof feature.getPropertyInherited !== 'function') return null;

  const rawElementType = readPickedFeatureProperty(feature, 'elementType');
  const rawElementId = readPickedFeatureProperty(feature, 'elementId');
  const elementType = typeof rawElementType === 'string' ? rawElementType.trim() : '';
  const elementId = typeof rawElementId === 'number' ? rawElementId : Number(rawElementId);

  if (!elementType || !Number.isFinite(elementId)) return null;
  if (!isSameOsmTileset(feature, osmTileset) && elementType !== 'way' && elementType !== 'relation') return null;

  const rawName = readPickedFeatureProperty(feature, 'name');
  const rawBuildingType = readPickedFeatureProperty(feature, 'building');

  return {
    key: getOsmBuildingKey(elementType, elementId),
    elementType,
    elementId,
    name: typeof rawName === 'string' ? rawName : null,
    buildingType: typeof rawBuildingType === 'string' ? rawBuildingType : null,
  };
}
