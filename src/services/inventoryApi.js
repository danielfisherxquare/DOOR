import request from '../utils/request'
import { resolveSurfacePrefix } from '../utils/surfaceApi'

function getInventoryBasePath() {
  return resolveSurfacePrefix({
    app: '/app/warehouse',
    admin: '/admin/warehouse',
    ops: '/ops/warehouse',
  }, 'app')
}

function inventoryUrl(path) {
  return `${getInventoryBasePath()}${path}`
}

function withOrgId(orgId, params = {}) {
  if (orgId) {
    return { ...params, orgId }
  }
  return params
}

const batchApi = {
  getBatches: (params = {}) => request.get(inventoryUrl('/batches'), { params }),
  getBatch: (id) => request.get(inventoryUrl(`/batches/${id}`)),
  createBatch: (data, orgId) => {
    const params = orgId ? { orgId } : {}
    return request.post(inventoryUrl('/batches'), data, { params })
  },
  updateBatch: (id, data) => request.put(inventoryUrl(`/batches/${id}`), data),
  deleteBatch: (id) => request.delete(inventoryUrl(`/batches/${id}`)),
}

const unitApi = {
  getUnits: (params = {}) => request.get(inventoryUrl('/units'), { params }),
  getUnitByQR: (qrCode, orgId) => {
    const params = orgId ? { orgId } : {}
    return request.get(inventoryUrl(`/units/${encodeURIComponent(qrCode)}`), { params })
  },
  batchInbound: (data, orgId) => {
    const params = orgId ? { orgId } : {}
    return request.post(inventoryUrl('/units/batch'), data, { params })
  },
  scanUnit: (data, orgId) => {
    const params = orgId ? { orgId } : {}
    return request.post(inventoryUrl('/units/scan'), data, { params })
  },
  updateStatus: (id, data) => request.put(inventoryUrl(`/units/${id}/status`), data),
}

const warehouseApi = {
  getWarehouses: (orgId) => request.get(inventoryUrl('/warehouses'), { params: withOrgId(orgId) }),
  createWarehouse: (data, orgId) => request.post(inventoryUrl('/warehouses'), data, { params: withOrgId(orgId) }),
  updateWarehouse: (id, data, orgId) => request.put(inventoryUrl(`/warehouses/${id}`), data, { params: withOrgId(orgId) }),
  deleteWarehouse: (id, orgId) => request.delete(inventoryUrl(`/warehouses/${id}`), { params: withOrgId(orgId) }),
}

const locationApi = {
  getLocations: (warehouseId, orgId) => request.get(inventoryUrl('/locations'), { params: withOrgId(orgId, { warehouseId }) }),
  createLocation: (data, orgId) => request.post(inventoryUrl('/locations'), data, { params: withOrgId(orgId) }),
  recommend: (data, orgId) => request.post(inventoryUrl('/locations/recommend'), data, { params: withOrgId(orgId) }),
}

const requestApi = {
  getRequests: (raceId, orgId) => request.get(inventoryUrl('/requests'), { params: withOrgId(orgId, { raceId }) }),
  createRequest: (data, orgId) => request.post(inventoryUrl('/requests'), data, { params: withOrgId(orgId) }),
  approveRequest: (id, approvedQuantity, orgId) => request.put(inventoryUrl(`/requests/${id}/approve`), { approvedQuantity }, { params: withOrgId(orgId) }),
  allocateToRace: (id, orgId) => request.post(inventoryUrl(`/requests/${id}/allocate`), {}, { params: withOrgId(orgId) }),
}

const alertApi = {
  getAlerts: (params = {}) => request.get(inventoryUrl('/alerts'), { params }),
  getUnreadCount: () => request.get(inventoryUrl('/alerts/unread')),
  markAsRead: (id) => request.put(inventoryUrl(`/alerts/${id}/read`)),
  markAsResolved: (id) => request.put(inventoryUrl(`/alerts/${id}/resolve`)),
  getRules: (orgId) => request.get(inventoryUrl('/alert-rules'), { params: withOrgId(orgId) }),
  createRule: (data, orgId) => request.post(inventoryUrl('/alert-rules'), data, { params: withOrgId(orgId) }),
  updateRule: (id, data, orgId) => request.put(inventoryUrl(`/alert-rules/${id}`), data, { params: withOrgId(orgId) }),
}

const stocktakingApi = {
  getPlans: (params = {}) => request.get(inventoryUrl('/stocktaking/plans'), { params }),
  getPlan: (id) => request.get(inventoryUrl(`/stocktaking/plans/${id}`)),
  createPlan: (data, orgId) => request.post(inventoryUrl('/stocktaking/plans'), data, { params: withOrgId(orgId) }),
  startPlan: (id, orgId) => request.post(inventoryUrl(`/stocktaking/plans/${id}/start`), {}, { params: withOrgId(orgId) }),
  completePlan: (id, orgId) => request.post(inventoryUrl(`/stocktaking/plans/${id}/complete`), {}, { params: withOrgId(orgId) }),
  scanCount: (data, orgId) => request.post(inventoryUrl('/stocktaking/scan'), data, { params: withOrgId(orgId) }),
  getRecords: (planId, orgId) => request.get(inventoryUrl(`/stocktaking/records/${planId}`), { params: withOrgId(orgId) }),
}

const reportApi = {
  getStatistics: (params = {}) => request.get(inventoryUrl('/statistics'), { params }),
  getTransactions: (params = {}) => request.get(inventoryUrl('/transactions'), { params }),
  getTurnover: (params = {}) => request.get(inventoryUrl('/reports/turnover'), { params }),
  getSnapshot: (date, orgId) => request.get(inventoryUrl(`/reports/snapshot/${date}`), { params: withOrgId(orgId) }),
  traceUnit: (unitId, orgId) => request.get(inventoryUrl(`/reports/trace/${unitId}`), { params: withOrgId(orgId) }),
  getTrend: (days = 7, orgId) => request.get(inventoryUrl('/reports/trend'), { params: withOrgId(orgId, { days }) }),
}

const workbenchApi = {
  getOverview: (orgId) => request.get(inventoryUrl('/workbench/overview'), { params: withOrgId(orgId) }),
  getSpace: (params = {}, orgId) => request.get(inventoryUrl('/workbench/space'), { params: withOrgId(orgId, params) }),
  getControl: (orgId) => request.get(inventoryUrl('/workbench/control'), { params: withOrgId(orgId) }),
  getAnalytics: (orgId) => request.get(inventoryUrl('/workbench/analytics'), { params: withOrgId(orgId) }),
}

const statisticsApi = reportApi

const preInboundApi = {
  getSummary: (orgId) => request.get(inventoryUrl('/pre-inbound/summary'), { params: withOrgId(orgId) }),
  getItems: (params = {}) => request.get(inventoryUrl('/pre-inbound/items'), { params }),
  getItem: (id, orgId) => request.get(inventoryUrl(`/pre-inbound/items/${id}`), { params: withOrgId(orgId) }),
  createItem: (data, orgId) => request.post(inventoryUrl('/pre-inbound/items'), data, { params: withOrgId(orgId) }),
  updateItem: (id, data, orgId) => request.put(inventoryUrl(`/pre-inbound/items/${id}`), data, { params: withOrgId(orgId) }),
  addNote: (id, note, orgId) => request.post(inventoryUrl(`/pre-inbound/items/${id}/notes`), { note }, { params: withOrgId(orgId) }),
  advanceStage: (id, stage, note, orgId) => request.post(inventoryUrl(`/pre-inbound/items/${id}/advance`), { stage, note }, { params: withOrgId(orgId) }),
  startInbound: (id, orgId) => request.post(inventoryUrl(`/pre-inbound/items/${id}/start-inbound`), {}, { params: withOrgId(orgId) }),
}

const twinApi = {
  getWarehouses: (orgId) => request.get(inventoryUrl('/twin/warehouses'), { params: withOrgId(orgId) }),
  createWarehouse: (data, orgId) => request.post(inventoryUrl('/twin/warehouses'), data, { params: withOrgId(orgId) }),
  updateWarehouse: (id, data, orgId) => request.put(inventoryUrl(`/twin/warehouses/${id}`), data, { params: withOrgId(orgId) }),
  getWarehouseLayout: (id, orgId) => request.get(inventoryUrl(`/twin/warehouses/${id}/layout`), { params: withOrgId(orgId) }),
  saveWarehouseLayout: (id, layoutJson, orgId) => request.put(inventoryUrl(`/twin/warehouses/${id}/layout`), { layoutJson }, { params: withOrgId(orgId) }),
  getWarehouseZones: (params = {}, orgId) => request.get(inventoryUrl('/twin/warehouse-zones'), { params: withOrgId(orgId, params) }),
  createWarehouseZone: (data, orgId) => request.post(inventoryUrl('/twin/warehouse-zones'), data, { params: withOrgId(orgId) }),
  updateWarehouseZone: (id, data, orgId) => request.put(inventoryUrl(`/twin/warehouse-zones/${id}`), data, { params: withOrgId(orgId) }),
  getRackTemplates: (orgId) => request.get(inventoryUrl('/twin/rack-templates'), { params: withOrgId(orgId) }),
  createRackTemplate: (data, orgId) => request.post(inventoryUrl('/twin/rack-templates'), data, { params: withOrgId(orgId) }),
  updateRackTemplate: (id, data, orgId) => request.put(inventoryUrl(`/twin/rack-templates/${id}`), data, { params: withOrgId(orgId) }),
  getRackInstances: (params = {}, orgId) => request.get(inventoryUrl('/twin/rack-instances'), { params: withOrgId(orgId, params) }),
  createRackInstance: (data, orgId) => request.post(inventoryUrl('/twin/rack-instances'), data, { params: withOrgId(orgId) }),
  updateRackInstance: (id, data, orgId) => request.put(inventoryUrl(`/twin/rack-instances/${id}`), data, { params: withOrgId(orgId) }),
  getLocations: (params = {}, orgId) => request.get(inventoryUrl('/twin/locations'), { params: withOrgId(orgId, params) }),
  createLocation: (data, orgId) => request.post(inventoryUrl('/twin/locations'), data, { params: withOrgId(orgId) }),
  updateLocation: (id, data, orgId) => request.put(inventoryUrl(`/twin/locations/${id}`), data, { params: withOrgId(orgId) }),
  batchGenerateLocations: (data, orgId) => request.post(inventoryUrl('/twin/locations/batch-generate'), data, { params: withOrgId(orgId) }),
  batchGenerateLocationQrs: (warehouseId, codes, orgId) => request.post(inventoryUrl('/twin/locations/batch-generate-qr'), { warehouseId, codes }, { params: withOrgId(orgId) }),
  getItemShapes: (orgId) => request.get(inventoryUrl('/twin/item-shapes'), { params: withOrgId(orgId) }),
  createItemShape: (data, orgId) => request.post(inventoryUrl('/twin/item-shapes'), data, { params: withOrgId(orgId) }),
  updateItemShape: (id, data, orgId) => request.put(inventoryUrl(`/twin/item-shapes/${id}`), data, { params: withOrgId(orgId) }),
  getObjects: (params = {}, orgId) => request.get(inventoryUrl('/twin/objects'), { params: withOrgId(orgId, params) }),
  createObject: (data, orgId) => request.post(inventoryUrl('/twin/objects'), data, { params: withOrgId(orgId) }),
  updateObject: (id, data, orgId) => request.put(inventoryUrl(`/twin/objects/${id}`), data, { params: withOrgId(orgId) }),
  scanBind: (data, orgId) => request.post(inventoryUrl('/twin/bindings/scan'), data, { params: withOrgId(orgId) }),
  moveBinding: (data, orgId) => request.post(inventoryUrl('/twin/bindings/move'), data, { params: withOrgId(orgId) }),
  unbindBinding: (data, orgId) => request.post(inventoryUrl('/twin/bindings/unbind'), data, { params: withOrgId(orgId) }),
  getScene: (warehouseId, orgId) => request.get(inventoryUrl(`/twin/scene/${warehouseId}`), { params: withOrgId(orgId) }),
  getEvents: (params = {}, orgId) => request.get(inventoryUrl('/twin/events'), { params: withOrgId(orgId, params) }),
}

export default {
  batch: batchApi,
  unit: unitApi,
  warehouse: warehouseApi,
  location: locationApi,
  request: requestApi,
  statistics: statisticsApi,
  alert: alertApi,
  stocktaking: stocktakingApi,
  report: reportApi,
  workbench: workbenchApi,
  preInbound: preInboundApi,
  twin: twinApi,
}

export {
  batchApi,
  unitApi,
  warehouseApi,
  locationApi,
  requestApi,
  alertApi,
  stocktakingApi,
  reportApi,
  workbenchApi,
  statisticsApi,
  preInboundApi,
  twinApi,
}
