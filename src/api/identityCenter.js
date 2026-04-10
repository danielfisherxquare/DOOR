import request from '../utils/request'

const identityCenterApi = {
  getSummary: (params) => request.get('/admin/identity-center/summary', { params }),
  getAccounts: (params) => request.get('/admin/identity-center/accounts', { params }),
  getModuleMatrix: (params) => request.get('/admin/identity-center/module-matrix', { params }),
  saveModuleMatrix: (params, updates) => request.put('/admin/identity-center/module-matrix', { updates }, { params }),
  getOrgRaceMatrix: (params) => request.get('/admin/identity-center/org-race-matrix', { params }),
  saveOrgRaceMatrix: (params, permissions) => request.put('/admin/identity-center/org-race-matrix', { permissions }, { params }),
  getUserRaceMatrix: (params) => request.get('/admin/identity-center/user-race-matrix', { params }),
  saveUserRaceMatrix: (params, updates) => request.put('/admin/identity-center/user-race-matrix', { updates }, { params }),
}

export default identityCenterApi
