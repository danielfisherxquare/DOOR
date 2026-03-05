/**
 * Knexfile — 用于 CLI 迁移命令
 * 使用方法: npx knex migrate:latest --knexfile knexfile.js
 */

export default {
    client: 'pg',
    connection: process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door',
    pool: { min: 2, max: 10 },
    migrations: {
        directory: './src/db/migrations',
        tableName: 'knex_migrations',
    },
};
