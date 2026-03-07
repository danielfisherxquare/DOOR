/**
 * Migration: normalize_event_history
 * 清洗所有历史 event 数据，统一为标准名称
 */

const HALF_ALIASES = ['半马', '半程', 'Half', 'Half Marathon', '21.0975km', '21km', '21K'];
const FULL_ALIASES = ['全马', '全程', 'Full', 'Marathon', '42.195km', '42km', '42K'];

export async function up(knex) {
    // 清洗 records.event
    for (const alias of HALF_ALIASES) {
        await knex('records').where('event', alias).update({ event: '半程马拉松' });
    }
    for (const alias of FULL_ALIASES) {
        await knex('records').where('event', alias).update({ event: '马拉松' });
    }
    // 清洗 races.events JSONB
    const races = await knex('races').whereNotNull('events');
    for (const race of races) {
        const events = typeof race.events === 'string' ? JSON.parse(race.events) : race.events;
        if (!Array.isArray(events)) continue;
        let changed = false;
        const updated = events.map(e => {
            const name = String(e?.name || '').trim();
            const lower = name.toLowerCase();
            if (HALF_ALIASES.map(a => a.toLowerCase()).includes(lower)) { changed = true; return { ...e, name: '半程马拉松' }; }
            if (FULL_ALIASES.map(a => a.toLowerCase()).includes(lower)) { changed = true; return { ...e, name: '马拉松' }; }
            return e;
        });
        if (changed) await knex('races').where({ id: race.id }).update({ events: JSON.stringify(updated) });
    }
}

export async function down() { /* 不可逆 */ }
