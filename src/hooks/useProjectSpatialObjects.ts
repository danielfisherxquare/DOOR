import { useEffect } from 'react';
import { useMapStore } from '../stores/mapStore';
import studioProjectApi from '../services/studioProjectApi';
import { spatialObjectToGeoJSONFeature, spatialObjectToMapNode } from '../utils/map/spatialObjects';
import {
  isInternalMapSelectionExportZone,
  terrainWorkZoneToGeoJSONFeature,
  terrainWorkZoneToMapNode,
} from '../utils/map/terrainWorkZones';
import { showError } from '../utils/toast';

function normalizeStudioProjectId(projectId?: string | null) {
  const normalized = String(projectId || '').trim();
  if (!normalized || normalized === 'new') return null;
  return normalized;
}

function isProjectSyncedNode(node: any) {
  return node?.source === 'spatial-object'
    || node?.source === 'terrain-work-zone'
    || Boolean(node?.backendObjectId)
    || Boolean(node?.backendWorkZoneId)
    || Boolean(node?.sourceProjectId);
}

function isProjectSyncedFeature(feature: GeoJSON.Feature) {
  const props = (feature.properties || {}) as any;
  return props.source === 'spatial-object'
    || props.source === 'terrain-work-zone'
    || Boolean(props.backendObjectId)
    || Boolean(props.backendWorkZoneId)
    || Boolean(props.focusZoneId)
    || Boolean(props.sourceProjectId);
}

export default function useProjectSpatialObjects(projectId?: string | null, orgId?: string | null) {
  const setTreeNodes = useMapStore((state) => state.setTreeNodes);
  const setDrawnFeatures = useMapStore((state) => state.setDrawnFeatures);

  useEffect(() => {
    const studioProjectId = normalizeStudioProjectId(projectId);
    if (!studioProjectId) {
      const currentMap = useMapStore.getState();
      setTreeNodes(currentMap.treeNodes.filter(
        (node) => !isProjectSyncedNode(node),
      ));
      setDrawnFeatures(currentMap.drawnFeatures.filter((feature) => !isProjectSyncedFeature(feature)));
      return;
    }

    let active = true;

    Promise.all([
      studioProjectApi.listSpatialObjects(studioProjectId, {}, orgId || undefined),
      studioProjectApi.listTerrainWorkZones(studioProjectId, {}, orgId || undefined),
    ])
      .then(([spatialResponse, terrainResponse]) => {
        if (!active) return;
        const objects = Array.isArray(spatialResponse?.data) ? spatialResponse.data : [];
        const zones = Array.isArray(terrainResponse?.data)
          ? terrainResponse.data.filter((zone) => !isInternalMapSelectionExportZone(zone))
          : [];
        const syncedNodes = [
          ...zones.map((item) => terrainWorkZoneToMapNode(item)),
          ...objects.map((item) => spatialObjectToMapNode(item)),
        ];
        const syncedFeatures = [
          ...zones.map((item) => terrainWorkZoneToGeoJSONFeature(item)).filter(Boolean),
          ...objects
          .map((item) => spatialObjectToGeoJSONFeature(item))
            .filter(Boolean),
        ] as GeoJSON.Feature[];

        const currentMap = useMapStore.getState();
        const localTreeNodes = currentMap.treeNodes.filter(
          (node) => !isProjectSyncedNode(node),
        );
        const localDrawnFeatures = currentMap.drawnFeatures.filter((feature) => !isProjectSyncedFeature(feature));

        setTreeNodes([...localTreeNodes, ...syncedNodes]);
        setDrawnFeatures([...localDrawnFeatures, ...syncedFeatures]);
      })
      .catch((error) => {
        if (!active) return;
        showError(`加载空间对象失败：${error.message}`);
      });

    return () => {
      active = false;
    };
  }, [orgId, projectId, setDrawnFeatures, setTreeNodes]);
}
