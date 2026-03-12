const API_BASE = '/api/interview';

export const interviewApi = {
    async list(options = {}) {
        const params = new URLSearchParams();
        if (options.limit) params.append('limit', options.limit);
        if (options.offset) params.append('offset', options.offset);
        if (options.orderBy) params.append('orderBy', options.orderBy);
        if (options.orderDir) params.append('orderDir', options.orderDir);
        
        const query = params.toString();
        const res = await fetch(`${API_BASE}${query ? '?' + query : ''}`);
        return res.json();
    },

    async getById(id) {
        const res = await fetch(`${API_BASE}/${id}`);
        return res.json();
    },

    async create(data) {
        const res = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },

    async update(id, data) {
        const res = await fetch(`${API_BASE}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },

    async delete(id) {
        const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
        return res.json();
    },

    async compare(ids) {
        const res = await fetch(`${API_BASE}/compare`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids })
        });
        return res.json();
    },

    async getCriteria() {
        const res = await fetch(`${API_BASE}/criteria`);
        return res.json();
    }
};

export default interviewApi;