import app from './app.js';
import { env } from './config/env.js';
import knex from './db/knex.js';

const server = app.listen(env.PORT, () => {
    console.log(`🚀 服务器已启动: http://localhost:${env.PORT}`);
    console.log(`📡 API 地址: http://localhost:${env.PORT}/api`);
    console.log(`🌍 环境: ${env.NODE_ENV}`);
});

// ── Graceful Shutdown ───────────────────────────────────
async function shutdown(signal) {
    console.log(`\n⏳ 收到 ${signal}，正在优雅关闭…`);
    server.close(async () => {
        try {
            await knex.destroy();
            console.log('✅ 数据库连接已关闭');
        } catch (err) {
            console.error('❌ 关闭数据库连接失败:', err);
        }
        process.exit(0);
    });

    // 超时强制退出
    setTimeout(() => {
        console.error('⚠️ 强制退出（超时 10 秒）');
        process.exit(1);
    }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
