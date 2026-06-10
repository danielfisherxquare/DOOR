import request from '../utils/request'

function resolveSurface(surface) {
  if (surface === 'admin') return 'admin'
  if (surface === 'ops') return 'ops'
  return 'app'
}

function basePath(surface) {
  return '/' + resolveSurface(surface) + '/design-requests'
}

const designRequestApi = {
  getTemplates: (surface, params = {}) => request.get(basePath(surface) + '/templates', { params }),
  createTemplate: (surface, data) => request.post(basePath(surface) + '/templates', data),
  createTemplateFromRequest: (surface, requestId, data = {}) => (
    request.post(basePath(surface) + '/templates/from-request/' + encodeURIComponent(requestId), data)
  ),
  getRequests: (surface, params = {}) => request.get(basePath(surface) + '/requests', { params }),
  getRequest: (surface, requestId) => request.get(basePath(surface) + '/requests/' + encodeURIComponent(requestId)),
  createRequest: (surface, data) => request.post(basePath(surface) + '/requests', data),
  reviewRequest: (surface, requestId, data) => (
    request.post(basePath(surface) + '/requests/' + encodeURIComponent(requestId) + '/review', data)
  ),
  startDesign: (surface, requestId) => request.post(basePath(surface) + '/requests/' + encodeURIComponent(requestId) + '/start'),
  updateProgress: (surface, requestId, data) => (
    request.post(basePath(surface) + '/requests/' + encodeURIComponent(requestId) + '/progress', data)
  ),
  addAsset: (surface, requestId, data) => request.post(basePath(surface) + '/requests/' + encodeURIComponent(requestId) + '/assets', data),
  getStats: (surface, params = {}) => request.get(basePath(surface) + '/stats', { params }),
  previewImport: (surface, formData) => request.post(basePath(surface) + '/imports/preview', formData),
  getImports: (surface, params = {}) => request.get(basePath(surface) + '/imports', { params }),
  getImport: (surface, importId) => request.get(basePath(surface) + '/imports/' + encodeURIComponent(importId)),
  updateImportItem: (surface, importId, itemId, data) => (
    request.patch(basePath(surface) + '/imports/' + encodeURIComponent(importId) + '/items/' + encodeURIComponent(itemId), data)
  ),
  commitImport: (surface, importId, data) => request.post(basePath(surface) + '/imports/' + encodeURIComponent(importId) + '/commit', data),
  getExports: (surface, params = {}) => request.get(basePath(surface) + '/collaboration-exports', { params }),
  createExport: (surface, data) => request.post(basePath(surface) + '/collaboration-exports', data),
  downloadExport: (surface, exportId) => (
    request.get(basePath(surface) + '/collaboration-exports/' + encodeURIComponent(exportId) + '/download', { responseType: 'blob' })
  ),
}

export default designRequestApi
