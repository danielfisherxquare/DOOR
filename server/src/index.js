import app from './app.js';
import { env } from './config/env.js';
import knex from './db/knex.js';
import { verifyEncryptionKeys } from './utils/key-guard.js';

// ── 启动前验证加密密钥一致性 ──────────────────────────────────
try {
  await verifyEncryptionKeys(knex);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const server = app.listen(env.PORT, '0.0.0.0', () => {
    console.log(`Server started on 0.0.0.0:${env.PORT}`);
    console.log(`Public URL: ${env.PUBLIC_BASE_URL}`);
    console.log(`API URL: ${env.PUBLIC_BASE_URL}/api`);
    console.log(`Environment: ${env.NODE_ENV}`);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${env.PORT} is already in use.`);
        process.exit(1);
    } else {
        console.error('Server error:', err);
    }
});

// Track all active connections to forcefully close them if they hang
const connections = new Set();
server.on('connection', (connection) => {
    connections.add(connection);
    connection.on('close', () => {
        connections.delete(connection);
    });
});

async function shutdown(signal) {
    console.log(`\nReceived ${signal}, shutting down gracefully...`);
    
    // Forcibly close lingering connections
    for (const connection of connections) {
        connection.destroy();
    }

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
        console.error('Force exit after timeout (5s)');
        process.exit(1);
    }, 5000).unref();
}

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    shutdown('unhandledRejection');
});

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
