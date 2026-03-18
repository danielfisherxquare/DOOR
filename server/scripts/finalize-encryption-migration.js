/**
 * PII 加密收尾迁移
 * =================
 *
 * 在存量数据迁移完成后执行
 * - 为 lottery_lists 创建基于 id_number_hash 的唯一约束
 * - 清理临时索引
 *
 * 用法：
 *   node scripts/finalize-encryption-migration.js
 */

import knex from 'knex';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// 加载环境变量
config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

// ============================================================================
// 数据库连接
// ============================================================================

function createDbConnection() {
    return knex({
        client: 'pg',
        connection: process.env.DATABASE_URL || {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432', 10),
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'door',
        },
        pool: { min: 1, max: 2 },
    });
}

// ============================================================================
// 收尾逻辑
// ============================================================================

async function finalize(db) {
    console.log('\n[收尾] 检查数据状态...');

    // 检查是否还有未加密的 id_number
    const recordsPlaintext = await db('records')
        .whereNotNull('id_number')
        .whereRaw("id_number NOT LIKE 'enc:v1:%'")
        .count('* as count')
        .first();

    const lotteryPlaintext = await db('lottery_lists')
        .whereNotNull('id_number')
        .whereRaw("id_number NOT LIKE 'enc:v1:%'")
        .count('* as count')
        .first();

    if (parseInt(recordsPlaintext.count, 10) > 0) {
        console.warn(`[警告] records 表仍有 ${recordsPlaintext.count} 条未加密记录`);
    }

    if (parseInt(lotteryPlaintext.count, 10) > 0) {
        console.warn(`[警告] lottery_lists 表仍有 ${lotteryPlaintext.count} 条未加密记录`);
    }

    // 检查缺失 hash 的记录
    const missingHashRecords = await db('records')
        .whereNotNull('id_number')
        .whereNull('id_number_hash')
        .count('* as count')
        .first();

    const missingHashLottery = await db('lottery_lists')
        .whereNotNull('id_number')
        .whereNull('id_number_hash')
        .count('* as count')
        .first();

    if (parseInt(missingHashRecords.count, 10) > 0 || parseInt(missingHashLottery.count, 10) > 0) {
        console.error('[错误] 存在缺失 hash 的记录，请先运行 migrate-encryption.js');
        console.error(`  records: ${missingHashRecords.count}`);
        console.error(`  lottery_lists: ${missingHashLottery.count}`);
        process.exit(1);
    }

    console.log('[收尾] 数据检查通过');

    // 创建 lottery_lists 的唯一约束
    console.log('\n[收尾] 创建 lottery_lists 唯一约束...');

    try {
        // 先检查是否已存在
        const existingConstraint = await db.raw(`
            SELECT 1 FROM pg_constraint
            WHERE conname = 'lottery_lists_org_race_type_id_hash_unique'
        `);

        if (existingConstraint.rows.length === 0) {
            await db.raw(`
                CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS lottery_lists_org_race_type_id_hash_unique
                ON lottery_lists (org_id, race_id, list_type, id_number_hash)
                WHERE id_number_hash IS NOT NULL
            `);
            console.log('[收尾] 唯一约束创建成功 ✓');
        } else {
            console.log('[收尾] 唯一约束已存在，跳过');
        }
    } catch (error) {
        console.error('[收尾] 创建唯一约束失败:', error.message);
        throw error;
    }

    // 可选：删除原始 id_number 列（谨慎操作）
    // 这里不自动执行，需要手动确认
    console.log('\n[收尾] 完成');
    console.log('\n注意：原始 id_number 列仍保留（加密后数据）');
    console.log('如需完全删除，请手动执行：');
    console.log('  ALTER TABLE records DROP COLUMN id_number;');
    console.log('  ALTER TABLE lottery_lists DROP COLUMN id_number;');
}

// ============================================================================
// 主函数
// ============================================================================

async function main() {
    console.log('================================================');
    console.log('  PII 加密收尾迁移');
    console.log('================================================');
    console.log(`时间: ${new Date().toISOString()}`);
    console.log('================================================\n');

    const db = createDbConnection();

    try {
        await db.raw('SELECT 1');
        console.log('[数据库] 连接成功\n');

        await finalize(db);

    } catch (error) {
        console.error('\n[错误] 收尾失败:', error);
        throw error;
    } finally {
        await db.destroy();
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});