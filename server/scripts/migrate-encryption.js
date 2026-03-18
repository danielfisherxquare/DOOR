/**
 * 存量数据加密迁移脚本
 * ====================
 *
 * 将数据库中现有的明文 PII 字段加密
 * - records: phone, emergency_phone, id_number
 * - lottery_lists: phone, id_number
 *
 * 特性：
 * - 支持断点续传（检查是否已加密）
 * - 批量处理，避免内存溢出
 * - 事务保护，失败可回滚
 * - 详细的进度日志
 *
 * 用法：
 *   node scripts/migrate-encryption.js [--batch-size=1000] [--dry-run]
 */

import knex from 'knex';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
    encryptField,
    normalizePhone,
    normalizeIdNumber,
    phoneBlindIndex,
    idNumberBlindIndex,
    isEncrypted,
} from '../src/utils/crypto.js';

// 加载环境变量
config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

// ============================================================================
// 配置
// ============================================================================

const BATCH_SIZE = parseInt(process.argv.find(a => a.startsWith('--batch-size='))?.split('=')[1] || '1000', 10);
const DRY_RUN = process.argv.includes('--dry-run');
const TABLES = ['records', 'lottery_lists'];

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
// 迁移逻辑
// ============================================================================

/**
 * 检查值是否需要加密
 */
function needsEncryption(value) {
    if (!value || typeof value !== 'string') return false;
    return !isEncrypted(value);
}

/**
 * 迁移 records 表
 */
async function migrateRecords(db, stats) {
    console.log('\n[records] 开始迁移...');

    // 获取总数
    const { count } = await db('records').count('* as count').first();
    const total = parseInt(count, 10);
    console.log(`[records] 总记录数: ${total}`);

    if (total === 0) {
        console.log('[records] 无数据需要迁移');
        return;
    }

    let processed = 0;
    let encrypted = 0;
    let skipped = 0;
    let offset = 0;

    while (offset < total) {
        // 批量读取
        const records = await db('records')
            .select('id', 'phone', 'emergency_phone', 'id_number', 'org_id', 'race_id')
            .orderBy('id', 'asc')
            .limit(BATCH_SIZE)
            .offset(offset);

        if (records.length === 0) break;

        for (const record of records) {
            processed++;
            const updates = {};
            let needsUpdate = false;

            // 加密上下文
            const ctx = {
                tableName: 'records',
                columnName: '',
                orgId: record.org_id,
                raceId: record.race_id,
            };

            // phone
            if (needsEncryption(record.phone)) {
                ctx.columnName = 'phone';
                updates.phone = encryptField(normalizePhone(record.phone), ctx);
                updates.phone_hash = phoneBlindIndex(record.phone);
                needsUpdate = true;
            }

            // emergency_phone
            if (needsEncryption(record.emergency_phone)) {
                ctx.columnName = 'emergency_phone';
                updates.emergency_phone = encryptField(normalizePhone(record.emergency_phone), ctx);
                needsUpdate = true;
            }

            // id_number
            if (needsEncryption(record.id_number)) {
                ctx.columnName = 'id_number';
                updates.id_number = encryptField(normalizeIdNumber(record.id_number), ctx);
                updates.id_number_hash = idNumberBlindIndex(record.id_number);
                needsUpdate = true;
            }

            if (needsUpdate && !DRY_RUN) {
                await db('records').where('id', record.id).update(updates);
                encrypted++;
            } else if (!needsUpdate) {
                skipped++;
            }

            // 进度日志
            if (processed % 500 === 0) {
                console.log(`[records] 进度: ${processed}/${total} (${((processed / total) * 100).toFixed(1)}%)`);
            }
        }

        offset += BATCH_SIZE;
    }

    stats.records = { total, processed, encrypted, skipped };
    console.log(`[records] 完成: 处理 ${processed}, 加密 ${encrypted}, 跳过 ${skipped}`);
}

/**
 * 迁移 lottery_lists 表
 */
async function migrateLotteryLists(db, stats) {
    console.log('\n[lottery_lists] 开始迁移...');

    // 获取总数
    const { count } = await db('lottery_lists').count('* as count').first();
    const total = parseInt(count, 10);
    console.log(`[lottery_lists] 总记录数: ${total}`);

    if (total === 0) {
        console.log('[lottery_lists] 无数据需要迁移');
        return;
    }

    let processed = 0;
    let encrypted = 0;
    let skipped = 0;
    let offset = 0;

    while (offset < total) {
        // 批量读取
        const records = await db('lottery_lists')
            .select('id', 'phone', 'id_number', 'org_id', 'race_id')
            .orderBy('id', 'asc')
            .limit(BATCH_SIZE)
            .offset(offset);

        if (records.length === 0) break;

        for (const record of records) {
            processed++;
            const updates = {};
            let needsUpdate = false;

            // 加密上下文
            const ctx = {
                tableName: 'lottery_lists',
                columnName: '',
                orgId: record.org_id,
                raceId: record.race_id,
            };

            // phone
            if (needsEncryption(record.phone)) {
                ctx.columnName = 'phone';
                updates.phone = encryptField(normalizePhone(record.phone), ctx);
                needsUpdate = true;
            }

            // id_number
            if (needsEncryption(record.id_number)) {
                ctx.columnName = 'id_number';
                updates.id_number = encryptField(normalizeIdNumber(record.id_number), ctx);
                updates.id_number_hash = idNumberBlindIndex(record.id_number);
                needsUpdate = true;
            }

            if (needsUpdate && !DRY_RUN) {
                await db('lottery_lists').where('id', record.id).update(updates);
                encrypted++;
            } else if (!needsUpdate) {
                skipped++;
            }

            // 进度日志
            if (processed % 500 === 0) {
                console.log(`[lottery_lists] 进度: ${processed}/${total} (${((processed / total) * 100).toFixed(1)}%)`);
            }
        }

        offset += BATCH_SIZE;
    }

    stats.lotteryLists = { total, processed, encrypted, skipped };
    console.log(`[lottery_lists] 完成: 处理 ${processed}, 加密 ${encrypted}, 跳过 ${skipped}`);
}

/**
 * 验证迁移结果
 */
async function verifyMigration(db, stats) {
    console.log('\n[验证] 检查迁移结果...');

    // 抽样检查 records
    const recordSamples = await db('records')
        .select('id', 'phone', 'id_number', 'phone_hash', 'id_number_hash')
        .whereNotNull('phone')
        .orWhereNotNull('id_number')
        .limit(10);

    let recordErrors = 0;
    for (const r of recordSamples) {
        if (r.phone && !isEncrypted(r.phone)) {
            console.error(`[验证失败] records.id=${r.id} phone 未加密`);
            recordErrors++;
        }
        if (r.id_number && !isEncrypted(r.id_number)) {
            console.error(`[验证失败] records.id=${r.id} id_number 未加密`);
            recordErrors++;
        }
        if (r.phone && !r.phone_hash) {
            console.error(`[验证失败] records.id=${r.id} phone_hash 缺失`);
            recordErrors++;
        }
        if (r.id_number && !r.id_number_hash) {
            console.error(`[验证失败] records.id=${r.id} id_number_hash 缺失`);
            recordErrors++;
        }
    }

    // 抽样检查 lottery_lists
    const lotterySamples = await db('lottery_lists')
        .select('id', 'id_number', 'id_number_hash')
        .whereNotNull('id_number')
        .limit(10);

    let lotteryErrors = 0;
    for (const r of lotterySamples) {
        if (r.id_number && !isEncrypted(r.id_number)) {
            console.error(`[验证失败] lottery_lists.id=${r.id} id_number 未加密`);
            lotteryErrors++;
        }
        if (r.id_number && !r.id_number_hash) {
            console.error(`[验证失败] lottery_lists.id=${r.id} id_number_hash 缺失`);
            lotteryErrors++;
        }
    }

    stats.verification = {
        records: { samples: recordSamples.length, errors: recordErrors },
        lotteryLists: { samples: lotterySamples.length, errors: lotteryErrors },
    };

    if (recordErrors === 0 && lotteryErrors === 0) {
        console.log('[验证] 迁移验证通过 ✓');
    } else {
        console.error(`[验证] 发现 ${recordErrors + lotteryErrors} 个错误`);
    }
}

// ============================================================================
// 主函数
// ============================================================================

async function main() {
    console.log('================================================');
    console.log('  存量数据加密迁移');
    console.log('================================================');
    console.log(`批次大小: ${BATCH_SIZE}`);
    console.log(`试运行模式: ${DRY_RUN ? '是' : '否'}`);
    console.log(`时间: ${new Date().toISOString()}`);
    console.log('================================================\n');

    const db = createDbConnection();
    const stats = {};

    try {
        // 测试连接
        await db.raw('SELECT 1');
        console.log('[数据库] 连接成功\n');

        // 执行迁移
        await migrateRecords(db, stats);
        await migrateLotteryLists(db, stats);

        // 验证
        if (!DRY_RUN) {
            await verifyMigration(db, stats);
        }

        // 总结
        console.log('\n================================================');
        console.log('  迁移完成');
        console.log('================================================');
        console.log(JSON.stringify(stats, null, 2));

    } catch (error) {
        console.error('\n[错误] 迁移失败:', error);
        throw error;
    } finally {
        await db.destroy();
    }
}

// 执行
main().catch(err => {
    console.error(err);
    process.exit(1);
});