/**
 * Mapper 单元测试 — 纯逻辑，无需 PG 连接
 * 覆盖 auth / races / records 三个 mapper 的双向转换
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { orgMapper, userMapper, refreshTokenMapper } from '../src/db/mappers/auth.js';
import { raceMapper } from '../src/db/mappers/races.js';
import { recordMapper } from '../src/db/mappers/records.js';

// ═══════════════════════════════════════════════════════
// Auth Mapper
// ═══════════════════════════════════════════════════════

describe('Auth Mapper', () => {
    describe('orgMapper', () => {
        it('fromDbRow 正确转换', () => {
            const row = { id: 'uuid-1', name: '测试组织', slug: 'test-org', created_at: '2026-01-01', updated_at: '2026-01-02' };
            const result = orgMapper.fromDbRow(row);
            assert.equal(result.id, 'uuid-1');
            assert.equal(result.name, '测试组织');
            assert.equal(result.slug, 'test-org');
            assert.equal(result.createdAt, '2026-01-01');
            assert.equal(result.updatedAt, '2026-01-02');
        });

        it('fromDbRow null 返回 null', () => {
            assert.equal(orgMapper.fromDbRow(null), null);
        });

        it('toDbInsert 正确转换', () => {
            const data = { name: '测试组织', slug: 'test-org' };
            const result = orgMapper.toDbInsert(data);
            assert.equal(result.name, '测试组织');
            assert.equal(result.slug, 'test-org');
        });
    });

    describe('userMapper', () => {
        const dbRow = {
            id: 'u-1', org_id: 'o-1', username: 'admin', email: 'admin@test.com',
            password_hash: '$2a$10$hash', role: 'owner', avatar: null,
            email_verified: false, created_at: '2026-01-01', updated_at: '2026-01-02',
        };

        it('fromDbRow 正确转换 snake → camel', () => {
            const result = userMapper.fromDbRow(dbRow);
            assert.equal(result.orgId, 'o-1');
            assert.equal(result.passwordHash, '$2a$10$hash');
            assert.equal(result.emailVerified, false);
        });

        it('toApiResponse 不暴露 passwordHash', () => {
            const result = userMapper.toApiResponse(dbRow);
            assert.equal(result.username, 'admin');
            assert.equal(result.passwordHash, undefined, 'passwordHash 不应出现在 API 响应中');
        });

        it('toDbInsert 正确转换 camel → snake', () => {
            const data = { orgId: 'o-1', username: 'test', email: 'test@test.com', passwordHash: 'hash', role: 'admin' };
            const result = userMapper.toDbInsert(data);
            assert.equal(result.org_id, 'o-1');
            assert.equal(result.password_hash, 'hash');
        });
    });

    describe('refreshTokenMapper', () => {
        it('fromDbRow 正确转换', () => {
            const row = { id: 'rt-1', user_id: 'u-1', token_hash: 'hash', expires_at: '2026-02-01', created_at: '2026-01-01' };
            const result = refreshTokenMapper.fromDbRow(row);
            assert.equal(result.userId, 'u-1');
            assert.equal(result.tokenHash, 'hash');
        });

        it('toDbInsert 正确转换', () => {
            const data = { userId: 'u-1', tokenHash: 'hash', expiresAt: '2026-02-01' };
            const result = refreshTokenMapper.toDbInsert(data);
            assert.equal(result.user_id, 'u-1');
            assert.equal(result.token_hash, 'hash');
            assert.equal(result.expires_at, '2026-02-01');
        });
    });
});

// ═══════════════════════════════════════════════════════
// Races Mapper
// ═══════════════════════════════════════════════════════

describe('Race Mapper', () => {
    it('fromDbRow 正确转换含 JSON 字段', () => {
        const row = {
            id: '1', org_id: 'o-1', name: '北京马拉松', date: '2026-10-15',
            location: '天安门', events: [{ name: '全马', distance: 42195 }],
            conflict_rule: 'strict', location_lat: 39.9, location_lng: 116.4,
            route_data: '{}', map_features_data: null,
            created_at: '2026-01-01', updated_at: '2026-01-02',
        };
        const result = raceMapper.fromDbRow(row);
        assert.equal(result.id, 1);
        assert.equal(result.conflictRule, 'strict');
        assert.equal(result.locationLat, 39.9);
        assert.deepEqual(result.events, [{ name: '全马', distance: 42195 }]);
    });

    it('toDbInsert 正确转换 + events JSON 序列化', () => {
        const data = {
            orgId: 'o-1', name: '测试赛事', date: '2026-05-01', location: '上海',
            events: [{ name: '半马' }], conflictRule: 'permissive',
        };
        const result = raceMapper.toDbInsert(data);
        assert.equal(result.org_id, 'o-1');
        assert.equal(result.conflict_rule, 'permissive');
        assert.equal(result.events, JSON.stringify([{ name: '半马' }]));
    });

    it('toDbUpdate 只含传入字段', () => {
        const data = { name: '更新名称' };
        const result = raceMapper.toDbUpdate(data);
        assert.equal(result.name, '更新名称');
        assert.equal(result.date, undefined, '未传入的字段不应出现');
        assert.ok(result.updated_at, 'updated_at 应自动添加');
    });

    it('fromDbRow null 返回 null', () => {
        assert.equal(raceMapper.fromDbRow(null), null);
    });
});

// ═══════════════════════════════════════════════════════
// Records Mapper
// ═══════════════════════════════════════════════════════

describe('Record Mapper', () => {
    const fullDbRow = {
        id: '100', org_id: 'o-1', race_id: '1',
        name: '张三', name_pinyin: 'zhangsan', phone: '13800138000',
        country: 'CN', id_type: '身份证', id_number: '110101199001011234',
        gender: 'M', age: '30', birthday: '1990-01-01',
        event: '全马', source: 'excel', clothing_size: 'L',
        province: '北京', city: '北京', district: '朝阳',
        address: '朝阳路100号', email: 'zhangsan@test.com',
        emergency_name: '李四', emergency_phone: '13900139000',
        blood_type: 'A', order_group_id: 'G001', payment_status: 'paid',
        mark: '', lottery_status: 'winner',
        personal_best_full: { raceName: '上马', netTime: '03:15:00' },
        personal_best_half: null,
        lottery_zone: 'A', bag_window_no: 'W1', bag_no: 'B001',
        expo_window_no: 'E1', bib_number: 'A1001', bib_color: 'red',
        _source: 'file1.xlsx', _imported_at: '2026-01-01',
        runner_category: 'Mass', audit_status: 'pass', reject_reason: null,
        is_locked: 0, region_type: 'domestic',
        duplicate_count: 0, duplicate_sources: null,
        created_at: '2026-01-01', updated_at: '2026-01-02',
    };

    it('fromDbRow 正确转换 40+ 字段', () => {
        const result = recordMapper.fromDbRow(fullDbRow);
        assert.equal(result.id, 100);
        assert.equal(result.raceId, 1);
        assert.equal(result.namePinyin, 'zhangsan');
        assert.equal(result.idType, '身份证');
        assert.equal(result.idNumber, '110101199001011234');
        assert.equal(result.clothingSize, 'L');
        assert.equal(result.emergencyName, '李四');
        assert.equal(result.bloodType, 'A');
        assert.equal(result.orderGroupId, 'G001');
        assert.equal(result.paymentStatus, 'paid');
        assert.equal(result.lotteryStatus, 'winner');
        assert.deepEqual(result.personalBestFull, { raceName: '上马', netTime: '03:15:00' });
        assert.equal(result.personalBestHalf, null);
        assert.equal(result.bibNumber, 'A1001');
        assert.equal(result.bibColor, 'red');
        assert.equal(result.runnerCategory, 'Mass');
        assert.equal(result.auditStatus, 'pass');
        assert.equal(result.isLocked, 0);
        assert.equal(result.regionType, 'domestic');
    });

    it('toDbInsert 正确转换 + JSON 字段序列化', () => {
        const data = {
            orgId: 'o-1', raceId: 1, name: '张三', namePinyin: 'zhangsan',
            idNumber: '110101199001011234', clothingSize: 'L',
            personalBestFull: { raceName: '上马', netTime: '03:15:00' },
        };
        const result = recordMapper.toDbInsert(data);
        assert.equal(result.org_id, 'o-1');
        assert.equal(result.race_id, 1);
        assert.equal(result.name_pinyin, 'zhangsan');
        assert.equal(result.clothing_size, 'L');
        assert.equal(result.personal_best_full, JSON.stringify({ raceName: '上马', netTime: '03:15:00' }));
    });

    it('toDbUpdate 只含传入字段 + JSON 字段序列化', () => {
        const data = { name: '李四', personalBestFull: { raceName: '北马', netTime: '03:00:00' } };
        const result = recordMapper.toDbUpdate(data);
        assert.equal(result.name, '李四');
        assert.equal(result.personal_best_full, JSON.stringify({ raceName: '北马', netTime: '03:00:00' }));
        assert.equal(result.id_number, undefined, '未传入的字段不应出现');
        assert.ok(result.updated_at, 'updated_at 应自动添加');
    });

    it('toDbUpdate personalBestFull = null 应设置为 null', () => {
        const data = { personalBestFull: null };
        const result = recordMapper.toDbUpdate(data);
        assert.equal(result.personal_best_full, null);
    });

    it('fromDbRow null 返回 null', () => {
        assert.equal(recordMapper.fromDbRow(null), null);
    });
});
