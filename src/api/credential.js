import request from '../utils/request'

const BASE_PATHS = {
    admin: '/admin/credentials',
    app: '/app/credentials',
    ops: '/ops/credentials',
}

export function createCredentialApi(surface) {
    const basePath = BASE_PATHS[surface]
    if (!basePath) throw new Error(`Unsupported credential surface: ${surface}`)

    return {
        getAccessAreas: (raceId) => request.get(`${basePath}/access-areas/${raceId}`),
        createAccessArea: (raceId, data) => request.post(`${basePath}/access-areas/${raceId}`, data),
        updateAccessArea: (raceId, accessAreaId, data) => request.put(`${basePath}/access-areas/${raceId}/${accessAreaId}`, data),
        deleteAccessArea: (raceId, accessAreaId) => request.delete(`${basePath}/access-areas/${raceId}/${accessAreaId}`),

        getCategories: (raceId) => request.get(`${basePath}/categories/${raceId}`),
        createCategory: (raceId, data) => request.post(`${basePath}/categories/${raceId}`, data),
        updateCategory: (raceId, categoryId, data) => request.put(`${basePath}/categories/${raceId}/${categoryId}`, data),
        deleteCategory: (raceId, categoryId) => request.delete(`${basePath}/categories/${raceId}/${categoryId}`),

        getStyleTemplates: (raceId, options = {}) => request.get(`${basePath}/style-templates/${raceId}`, { params: options }),
        getStyleTemplate: (raceId, templateId) => request.get(`${basePath}/style-templates/${raceId}/${templateId}`),
        createStyleTemplate: (raceId, data) => request.post(`${basePath}/style-templates/${raceId}`, data),
        updateStyleTemplate: (raceId, templateId, data) => request.put(`${basePath}/style-templates/${raceId}/${templateId}`, data),
        deleteStyleTemplate: (raceId, templateId) => request.delete(`${basePath}/style-templates/${raceId}/${templateId}`),

        getRequests: (raceId, options = {}) => request.get(`${basePath}/requests/${raceId}`, { params: options }),
        getRequest: (raceId, requestId) => request.get(`${basePath}/requests/${raceId}/${requestId}`),
        createRequest: (raceId, data) => request.post(`${basePath}/requests/${raceId}`, data),
        reviewRequest: (raceId, requestId, data) => request.post(`${basePath}/requests/${raceId}/${requestId}/review`, data),

        getCredentials: (raceId, options = {}) => request.get(`${basePath}/credentials/${raceId}`, { params: options }),
        getCredential: (raceId, credentialId) => request.get(`${basePath}/credentials/${raceId}/${credentialId}`),
        resolveCredential: (qrPayload) => request.post(`${basePath}/scan/resolve`, { qrPayload }),
        voidCredential: (raceId, credentialId, data) => request.post(`${basePath}/credentials/${raceId}/${credentialId}/void`, data),
        issueCredential: (raceId, credentialId, data) => request.post(`${basePath}/credentials/${raceId}/${credentialId}/issue`, data),
        reissueCredential: (raceId, credentialId, data) => request.post(`${basePath}/credentials/${raceId}/${credentialId}/reissue`, data),
        getCredentialStats: (raceId) => request.get(`${basePath}/stats/${raceId}`),
    }
}

export const adminCredentialApi = createCredentialApi('admin')
export const appCredentialApi = createCredentialApi('app')
export const opsCredentialApi = createCredentialApi('ops')
