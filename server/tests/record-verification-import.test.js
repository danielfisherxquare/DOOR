import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildPersonalBestCaseUpdateSql } from '../src/modules/records/record.repository.js';

describe('record verification import SQL', () => {
    it('casts personal best payloads to jsonb during batch updates', () => {
        const items = [
            { hash: 'hash-full-1', pbJson: JSON.stringify({ raceName: '上马', netTime: '03:15:00' }) },
            { hash: 'hash-full-2', pbJson: JSON.stringify({ raceName: '北马', netTime: '03:20:00' }) },
        ];

        const { sql, params } = buildPersonalBestCaseUpdateSql({
            items,
            column: 'personal_best_full',
            raceId: 2,
            orgId: 'org-1',
        });

        assert.match(sql, /SET personal_best_full = CASE/);
        assert.match(sql, /THEN \?::jsonb/);
        assert.doesNotMatch(sql, /::text/);
        assert.deepEqual(params, [
            'hash-full-1',
            items[0].pbJson,
            'hash-full-2',
            items[1].pbJson,
            2,
            'hash-full-1',
            'hash-full-2',
            'org-1',
        ]);
    });

    it('rejects unexpected dynamic columns', () => {
        assert.throws(
            () => buildPersonalBestCaseUpdateSql({
                items: [{ hash: 'hash-1', pbJson: '{}' }],
                column: 'name',
                raceId: 2,
                orgId: 'org-1',
            }),
            /Invalid personal best column/,
        );
    });
});
