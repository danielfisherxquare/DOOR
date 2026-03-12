import request from '../utils/request';

export const interviewApi = {
    list: (params = {}) => request.get('/interview', { params }),
    getById: (id) => request.get(`/interview/${id}`),
    create: (data) => request.post('/interview', data),
    update: (id, data) => request.put(`/interview/${id}`, data),
    delete: (id) => request.delete(`/interview/${id}`),
    compare: (ids) => request.post('/interview/compare', { ids }),
    getCriteria: () => request.get('/interview/criteria')
};

export default interviewApi;
