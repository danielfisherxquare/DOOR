import request from '../utils/request'
import { resolveSurfacePrefix } from '../utils/surfaceApi'

function getBasePath() {
    return resolveSurfacePrefix({
        admin: '/admin/credentials',
        ops: '/ops/credentials',
        app: '/app/credentials',
    }, 'admin')
}

const credentialApi = {
    getAccessAreas: (raceId) => request.get(`${getBasePath()}/access-areas/${raceId}`),
    createAccessArea: (raceId, data) => request.post(`${getBasePath()}/access-areas/${raceId}`, data),
    updateAccessArea: (raceId, accessAreaId, data) => request.put(`${getBasePath()}/access-areas/${raceId}/${accessAreaId}`, data),
    deleteAccessArea: (raceId, accessAreaId) => request.delete(`${getBasePath()}/access-areas/${raceId}/${accessAreaId}`),

    getCategories: (raceId) => request.get(`${getBasePath()}/categories/${raceId}`),
    createCategory: (raceId, data) => request.post(`${getBasePath()}/categories/${raceId}`, data),
    updateCategory: (raceId, categoryId, data) => request.put(`${getBasePath()}/categories/${raceId}/${categoryId}`, data),
    deleteCategory: (raceId, categoryId) => request.delete(`${getBasePath()}/categories/${raceId}/${categoryId}`),

    getStyleTemplates: (raceId, options = {}) => request.get(`${getBasePath()}/style-templates/${raceId}`, { params: options }),
    getStyleTemplate: (raceId, templateId) => request.get(`${getBasePath()}/style-templates/${raceId}/${templateId}`),
    createStyleTemplate: (raceId, data) => request.post(`${getBasePath()}/style-templates/${raceId}`, data),
    updateStyleTemplate: (raceId, templateId, data) => request.put(`${getBasePath()}/style-templates/${raceId}/${templateId}`, data),
    deleteStyleTemplate: (raceId, templateId) => request.delete(`${getBasePath()}/style-templates/${raceId}/${templateId}`),

    getRequests: (raceId, options = {}) => request.get(`${getBasePath()}/requests/${raceId}`, { params: options }),
    getRequest: (raceId, requestId) => request.get(`${getBasePath()}/requests/${raceId}/${requestId}`),
    createRequest: (raceId, data) => request.post(`${getBasePath()}/requests/${raceId}`, data),
    reviewRequest: (raceId, requestId, data) => request.post(`${getBasePath()}/requests/${raceId}/${requestId}/review`, data),

    getCredentials: (raceId, options = {}) => request.get(`${getBasePath()}/credentials/${raceId}`, { params: options }),
    getCredential: (raceId, credentialId) => request.get(`${getBasePath()}/credentials/${raceId}/${credentialId}`),
    resolveCredential: (qrPayload) => request.post(`${getBasePath()}/scan/resolve`, { qrPayload }),
    voidCredential: (raceId, credentialId, data) => request.post(`${getBasePath()}/credentials/${raceId}/${credentialId}/void`, data),
    issueCredential: (raceId, credentialId, data) => request.post(`${getBasePath()}/credentials/${raceId}/${credentialId}/issue`, data),
    reissueCredential: (raceId, credentialId, data) => request.post(`${getBasePath()}/credentials/${raceId}/${credentialId}/reissue`, data),
    getCredentialStats: (raceId) => request.get(`${getBasePath()}/stats/${raceId}`),
}

export default credentialApi
