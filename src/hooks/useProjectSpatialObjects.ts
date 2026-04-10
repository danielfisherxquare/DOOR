import { useEffect } from 'react';
import { useMapStore } from '../stores/mapStore';
import studioProjectApi from '../services/studioProjectApi';
import { spatialObjectToGeoJSONFeature, spatialObjectToMapNode } from '../utils/map/spatialObjects';
import { terrainWorkZoneToGeoJSONFeature, terrainWorkZoneToMapNode } from '../utils/map/terrainWorkZones';
import { showError } from '../utils/toast';

export default function useProjectSpatialObjects(projectId?: string | null, orgId?: string | null) {
  const setTreeNodes = useMapStore((state) => state.setTreeNodes);
  const setDrawnFeatures = useMapStore((state) => state.setDrawnFeatures);

  useEffect(() => {
    if (!projectId) {
      const currentMap = useMapStore.getState();
      setTreeNodes(currentMap.treeNodes.filter(
        (node) => node.source !== 'spatial-object' && node.source !== 'terrain-work-zone',
      ));
      setDrawnFeatures(currentMap.drawnFeatures.filter((feature) => {
        const source = (feature.properties as any)?.source;
        return source !== 'spatial-object' && source !== 'terrain-work-zone';
      }));
      return;
    }

    let active = true;

    Promise.all([
      studioProjectApi.listSpatialObjects(projectId, {}, orgId || undefined),
      studioProjectApi.listTerrainWorkZones(projectId, {}, orgId || undefined),
    ])
      .then(([spatialResponse, terrainResponse]) => {
        if (!active) return;
        const objects = Array.isArray(spatialResponse?.data) ? spatialResponse.data : [];
        const zones = Array.isArray(terrainResponse?.data) ? terrainResponse.data : [];
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
          (node) => node.source !== 'spatial-object' && node.source !== 'terrain-work-zone',
        );
        const localDrawnFeatures = currentMap.drawnFeatures.filter((feature) => {
          const source = (feature.properties as any)?.source;
          return source !== 'spatial-object' && source !== 'terrain-work-zone';
        });

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
