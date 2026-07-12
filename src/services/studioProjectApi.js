import request from '../utils/request'
import axios from 'axios'

const basePath = '/app/3d-studio'

function withOrgId(orgId, params = {}) {
  if (!orgId) return params
  return { ...params, orgId }
}

const studioProjectApi = {
  listProjects: (orgId) => request.get(`${basePath}/projects`, { params: withOrgId(orgId) }),
  createProject: (data, orgId) =>
    request.post(`${basePath}/projects`, data, { params: withOrgId(orgId) }),
  getProject: (id, orgId) =>
    request.get(`${basePath}/projects/${id}`, { params: withOrgId(orgId) }),
  updateProject: (id, data, orgId) =>
    request.put(`${basePath}/projects/${id}`, data, { params: withOrgId(orgId) }),
  deleteProject: (id, orgId) =>
    request.delete(`${basePath}/projects/${id}`, { params: withOrgId(orgId) }),
  duplicateProject: (id, orgId) =>
    request.post(`${basePath}/projects/${id}/duplicate`, {}, { params: withOrgId(orgId) }),
  savePrimaryAsset: (id, data, orgId) =>
    request.post(`${basePath}/projects/${id}/primary-asset`, data, { params: withOrgId(orgId) }),
  getSnapshot: (id, orgId) =>
    request.get(`${basePath}/projects/${id}/snapshot`, { params: withOrgId(orgId) }),
  updateSnapshot: (id, snapshotJson, orgId) =>
    request.put(
      `${basePath}/projects/${id}/snapshot`,
      { snapshotJson },
      { params: withOrgId(orgId) }
    ),
  listBuildings: (projectId, orgId) =>
    request.get(`${basePath}/projects/${projectId}/buildings`, { params: withOrgId(orgId) }),
  createBuilding: (projectId, data, orgId) =>
    request.post(`${basePath}/projects/${projectId}/buildings`, data, { params: withOrgId(orgId) }),
  updateBuilding: (projectId, buildingId, data, orgId) =>
    request.put(`${basePath}/projects/${projectId}/buildings/${buildingId}`, data, {
      params: withOrgId(orgId),
    }),
  createLevel: (projectId, buildingId, data, orgId) =>
    request.post(`${basePath}/projects/${projectId}/buildings/${buildingId}/levels`, data, {
      params: withOrgId(orgId),
    }),
  updateLevel: (projectId, buildingId, levelId, data, orgId) =>
    request.put(
      `${basePath}/projects/${projectId}/buildings/${buildingId}/levels/${levelId}`,
      data,
      { params: withOrgId(orgId) }
    ),
  createWarehouse: (projectId, buildingId, levelId, data, orgId) =>
    request.post(
      `${basePath}/projects/${projectId}/buildings/${buildingId}/levels/${levelId}/warehouses`,
      data,
      { params: withOrgId(orgId) }
    ),
  updateWarehouse: (projectId, warehouseId, data, orgId) =>
    request.put(`${basePath}/projects/${projectId}/warehouses/${warehouseId}`, data, {
      params: withOrgId(orgId),
    }),
  getWarehouseScene: (projectId, warehouseId, orgId) =>
    request.get(`${basePath}/projects/${projectId}/warehouses/${warehouseId}/scene`, {
      params: withOrgId(orgId),
    }),
  updateWarehouseScene: (projectId, warehouseId, sceneSnapshot, orgId) =>
    request.put(
      `${basePath}/projects/${projectId}/warehouses/${warehouseId}/scene`,
      { sceneSnapshot },
      { params: withOrgId(orgId) }
    ),
  listRaceBindings: (projectId, orgId) =>
    request.get(`${basePath}/projects/${projectId}/race-bindings`, { params: withOrgId(orgId) }),
  createRaceBinding: (projectId, data, orgId) =>
    request.post(`${basePath}/projects/${projectId}/race-bindings`, data, {
      params: withOrgId(orgId),
    }),
  getMapLayers: (id, orgId) =>
    request.get(`${basePath}/projects/${id}/map-layers`, { params: withOrgId(orgId) }),
  createMapLayer: (id, data, orgId) =>
    request.post(`${basePath}/projects/${id}/map-layers`, data, { params: withOrgId(orgId) }),
  listSpatialObjects: (projectId, params = {}, orgId) =>
    request.get(`${basePath}/projects/${projectId}/spatial-objects`, {
      params: withOrgId(orgId, params),
    }),
  createSpatialObject: (projectId, data, orgId) =>
    request.post(`${basePath}/projects/${projectId}/spatial-objects`, data, {
      params: withOrgId(orgId),
    }),
  updateSpatialObject: (objectId, data, orgId) =>
    request.put(`${basePath}/spatial-objects/${objectId}`, data, { params: withOrgId(orgId) }),
  deleteSpatialObject: (objectId, orgId) =>
    request.delete(`${basePath}/spatial-objects/${objectId}`, { params: withOrgId(orgId) }),
  listTerrainWorkZones: (projectId, params = {}, orgId) =>
    request.get(`${basePath}/projects/${projectId}/terrain-work-zones`, {
      params: withOrgId(orgId, params),
    }),
  createTerrainWorkZone: (projectId, data, orgId) =>
    request.post(`${basePath}/projects/${projectId}/terrain-work-zones`, data, {
      params: withOrgId(orgId),
    }),
  getTerrainWorkZone: (zoneId, orgId) =>
    request.get(`${basePath}/terrain-work-zones/${zoneId}`, { params: withOrgId(orgId) }),
  updateTerrainWorkZone: (zoneId, data, orgId) =>
    request.put(`${basePath}/terrain-work-zones/${zoneId}`, data, { params: withOrgId(orgId) }),
  generateTerrainWorkZonePublishManifest: (zoneId, orgId) =>
    request.post(
      `${basePath}/terrain-work-zones/${zoneId}/publish-manifest`,
      {},
      { params: withOrgId(orgId) }
    ),
  generateTerrainWorkZoneExportPackage: (zoneId, orgId) =>
    request.post(
      `${basePath}/terrain-work-zones/${zoneId}/export-package`,
      {},
      { params: withOrgId(orgId) }
    ),
  executeTerrainWorkZoneExport: (zoneId, orgId) =>
    request.post(
      `${basePath}/terrain-work-zones/${zoneId}/execute-export`,
      {},
      { params: withOrgId(orgId) }
    ),
  syncTerrainWorkZoneOsmBuildings: (zoneId, data = {}, orgId) =>
    request.post(`${basePath}/terrain-work-zones/${zoneId}/osm-buildings/sync`, data, {
      params: withOrgId(orgId),
    }),
  syncTerrainWorkZoneTerrainPatch: (zoneId, data = {}, orgId) =>
    request.post(`${basePath}/terrain-work-zones/${zoneId}/terrain-patch/sync`, data, {
      params: withOrgId(orgId),
    }),
  createTerrainWorkZoneSceneExportJob: (projectId, zoneId, data = {}, orgId) =>
    request.post(
      `${basePath}/projects/${projectId}/terrain-work-zones/${zoneId}/scene-export-jobs`,
      data,
      { params: withOrgId(orgId) }
    ),
  getSceneExportJob: (jobId, orgId) =>
    request.get(`${basePath}/scene-export-jobs/${jobId}`, { params: withOrgId(orgId) }),
  getGeneratedScene: (sceneId, orgId) =>
    request.get(`${basePath}/generated-scenes/${sceneId}`, { params: withOrgId(orgId) }),
  downloadGeneratedScene: (sceneId, { asset = 'glb', orgId } = {}) =>
    axios.get(
      `${import.meta.env.VITE_API_BASE_URL || '/api'}${basePath}/generated-scenes/${sceneId}/download`,
      {
    params: withOrgId(orgId, { asset }),
    responseType: 'blob',
    headers: (() => {
      try {
        const persisted = JSON.parse(window.localStorage.getItem('auth-storage') || '{}')
        const token = persisted?.state?.token || ''
        return token ? { Authorization: `Bearer ${token}` } : {}
      } catch {
        return {}
      }
    })(),
      }
    ),
  importGeneratedSceneToStudio: (sceneId, data = {}, orgId) =>
    request.post(`${basePath}/generated-scenes/${sceneId}/import-to-studio`, data, {
      params: withOrgId(orgId),
    }),
  bakeSite: (bbox, { name, zoom, maxTiles } = {}, orgId) =>
    request.post(
      `${basePath}/site-bake`,
      { bbox, name, zoom, maxTiles },
      { params: withOrgId(orgId) }
    ),
  getTerrainWorkZoneRuntimePreview: (zoneId, orgId) =>
    request.get(`${basePath}/terrain-work-zones/${zoneId}/runtime-preview`, {
      params: withOrgId(orgId),
  }),
  deleteTerrainWorkZone: (zoneId, orgId) =>
    request.delete(`${basePath}/terrain-work-zones/${zoneId}`, { params: withOrgId(orgId) }),
  listAssetTemplates: (orgId) =>
    request.get(`${basePath}/asset-templates`, { params: withOrgId(orgId) }),
  createAssetTemplate: (data, orgId) =>
    request.post(`${basePath}/asset-templates`, data, { params: withOrgId(orgId) }),
  listRaces: (orgId) => request.get(`${basePath}/races`, { params: withOrgId(orgId) }),
  listInventoryUnits: (params = {}, orgId) =>
    request.get(`${basePath}/inventory-units`, { params: withOrgId(orgId, params) }),
  listWarehouseLocations: (params = {}, orgId) =>
    request.get(`${basePath}/warehouse-locations`, { params: withOrgId(orgId, params) }),
  bindInventoryToPlacement: (placementId, data, orgId) =>
    request.post(`${basePath}/placements/${placementId}/bind-inventory`, data, {
      params: withOrgId(orgId),
    }),
  importWarehouseScene: ({ warehouseId, orgId, sceneType, projectType }) =>
    request.get(`${basePath}/imports/warehouse/${warehouseId}`, {
    params: {
      ...withOrgId(orgId),
      ...(sceneType ? { sceneType } : {}),
      ...(projectType ? { projectType } : {}),
    },
  }),
}

export default studioProjectApi
