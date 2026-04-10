export type MapViewMode = '2D' | '3D' | '3DGlobe';

export interface MapBrowseState {
  centerWgs84: [number, number];
  zoom: number;
  headingDeg: number;
  pitchDeg: number;
  targetElevation?: number;
  cameraRangeMeters?: number;
}

export interface MapBrowseSyncMeta {
  token: number;
  source?: '2d' | 'amap3d' | 'cesium3d' | 'ui' | 'system';
  reason?: string;
}

export type MapBrowseSyncSource = NonNullable<MapBrowseSyncMeta['source']>;

const EARTH_CIRCUMFERENCE_METERS = 40_075_016.68557849;
const WEB_MERCATOR_TILE_SIZE = 256;
const MIN_ZOOM_2D = 1;
const MAX_ZOOM_2D = 22;
const MIN_ZOOM_3D = 2;
const MAX_ZOOM_3D = 20;
const MIN_PITCH_DEG = 0;
const MAX_PITCH_DEG = 80;
const MAX_MERCATOR_LATITUDE = 85.05112878;
const CENTER_EPSILON_DEG = 0.00001;
const ZOOM_EPSILON = 0.01;
const ANGLE_EPSILON_DEG = 0.01;
const ELEVATION_EPSILON_METERS = 0.5;
const RANGE_EPSILON_METERS = 0.5;

function clampLatitude(latitudeDeg: number): number {
  return Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, latitudeDeg));
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clampZoomForMode(mode: MapViewMode, zoom: number): number {
  if (mode === '2D') {
    return clampNumber(zoom, MIN_ZOOM_2D, MAX_ZOOM_2D);
  }
  return clampNumber(zoom, MIN_ZOOM_3D, MAX_ZOOM_3D);
}

export function normalizeHeadingDeg(headingDeg: number): number {
  const normalized = ((headingDeg % 360) + 360) % 360;
  return Number.isFinite(normalized) ? normalized : 0;
}

export function clampPitchDeg(pitchDeg: number): number {
  if (!Number.isFinite(pitchDeg)) return 0;
  return clampNumber(pitchDeg, MIN_PITCH_DEG, MAX_PITCH_DEG);
}

export function normalizeMapBrowseState(
  input: Partial<MapBrowseState> | null | undefined,
  mode: MapViewMode = '2D'
): MapBrowseState {
  const center = input?.centerWgs84;
  const lat = center && Number.isFinite(center[0]) ? center[0] : 30.57;
  const lng = center && Number.isFinite(center[1]) ? center[1] : 104.07;
  const zoom = Number.isFinite(input?.zoom) ? (input?.zoom as number) : 12;
  const headingDeg = Number.isFinite(input?.headingDeg) ? (input?.headingDeg as number) : 0;
  const pitchDeg = Number.isFinite(input?.pitchDeg) ? (input?.pitchDeg as number) : 0;
  const targetElevation = Number.isFinite(input?.targetElevation)
    ? (input?.targetElevation as number)
    : undefined;
  const cameraRangeMeters = Number.isFinite(input?.cameraRangeMeters)
    ? (input?.cameraRangeMeters as number)
    : undefined;

  return {
    centerWgs84: [clampLatitude(lat), lng],
    zoom: clampZoomForMode(mode, zoom),
    headingDeg: normalizeHeadingDeg(headingDeg),
    pitchDeg: clampPitchDeg(pitchDeg),
    ...(targetElevation !== undefined ? { targetElevation } : {}),
    ...(cameraRangeMeters !== undefined ? { cameraRangeMeters } : {}),
  };
}

export function areBrowseStatesEquivalent(a: MapBrowseState, b: MapBrowseState): boolean {
  const targetElevationA = a.targetElevation ?? 0;
  const targetElevationB = b.targetElevation ?? 0;
  const cameraRangeA = a.cameraRangeMeters ?? 0;
  const cameraRangeB = b.cameraRangeMeters ?? 0;

  return (
    Math.abs(a.centerWgs84[0] - b.centerWgs84[0]) <= CENTER_EPSILON_DEG &&
    Math.abs(a.centerWgs84[1] - b.centerWgs84[1]) <= CENTER_EPSILON_DEG &&
    Math.abs(a.zoom - b.zoom) <= ZOOM_EPSILON &&
    Math.abs(normalizeHeadingDeg(a.headingDeg) - normalizeHeadingDeg(b.headingDeg)) <= ANGLE_EPSILON_DEG &&
    Math.abs(a.pitchDeg - b.pitchDeg) <= ANGLE_EPSILON_DEG &&
    Math.abs(targetElevationA - targetElevationB) <= ELEVATION_EPSILON_METERS &&
    Math.abs(cameraRangeA - cameraRangeB) <= RANGE_EPSILON_METERS
  );
}

export function metersPerPixelFromZoom(latitudeDeg: number, zoom: number): number {
  const lat = clampLatitude(latitudeDeg);
  const cosLat = Math.max(1e-6, Math.cos((lat * Math.PI) / 180));
  return (EARTH_CIRCUMFERENCE_METERS * cosLat) / (WEB_MERCATOR_TILE_SIZE * Math.pow(2, zoom));
}

export function zoomFromMetersPerPixel(latitudeDeg: number, metersPerPixel: number): number {
  const safeMpp = Math.max(1e-9, metersPerPixel);
  const lat = clampLatitude(latitudeDeg);
  const cosLat = Math.max(1e-6, Math.cos((lat * Math.PI) / 180));
  return Math.log2((EARTH_CIRCUMFERENCE_METERS * cosLat) / (WEB_MERCATOR_TILE_SIZE * safeMpp));
}

export function cesiumRangeFromZoom(
  latitudeDeg: number,
  zoom: number,
  viewportHeightPx: number,
  verticalFovRad: number,
): number {
  const mpp = metersPerPixelFromZoom(latitudeDeg, zoom);
  const h = Math.max(1, viewportHeightPx);
  const fov = Math.max(1e-4, verticalFovRad);
  return (mpp * h) / (2 * Math.tan(fov / 2));
}

export function zoomFromCesiumRange(
  latitudeDeg: number,
  rangeMeters: number,
  viewportHeightPx: number,
  verticalFovRad: number,
): number {
  const range = Math.max(1e-3, rangeMeters);
  const h = Math.max(1, viewportHeightPx);
  const fov = Math.max(1e-4, verticalFovRad);
  const mpp = (2 * range * Math.tan(fov / 2)) / h;
  return zoomFromMetersPerPixel(latitudeDeg, mpp);
}

/** Hermite 平滑阶梯函数：edge0以下返回0，edge1以上返回1，中间平滑过渡 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** 线性插值 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
