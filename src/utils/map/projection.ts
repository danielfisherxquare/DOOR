import gcoord from 'gcoord';

export type MapProjection = 'wgs84' | 'gcj02';
export type LatLngTuple = [number, number];
type Position = [number, number, ...number[]];

export interface CustomTileSourceLike {
  name?: string;
  url?: string;
  projection?: MapProjection;
  host?: string;
}

const GCJ02_SOURCE_PATTERNS = [
  /autonavi/i,
  /amap/i,
  /gaode/i,
  /ggmap/i,
  /mapquest/i,
];

const WGS84_SOURCE_PATTERNS = [
  /openstreetmap/i,
  /(?:^|[^a-z])osm(?:[^a-z]|$)/i,
  /cartocdn/i,
  /arcgisonline/i,
  /openmaptiles/i,
  /mapbox/i,
  /tianditu/i,
  /天地图/i,
  /cgcs2000/i,
];

function projectPosition(position: Position, from: MapProjection, to: MapProjection): Position {
  if (from === to) {
    return [...position];
  }
  const [lng, lat, ...rest] = position;
  const transformed = gcoord.transform(
    [lng, lat],
    from === 'wgs84' ? gcoord.WGS84 : gcoord.GCJ02,
    to === 'wgs84' ? gcoord.WGS84 : gcoord.GCJ02,
  ) as [number, number];
  return [transformed[0], transformed[1], ...rest];
}

function mapCoordinates(
  coordinates: GeoJSON.Position[] | GeoJSON.Position[][] | GeoJSON.Position[][][] | GeoJSON.Position[][][][],
  from: MapProjection,
  to: MapProjection,
): typeof coordinates {
  if (coordinates.length === 0) {
    return coordinates;
  }
  if (typeof coordinates[0] === 'number') {
    return projectPosition(coordinates as unknown as Position, from, to) as unknown as typeof coordinates;
  }
  return coordinates.map((item) =>
    mapCoordinates(
      item as GeoJSON.Position[] | GeoJSON.Position[][] | GeoJSON.Position[][][] | GeoJSON.Position[][][][],
      from,
      to,
    ),
  ) as typeof coordinates;
}

function transformGeometry<T extends GeoJSON.Geometry>(geometry: T, from: MapProjection, to: MapProjection): T {
  if (from === to) {
    return structuredClone(geometry);
  }
  if (geometry.type === 'GeometryCollection') {
    return {
      ...geometry,
      geometries: geometry.geometries.map((item) => transformGeometry(item, from, to)),
    };
  }
  return {
    ...geometry,
    coordinates: mapCoordinates(
      geometry.coordinates as GeoJSON.Position[] | GeoJSON.Position[][] | GeoJSON.Position[][][] | GeoJSON.Position[][][][],
      from,
      to,
    ),
  };
}

function transformGeoJSON(value: GeoJSON.GeoJsonObject, from: MapProjection, to: MapProjection): GeoJSON.GeoJsonObject {
  if (from === to) {
    return structuredClone(value);
  }
  if (value.type === 'FeatureCollection') {
    const collection = value as GeoJSON.FeatureCollection;
    return {
      ...collection,
      features: collection.features.map((feature) => transformGeoJSON(feature, from, to) as GeoJSON.Feature),
    } as GeoJSON.FeatureCollection;
  }
  if (value.type === 'Feature') {
    const feature = value as GeoJSON.Feature;
    return {
      ...feature,
      geometry: feature.geometry ? transformGeometry(feature.geometry, from, to) : feature.geometry,
    } as GeoJSON.Feature;
  }
  return transformGeometry(value as GeoJSON.Geometry, from, to);
}

export function detectProjectionFromSource(url?: string, name?: string, host?: string): MapProjection {
  const haystack = [url, name, host]
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .join(' ');

  if (GCJ02_SOURCE_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return 'gcj02';
  }
  if (WGS84_SOURCE_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return 'wgs84';
  }
  return 'wgs84';
}

export function normalizeCustomTileSource<T extends CustomTileSourceLike>(
  source: T,
): T & { projection: MapProjection } {
  const explicitProjection =
    source.projection === 'gcj02' || source.projection === 'wgs84' ? source.projection : undefined;

  return {
    ...source,
    projection: explicitProjection ?? detectProjectionFromSource(source.url, source.name, source.host),
  };
}

export function toDisplayLatLng(wgsLatLng: LatLngTuple, projection: MapProjection): LatLngTuple {
  if (projection === 'wgs84') {
    return [...wgsLatLng];
  }
  const [lng, lat] = projectPosition([wgsLatLng[1], wgsLatLng[0]], 'wgs84', 'gcj02');
  return [lat, lng];
}

export function fromDisplayLatLng(displayLatLng: LatLngTuple, projection: MapProjection): LatLngTuple {
  if (projection === 'wgs84') {
    return [...displayLatLng];
  }
  const [lng, lat] = projectPosition([displayLatLng[1], displayLatLng[0]], 'gcj02', 'wgs84');
  return [lat, lng];
}

export function toDisplayGeoJSON<T extends GeoJSON.GeoJsonObject>(
  featureOrCollection: T,
  projection: MapProjection,
): T {
  return transformGeoJSON(featureOrCollection, 'wgs84', projection) as T;
}

export function fromDisplayGeoJSON<T extends GeoJSON.GeoJsonObject>(
  featureOrCollection: T,
  projection: MapProjection,
): T {
  return transformGeoJSON(featureOrCollection, projection, 'wgs84') as T;
}