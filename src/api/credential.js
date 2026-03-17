import request from '../utils/request'

/**
 * 证件模块 API 客户端
 */

const credentialApi = {
    // ========================================================================
    // Credential Zones (分区管理)
    // ========================================================================
    
    /**
     * 获取分区列表
     */
    getZones: (raceId) => request.get(`/credential/zones/${raceId}`),
    
    /**
     * 创建分区
     */
    createZone: (raceId, data) => request.post(`/credential/zones/${raceId}`, data),
    
    /**
     * 更新分区
     */
    updateZone: (raceId, zoneId, data) => request.put(`/credential/zones/${raceId}/${zoneId}`, data),
    
    /**
     * 删除分区
     */
    deleteZone: (raceId, zoneId) => request.delete(`/credential/zones/${raceId}/${zoneId}`),
    
    // ========================================================================
    // Credential Role Templates (岗位模板)
    // ========================================================================
    
    /**
     * 获取岗位模板列表
     */
    getRoleTemplates: (raceId) => request.get(`/credential/role-templates/${raceId}`),
    
    /**
     * 创建岗位模板
     */
    createRoleTemplate: (raceId, data) => request.post(`/credential/role-templates/${raceId}`, data),
    
    /**
     * 更新岗位模板
     */
    updateRoleTemplate: (raceId, templateId, data) => request.put(`/credential/role-templates/${raceId}/${templateId}`, data),
    
    /**
     * 删除岗位模板
     */
    deleteRoleTemplate: (raceId, templateId) => request.delete(`/credential/role-templates/${raceId}/${templateId}`),
    
    // ========================================================================
    // Credential Style Templates (证件样式模板)
    // ========================================================================
    
    /**
     * 获取样式模板列表
     */
    getStyleTemplates: (raceId, options = {}) => request.get(`/credential/style-templates/${raceId}`, { params: options }),
    
    /**
     * 获取单个样式模板详情
     */
    getStyleTemplate: (raceId, templateId) => request.get(`/credential/style-templates/${raceId}/${templateId}`),
    
    /**
     * 创建样式模板
     */
    createStyleTemplate: (raceId, data) => request.post(`/credential/style-templates/${raceId}`, data),
    
    /**
     * 更新样式模板
     */
    updateStyleTemplate: (raceId, templateId, data) => request.put(`/credential/style-templates/${raceId}/${templateId}`, data),
    
    /**
     * 删除样式模板
     */
    deleteStyleTemplate: (raceId, templateId) => request.delete(`/credential/style-templates/${raceId}/${templateId}`),
    
    // ========================================================================
    // Credential Applications (证件申请)
    // ========================================================================
    
    /**
     * 获取申请列表 (管理员)
     */
    getApplications: (raceId, options = {}) => request.get(`/credential/applications/${raceId}`, { params: options }),
    
    /**
     * 获取单个申请详情
     */
    getApplication: (raceId, applicationId) => request.get(`/credential/applications/${raceId}/${applicationId}`),
    
    /**
     * 创建申请
     */
    createApplication: (raceId, data) => request.post(`/credential/applications/${raceId}`, data),
    
    /**
     * 提交申请
     */
    submitApplication: (raceId, applicationId) => request.post(`/credential/applications/${raceId}/${applicationId}/submit`),
    
    /**
     * 审核申请 (管理员)
     */
    reviewApplication: (raceId, applicationId, data) => request.post(`/credential/applications/${raceId}/${applicationId}/review`, data),
    
    // ========================================================================
    // Credential Credentials (证件实例)
    // ========================================================================
    
    /**
     * 获取证件列表 (管理员)
     */
    getCredentials: (raceId, options = {}) => request.get(`/credential/credentials/${raceId}`, { params: options }),
    
    /**
     * 获取单个证件详情
     */
    getCredential: (raceId, credentialId) => request.get(`/credential/credentials/${raceId}/${credentialId}`),
    
    /**
     * 扫码解析证件
     */
    resolveCredential: (qrPayload) => request.post('/credential/scan/resolve', { qrPayload }),
    
    /**
     * 作废证件 (管理员)
     */
    voidCredential: (raceId, credentialId, data) => request.post(`/credential/credentials/${raceId}/${credentialId}/void`, data),
    
    /**
     * 补打证件 (管理员)
     */
    reissueCredential: (raceId, credentialId, data) => request.post(`/credential/credentials/${raceId}/${credentialId}/reissue`, data),
    
    // ========================================================================
    // Credential Stats (统计)
    // ========================================================================
    
    /**
     * 获取证件统计 (管理员)
     */
    getCredentialStats: (raceId) => request.get(`/credential/stats/${raceId}`),
}

export default credentialApi
