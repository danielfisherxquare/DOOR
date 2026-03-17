import request from '../utils/request'

const credentialApi = {
    getAccessAreas: (raceId) => request.get(`/credential/access-areas/${raceId}`),
    createAccessArea: (raceId, data) => request.post(`/credential/access-areas/${raceId}`, data),
    updateAccessArea: (raceId, accessAreaId, data) => request.put(`/credential/access-areas/${raceId}/${accessAreaId}`, data),
    deleteAccessArea: (raceId, accessAreaId) => request.delete(`/credential/access-areas/${raceId}/${accessAreaId}`),

    getCategories: (raceId) => request.get(`/credential/categories/${raceId}`),
    createCategory: (raceId, data) => request.post(`/credential/categories/${raceId}`, data),
    updateCategory: (raceId, categoryId, data) => request.put(`/credential/categories/${raceId}/${categoryId}`, data),
    deleteCategory: (raceId, categoryId) => request.delete(`/credential/categories/${raceId}/${categoryId}`),

    getStyleTemplates: (raceId, options = {}) => request.get(`/credential/style-templates/${raceId}`, { params: options }),
    getStyleTemplate: (raceId, templateId) => request.get(`/credential/style-templates/${raceId}/${templateId}`),
    createStyleTemplate: (raceId, data) => request.post(`/credential/style-templates/${raceId}`, data),
    updateStyleTemplate: (raceId, templateId, data) => request.put(`/credential/style-templates/${raceId}/${templateId}`, data),
    deleteStyleTemplate: (raceId, templateId) => request.delete(`/credential/style-templates/${raceId}/${templateId}`),

    getRequests: (raceId, options = {}) => request.get(`/credential/requests/${raceId}`, { params: options }),
    getRequest: (raceId, requestId) => request.get(`/credential/requests/${raceId}/${requestId}`),
    createRequest: (raceId, data) => request.post(`/credential/requests/${raceId}`, data),
    reviewRequest: (raceId, requestId, data) => request.post(`/credential/requests/${raceId}/${requestId}/review`, data),

    getCredentials: (raceId, options = {}) => request.get(`/credential/credentials/${raceId}`, { params: options }),
    getCredential: (raceId, credentialId) => request.get(`/credential/credentials/${raceId}/${credentialId}`),
    resolveCredential: (qrPayload) => request.post('/credential/scan/resolve', { qrPayload }),
    voidCredential: (raceId, credentialId, data) => request.post(`/credential/credentials/${raceId}/${credentialId}/void`, data),
    reissueCredential: (raceId, credentialId, data) => request.post(`/credential/credentials/${raceId}/${credentialId}/reissue`, data),
    getCredentialStats: (raceId) => request.get(`/credential/stats/${raceId}`),
}

export default credentialApi
