/**
 * MapAdvancedPanel.tsx
 * 图形详细信息与高级操作面板
 */

import React, { useMemo, useState, useCallback } from 'react';
import * as turf from '@turf/turf';
import html2canvas from 'html2canvas';
import { useMapStore, type MapTreeNode } from '../../stores/mapStore';
import { CommandEmptyState, CommandMetricGrid } from '../command/CommandPrimitives';
import './MapAdvancedPanel.css';

interface MapAdvancedPanelProps {
  nodeId: string;
}

interface FeatureInfo {
  type: string;
  vertices: number;
  center: [number, number];
  bbox: [number, number, number, number];
  area?: number;
  perimeter?: number;
  coordinates: [number, number][];
  edgeLengths: number[];
  radius?: number;
}

function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '0 m';
  if (meters < 1000) {
    return `${meters.toFixed(2)} m`;
  }
  return `${(meters / 1000).toFixed(3)} km`;
}

function formatArea(sqMeters: number): string {
  if (!Number.isFinite(sqMeters) || sqMeters < 0) return '0 m²';
  if (sqMeters < 1000000) {
    return `${sqMeters.toFixed(2)} m²`;
  }
  return `${(sqMeters / 1000000).toFixed(4)} km²`;
}

function formatCoord(coord: number, isLng: boolean): string {
  const abs = Math.abs(coord);
  const deg = Math.floor(abs);
  const min = Math.floor((abs - deg) * 60);
  const sec = ((abs - deg - min / 60) * 3600).toFixed(1);
  const dir = coord >= 0 ? (isLng ? 'E' : 'N') : isLng ? 'W' : 'S';
  return `${deg}°${min}'${sec}"${dir}`;
}

function computeFeatureInfo(node: MapTreeNode): FeatureInfo | null {
  const geometry = node.geometry;
  if (!geometry) return null;

  const type = node.featureType || geometry.type;
  let coordinates: [number, number][] = [];
  let area: number | undefined;
  let perimeter: number | undefined;
  let center: [number, number] = [0, 0];
  let bbox: [number, number, number, number] = [0, 0, 0, 0];
  let edgeLengths: number[] = [];
  let radius: number | undefined;

  try {
    // 获取边界框
    const bboxResult = turf.bbox(geometry as any);
    bbox = bboxResult as [number, number, number, number];

    // 计算中心点
    const centroid = turf.centroid(geometry as any);
    center = centroid.geometry.coordinates as [number, number];

    if (geometry.type === 'Point') {
      coordinates = [geometry.coordinates as [number, number]];
    } else if (geometry.type === 'LineString') {
      coordinates = geometry.coordinates as [number, number][];
      const line = turf.lineString(geometry.coordinates);
      perimeter = turf.length(line, { units: 'meters' });
      edgeLengths = computeEdgeLengths(geometry.coordinates as [number, number][]);
    } else if (geometry.type === 'Polygon') {
      const rings = geometry.coordinates as [number, number][][];
      coordinates = rings[0] || [];
      const polygon = turf.polygon(geometry.coordinates as any);
      area = turf.area(polygon);
      perimeter = turf.length(turf.lineString(rings[0]), { units: 'meters' });
      edgeLengths = computeEdgeLengths(rings[0]);
    } else if (geometry.type === 'MultiPolygon') {
      // 取第一个多边形
      const firstPoly = geometry.coordinates[0] as [number, number][][];
      coordinates = firstPoly[0] || [];
      const multiPoly = turf.multiPolygon(geometry.coordinates as any);
      area = turf.area(multiPoly);
      // 计算所有外边界的周长
      let totalPerimeter = 0;
      for (const poly of geometry.coordinates) {
        const ring = (poly as [number, number][][])[0];
        if (ring) {
          totalPerimeter += turf.length(turf.lineString(ring), { units: 'meters' });
        }
      }
      perimeter = totalPerimeter;
    }

    // 圆形特殊处理
    if (type === 'circle' && node.radius) {
      radius = node.radius;
      // 圆的周长和面积
      perimeter = 2 * Math.PI * radius;
      area = Math.PI * radius * radius;
    }
  } catch (e) {
    console.error('[MapAdvancedPanel] Failed to compute feature info:', e);
    return null;
  }

  return {
    type,
    vertices: coordinates.length,
    center,
    bbox,
    area,
    perimeter,
    coordinates,
    edgeLengths,
    radius,
  };
}

function computeEdgeLengths(coords: [number, number][]): number[] {
  const lengths: number[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const from = turf.point(coords[i]);
    const to = turf.point(coords[i + 1]);
    lengths.push(turf.distance(from, to, { units: 'meters' }));
  }
  return lengths;
}

export default function MapAdvancedPanel({ nodeId }: MapAdvancedPanelProps) {
  const { treeNodes, updateFeature } = useMapStore();
  const [elevationLoading, setElevationLoading] = useState(false);
  const [elevation, setElevation] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  const node = treeNodes.find((n) => n.id === nodeId);
  const info = useMemo(() => (node ? computeFeatureInfo(node) : null), [node]);

  const handleGetElevation = useCallback(async () => {
    if (!info) return;
    setElevationLoading(true);
    try {
      const [lng, lat] = info.center;
      const response = await fetch(
        `https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lng}`
      );
      const data = await response.json();
      if (data.results && data.results[0]) {
        setElevation(data.results[0].elevation);
      }
    } catch (e) {
      console.error('[MapAdvancedPanel] Failed to get elevation:', e);
    } finally {
      setElevationLoading(false);
    }
  }, [info]);

  const handleExportImage = useCallback(async () => {
    setExporting(true);
    try {
      // 查找地图容器
      const mapContainer = document.querySelector('.map-main') as HTMLElement;
      if (!mapContainer) {
        alert('无法找到地图容器');
        return;
      }

      const canvas = await html2canvas(mapContainer, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#1a1a2e',
      });

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `map-export-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error('[MapAdvancedPanel] Failed to export image:', e);
      alert('导出失败');
    } finally {
      setExporting(false);
    }
  }, []);

  if (!node) {
    return (
      <CommandEmptyState 
        icon="📍"
        title="未选择图形"
      />
    );
  }

  if (!info) {
    return (
      <CommandEmptyState 
        icon="❌"
        title="无法解析图形数据"
      />
    );
  }

  const typeLabels: Record<string, string> = {
    polygon: '多边形',
    polyline: '折线',
    marker: '标记点',
    circle: '圆形',
    rectangle: '矩形',
    Point: '点',
    LineString: '线',
    Polygon: '多边形',
    MultiPolygon: '多面',
  };

  const basicMetrics = [
    { label: '类型', value: typeLabels[info.type] || info.type },
    { label: '顶点数', value: info.vertices }
  ];
  if (info.radius !== undefined) {
    basicMetrics.push({ label: '半径', value: formatDistance(info.radius) as any });
  }

  const dimMetrics = [];
  if (info.area !== undefined) dimMetrics.push({ label: '面积', value: formatArea(info.area) as any });
  if (info.perimeter !== undefined) dimMetrics.push({ label: '周长', value: formatDistance(info.perimeter) as any });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* 基本信息 */}
      <div>
        <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}>基本信息</h4>
        <CommandMetricGrid items={basicMetrics} />
      </div>

      {/* 尺寸信息 */}
      {dimMetrics.length > 0 && (
        <div>
          <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}>尺寸</h4>
          <CommandMetricGrid items={dimMetrics} />
        </div>
      )}

      {/* 中心点 */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase' }}>中心点</h4>
          <button
            className="btn btn--sm btn--ghost"
            onClick={handleGetElevation}
            disabled={elevationLoading}
          >
            {elevationLoading ? '查询中...' : '获取海拔'}
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: 'var(--surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>纬度</span>
            <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{formatCoord(info.center[1], false)} <span style={{ color: 'var(--text-muted)' }}>({info.center[1].toFixed(6)})</span></span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>经度</span>
            <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{formatCoord(info.center[0], true)} <span style={{ color: 'var(--text-muted)' }}>({info.center[0].toFixed(6)})</span></span>
          </div>
          {elevation !== null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', borderTop: '1px solid var(--border)', paddingTop: '8px', mt: '4px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>海拔</span>
              <span style={{ color: 'var(--accent)', fontWeight: 600, fontFamily: 'monospace' }}>{elevation.toFixed(1)} m</span>
            </div>
          )}
        </div>
      </div>

      {/* 边界框 */}
      <div>
        <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}>边界框 (BBox)</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'min-content 1fr min-content', gap: '8px', alignItems: 'center', padding: '16px', background: 'var(--surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', textAlign: 'center' }}>
           <div style={{ gridColumn: '1 / -1', fontSize: '12px', color: 'var(--text-secondary)' }}>北: <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{info.bbox[3].toFixed(6)}</span></div>
           <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>西: <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{info.bbox[0].toFixed(6)}</span></div>
           <div style={{ fontSize: '16px' }}>📍</div>
           <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>东: <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{info.bbox[2].toFixed(6)}</span></div>
           <div style={{ gridColumn: '1 / -1', fontSize: '12px', color: 'var(--text-secondary)' }}>南: <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{info.bbox[1].toFixed(6)}</span></div>
        </div>
      </div>

      {/* 顶点坐标 */}
      {info.coordinates.length > 0 && (
        <div>
          <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}>顶点坐标</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '12px', background: 'var(--surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
            {info.coordinates.slice(0, 5).map(([lng, lat], idx) => (
              <div key={idx} style={{ display: 'flex', gap: '12px', fontSize: '13px', fontFamily: 'monospace' }}>
                <span style={{ color: 'var(--text-muted)', width: '20px', textAlign: 'right' }}>{idx + 1}</span>
                <span style={{ color: 'var(--text-primary)' }}>{lat.toFixed(5)}, {lng.toFixed(5)}</span>
              </div>
            ))}
            {info.coordinates.length > 5 && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '8px' }}>
                还有 {info.coordinates.length - 5} 个顶点...
              </div>
            )}
          </div>
        </div>
      )}

      {/* 高级操作 */}
      <div style={{ marginTop: 'auto' }}>
        <button
          className="btn btn--primary"
          style={{ width: '100%' }}
          onClick={handleExportImage}
          disabled={exporting}
        >
          {exporting ? '导出中...' : '导出图片'}
        </button>
      </div>
    </div>
  );
}