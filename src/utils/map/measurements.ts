import * as turf from '@turf/turf';

export interface GeometryMeasurement {
  lengthMeters?: number;
  areaSquareMeters?: number;
  perimeterMeters?: number;
  vertexCount: number;
  summary: string;
}

function formatDistance(meters?: number): string {
  if (!Number.isFinite(meters ?? NaN)) return '0 m';
  const value = meters as number;
  if (value < 1000) return `${value.toFixed(1)} m`;
  return `${(value / 1000).toFixed(3)} km`;
}

function formatArea(squareMeters?: number): string {
  if (!Number.isFinite(squareMeters ?? NaN)) return '0 m2';
  const value = squareMeters as number;
  if (value < 1000000) return `${value.toFixed(1)} m2`;
  return `${(value / 1000000).toFixed(4)} km2`;
}

function getVertexCount(geometry?: GeoJSON.Geometry | null): number {
  if (!geometry) return 0;
  if (geometry.type === 'Point') return 1;
  if (geometry.type === 'LineString') return geometry.coordinates.length;
  if (geometry.type === 'Polygon') return geometry.coordinates[0]?.length || 0;
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.reduce((sum, polygon) => sum + (polygon[0]?.length || 0), 0);
  }
  return 0;
}

export function measureGeometry(geometry?: GeoJSON.Geometry | null): GeometryMeasurement {
  const vertexCount = getVertexCount(geometry);
  if (!geometry) {
    return { vertexCount, summary: '无几何' };
  }

  try {
    if (geometry.type === 'LineString') {
      const lengthMeters = turf.length(turf.lineString(geometry.coordinates), { units: 'meters' });
      return {
        lengthMeters,
        vertexCount,
        summary: `长度 ${formatDistance(lengthMeters)} · ${vertexCount} 点`,
      };
    }

    if (geometry.type === 'Polygon') {
      const ring = geometry.coordinates[0] || [];
      const areaSquareMeters = turf.area(turf.polygon(geometry.coordinates));
      const perimeterMeters = ring.length > 1 ? turf.length(turf.lineString(ring), { units: 'meters' }) : 0;
      return {
        areaSquareMeters,
        perimeterMeters,
        vertexCount,
        summary: `面积 ${formatArea(areaSquareMeters)} · 周长 ${formatDistance(perimeterMeters)}`,
      };
    }

    if (geometry.type === 'MultiPolygon') {
      const areaSquareMeters = turf.area(turf.multiPolygon(geometry.coordinates));
      return {
        areaSquareMeters,
        vertexCount,
        summary: `面积 ${formatArea(areaSquareMeters)} · ${vertexCount} 点`,
      };
    }

    if (geometry.type === 'Point') {
      return {
        vertexCount,
        summary: `点位 ${geometry.coordinates[1]?.toFixed(6)}, ${geometry.coordinates[0]?.toFixed(6)}`,
      };
    }
  } catch (error) {
    console.warn('[measureGeometry] Failed to measure geometry', error);
  }

  return { vertexCount, summary: `${geometry.type} · ${vertexCount} 点` };
}

export function formatMeasurement(measurement?: GeometryMeasurement | null): string {
  return measurement?.summary || '无量算结果';
}
