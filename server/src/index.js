import app from './app.js';
import { env } from './config/env.js';
import knex from './db/knex.js';

const server = app.listen(env.PORT, '0.0.0.0', () => {
    console.log(`Server started on 0.0.0.0:${env.PORT}`);
    console.log(`Public URL: ${env.PUBLIC_BASE_URL}`);
    console.log(`API URL: ${env.PUBLIC_BASE_URL}/api`);
    console.log(`Environment: ${env.NODE_ENV}`);
});

async function shutdown(signal) {
    console.log(`\nReceived ${signal}, shutting down gracefully...`);
    server.close(async () => {
        try {
            await knex.destroy();
            console.log('Database connection closed');
        } catch (err) {
            console.error('Failed to close database connection', err);
        }
        process.exit(0);
    });

    setTimeout(() => {
        console.error('Force exit after timeout (10s)');
        process.exit(1);
    }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
