import knex from '../../db/knex.js';

const TABLE = 'interviews';

export const InterviewRepository = {
    async findAll(options = {}) {
        const { limit = 50, offset = 0, orderBy = 'created_at', orderDir = 'desc' } = options;
        
        return knex(TABLE)
            .select('*')
            .orderBy(orderBy, orderDir)
            .limit(limit)
            .offset(offset);
    },

    async findById(id) {
        const result = await knex(TABLE).where({ id }).first();
        return result || null;
    },

    async create(data) {
        const [id] = await knex(TABLE).insert(data).returning('id');
        return this.findById(id.id || id);
    },

    async update(id, data) {
        await knex(TABLE)
            .where({ id })
            .update({
                ...data,
                updated_at: knex.fn.now()
            });
        return this.findById(id);
    },

    async delete(id) {
        const deleted = await this.findById(id);
        if (!deleted) return null;
        await knex(TABLE).where({ id }).del();
        return deleted;
    },

    async count() {
        const result = await knex(TABLE).count('* as count').first();
        return result.count;
    },

    async findByIds(ids) {
        if (!ids || ids.length === 0) return [];
        return knex(TABLE).whereIn('id', ids);
    }
};

export default InterviewRepository;