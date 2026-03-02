import Knex from 'knex';
import { env } from '../config/env.js';

const knex = Knex({
    client: 'pg',
    connection: env.DATABASE_URL,
    pool: { min: 2, max: 10 },
    migrations: {
        directory: './src/db/migrations',
        tableName: 'knex_migrations',
    },
});

export default knex;
