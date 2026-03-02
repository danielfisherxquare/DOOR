import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// 设置测试 DATABASE_URL
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
process.env.DATABASE_URL = DATABASE_URL;

// 动态导入以确保环境变量已设置
const { default: knex } = await import('../src/db/knex.js');
const jobRepo = await import('../src/modules/jobs/job.repository.js');

const TEST_ORG_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000099';
const WORKER_ID = 'test-worker-1';
const LEASE_MS = 60_000;

describe('Job Repository', () => {
    before(async () => {
        // 执行 migration
        await knex.migrate.latest();
    });

    beforeEach(async () => {
        // 每个测试前清空 jobs 表
        await knex('jobs').del();
    });

    after(async () => {
        await knex('jobs').del();
        await knex.destroy();
    });

    describe('enqueue', () => {
        it('应该成功入队一个 Job', async () => {
            const job = await jobRepo.enqueue(
                TEST_ORG_ID, 'echo', { msg: 'hello' }, 'key-1', TEST_USER_ID
            );
            assert.ok(job.id);
            assert.equal(job.orgId, TEST_ORG_ID);
            assert.equal(job.type, 'echo');
            assert.equal(job.status, 'queued');
            assert.equal(job.progress, 0);
            assert.deepEqual(job.payload, { msg: 'hello' });
        });

        it('幂等去重：同 key 入队返回旧 Job', async () => {
            const job1 = await jobRepo.enqueue(
                TEST_ORG_ID, 'echo', { v: 1 }, 'dup-key', TEST_USER_ID
            );
            const job2 = await jobRepo.enqueue(
                TEST_ORG_ID, 'echo', { v: 2 }, 'dup-key', TEST_USER_ID
            );
            assert.equal(job1.id, job2.id);
        });

        it('不同 key 可以同时入队', async () => {
            const job1 = await jobRepo.enqueue(
                TEST_ORG_ID, 'echo', {}, 'key-a', TEST_USER_ID
            );
            const job2 = await jobRepo.enqueue(
                TEST_ORG_ID, 'echo', {}, 'key-b', TEST_USER_ID
            );
            assert.notEqual(job1.id, job2.id);
        });
    });

    describe('claim', () => {
        it('应该领取一个 queued Job', async () => {
            const enqueued = await jobRepo.enqueue(
                TEST_ORG_ID, 'echo', {}, 'claim-1', TEST_USER_ID
            );
            const claimed = await jobRepo.claim(WORKER_ID, LEASE_MS);
            assert.ok(claimed);
            assert.equal(claimed.id, enqueued.id);
            assert.equal(claimed.status, 'running');
            assert.equal(claimed.leaseOwner, WORKER_ID);
            assert.equal(claimed.attemptCount, 1);
        });

        it('无 queued Job 时返回 null', async () => {
            const claimed = await jobRepo.claim(WORKER_ID, LEASE_MS);
            assert.equal(claimed, null);
        });
    });

    describe('enqueue → claim → heartbeat → succeed', () => {
        it('完整成功流程', async () => {
            // 入队
            const job = await jobRepo.enqueue(
                TEST_ORG_ID, 'echo', { data: 42 }, 'flow-1', TEST_USER_ID
            );

            // 领取
            const claimed = await jobRepo.claim(WORKER_ID, LEASE_MS);
            assert.equal(claimed.id, job.id);
            assert.equal(claimed.status, 'running');

            // 心跳
            const hb = await jobRepo.heartbeat(claimed.id, WORKER_ID, LEASE_MS, 50, '处理中');
            assert.equal(hb.progress, 50);
            assert.equal(hb.message, '处理中');

            // 成功
            const succeeded = await jobRepo.succeed(claimed.id, WORKER_ID, { answer: 42 });
            assert.equal(succeeded.status, 'succeeded');
            assert.equal(succeeded.progress, 100);
            assert.deepEqual(succeeded.result, { answer: 42 });
            assert.ok(succeeded.finishedAt);
        });
    });

    describe('enqueue → claim → fail', () => {
        it('完整失败流程', async () => {
            const job = await jobRepo.enqueue(
                TEST_ORG_ID, 'echo', {}, 'fail-1', TEST_USER_ID
            );
            const claimed = await jobRepo.claim(WORKER_ID, LEASE_MS);

            const failed = await jobRepo.fail(claimed.id, WORKER_ID, {
                code: 'TEST_ERROR', message: 'Something went wrong',
            });
            assert.equal(failed.status, 'failed');
            assert.deepEqual(failed.error, {
                code: 'TEST_ERROR', message: 'Something went wrong',
            });
            assert.ok(failed.finishedAt);
        });
    });

    describe('recoverExpired', () => {
        it('应该回收过期 running Job', async () => {
            // 入队并领取
            await jobRepo.enqueue(TEST_ORG_ID, 'echo', {}, 'expire-1', TEST_USER_ID);
            const claimed = await jobRepo.claim(WORKER_ID, 1); // 1ms lease → 立即过期

            // 等待 lease 过期
            await new Promise(r => setTimeout(r, 50));

            const count = await jobRepo.recoverExpired();
            assert.equal(count, 1);

            // 验证 Job 状态
            const job = await jobRepo.findById(claimed.id);
            assert.equal(job.status, 'failed');
            assert.deepEqual(job.error, {
                code: 'LEASE_EXPIRED', message: 'Worker lease expired',
            });
        });
    });

    describe('findById / findByOrgAndId', () => {
        it('按 ID 查询', async () => {
            const enqueued = await jobRepo.enqueue(
                TEST_ORG_ID, 'echo', {}, 'find-1', TEST_USER_ID
            );
            const found = await jobRepo.findById(enqueued.id);
            assert.equal(found.id, enqueued.id);
        });

        it('按组织+ID 查询', async () => {
            const enqueued = await jobRepo.enqueue(
                TEST_ORG_ID, 'echo', {}, 'find-2', TEST_USER_ID
            );
            const found = await jobRepo.findByOrgAndId(TEST_ORG_ID, enqueued.id);
            assert.equal(found.id, enqueued.id);

            const notFound = await jobRepo.findByOrgAndId(
                '00000000-0000-0000-0000-000000000002', enqueued.id
            );
            assert.equal(notFound, null);
        });
    });
});
