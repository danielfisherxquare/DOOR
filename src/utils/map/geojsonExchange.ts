import type { MapTreeNode } from '../../stores/mapStore';
import {
  EXPORT_COORDINATE_SYSTEMS,
  buildExportManifest,
} from '../exportManifest.js';

export interface ImportedMapFeature {
  feature: GeoJSON.Feature;
  node: Partial<MapTreeNode>;
}

export interface ArcSproMapFeatureCollection extends GeoJSON.FeatureCollection {
  properties: {
    doorExport: ReturnType<typeof buildExportManifest>;
  };
}

type MapFeatureProperties = Partial<MapTreeNode> & {
  id?: string | number;
  featureId?: string | number;
  title?: string;
};

function getFeatureType(geometry?: GeoJSON.Geometry | null): MapTreeNode['featureType'] {
  if (geometry?.type === 'Point') return 'marker';
  if (geometry?.type === 'LineString') return 'polyline';
  if (geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon') return 'polygon';
  return 'polygon';
}

export function buildMapFeatureCollection(
  treeNodes: MapTreeNode[],
  drawnFeatures: GeoJSON.Feature[],
  options: { exportName?: string; source?: string } = {},
): ArcSproMapFeatureCollection {
  const nodesById = new Map(treeNodes.map((node) => [node.id, node]));
  const features = drawnFeatures.map((feature) => {
    const props = (feature.properties || {}) as MapFeatureProperties;
    const featureId = String(feature.id || props.id || props.featureId || '');
    const node = nodesById.get(featureId);
    return {
      ...feature,
      id: featureId || feature.id,
      properties: {
        ...props,
        id: featureId || props.id,
        name: node?.name || props.name,
        visible: node?.visible ?? props.visible ?? true,
        featureType: node?.featureType || props.featureType || getFeatureType(feature.geometry),
        color: node?.color || props.color,
        strokeColor: node?.strokeColor || props.strokeColor,
        strokeWeight: node?.strokeWeight || props.strokeWeight,
        strokeOpacity: node?.strokeOpacity || props.strokeOpacity,
        fillColor: node?.fillColor || props.fillColor,
        fillOpacity: node?.fillOpacity || props.fillOpacity,
        objectType: node?.objectType || props.objectType,
        templateId: node?.templateId || props.templateId,
        backendObjectId: node?.backendObjectId || props.backendObjectId,
        backendWorkZoneId: node?.backendWorkZoneId || props.backendWorkZoneId,
        siteModeBound: node?.siteModeBound ?? props.siteModeBound ?? false,
        syncStatus: node?.syncStatus || props.syncStatus,
      },
    };
  });

  return {
    type: 'FeatureCollection',
    properties: {
      doorExport: buildExportManifest({
        kind: 'gis-map-feature-collection',
        name: options.exportName || 'door-gis-map',
        source: options.source || 'gis-map',
        coordinateSystem: EXPORT_COORDINATE_SYSTEMS.WGS84,
        stats: {
          featureCount: features.length,
          nodeCount: treeNodes.length,
        },
        diagnostics: {
          syncedFeatureCount: features.filter((feature) => {
            const props = (feature.properties || {}) as MapFeatureProperties;
            return Boolean(props.backendObjectId || props.backendWorkZoneId);
          }).length,
        },
      }),
    },
    features,
  };
}

export function parseMapFeatureCollection(input: unknown): ImportedMapFeature[] {
  const collection = input as GeoJSON.FeatureCollection;
  if (!collection || collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    throw new Error('文件不是 GeoJSON FeatureCollection');
  }

  return collection.features
    .filter((feature) => feature?.type === 'Feature' && feature.geometry)
    .map((feature, index) => {
      const props = (feature.properties || {}) as MapFeatureProperties;
      const featureType = props.featureType || getFeatureType(feature.geometry);
      const name = props.name || props.title || `导入图形 ${index + 1}`;
      return {
        feature: {
          ...feature,
          properties: {
            ...props,
            name,
            featureType,
            syncStatus: 'local',
            backendObjectId: null,
            backendWorkZoneId: null,
            source: 'geojson-import',
          },
        },
        node: {
          name,
          visible: props.visible ?? true,
          featureType,
          geometry: feature.geometry,
          color: props.color || props.fillColor || props.strokeColor || '#3388ff',
          strokeColor: props.strokeColor,
          strokeWeight: props.strokeWeight,
          strokeOpacity: props.strokeOpacity,
          fillColor: props.fillColor,
          fillOpacity: props.fillOpacity,
          objectType: props.objectType || 'generic',
          templateId: props.templateId || null,
          templateName: props.templateName || null,
          placementMode: props.placementMode || 'follow-terrain',
          syncStatus: 'local',
          source: 'geojson-import',
        },
      };
    });
}

export function downloadGeoJSON(filename: string, collection: GeoJSON.FeatureCollection) {
  const blob = new Blob([JSON.stringify(collection, null, 2)], { type: 'application/geo+json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
