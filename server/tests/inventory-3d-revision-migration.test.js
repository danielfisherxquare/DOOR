import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    down,
    up,
} from '../src/db/migrations/20260713000001_add_inventory_3d_project_revision.js';

function createMigrationRecorder() {
    const calls = [];
    const knex = {
        schema: {
            async alterTable(tableName, callback) {
                const table = {
                    integer(columnName) {
                        const column = { tableName, columnName, notNullable: false, defaultValue: undefined };
                        calls.push({ type: 'column', column });
                        return {
                            notNullable() {
                                column.notNullable = true;
                                return this;
                            },
                            defaultTo(value) {
                                column.defaultValue = value;
                                return this;
                            },
                        };
                    },
                    dropColumn(columnName) {
                        calls.push({ type: 'dropColumn', tableName, columnName });
                    },
                };
                callback(table);
            },
        },
        async raw(sql) {
            calls.push({ type: 'raw', sql: String(sql) });
        },
    };
    return { knex, calls };
}

describe('inventory 3D project revision migration', () => {
    it('adds a non-null revision with a default of 1 and a positive check', async () => {
        const { knex, calls } = createMigrationRecorder();
        await up(knex);

        const column = calls.find((call) => call.type === 'column')?.column;
        assert.deepEqual(column, {
            tableName: 'inventory_3d_projects',
            columnName: 'revision',
            notNullable: true,
            defaultValue: 1,
        });
        assert.match(
            calls.find((call) => call.type === 'raw')?.sql || '',
            /CHECK \(revision >= 1\)/,
        );
    });

    it('drops the check before dropping the revision column', async () => {
        const { knex, calls } = createMigrationRecorder();
        await down(knex);

        assert.match(calls[0].sql, /DROP CONSTRAINT IF EXISTS inventory_3d_projects_revision_check/);
        assert.deepEqual(calls[1], {
            type: 'dropColumn',
            tableName: 'inventory_3d_projects',
            columnName: 'revision',
        });
    });
});
