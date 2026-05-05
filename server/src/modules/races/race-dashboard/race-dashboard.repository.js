/**
 * Race Dashboard Repository - aggregates data from multiple sources for dashboard display
 */
import knex from '../../../db/knex.js';
import * as bibTrackingRepo from '../bib-tracking/bib-tracking.repository.js';

/**
 * Mask sensitive data for external viewers (leaders/clients)
 */
function maskName(name) {
    if (!name || name.length < 2) return '*';
    return name[0] + '**';
}

function maskPhone(phone) {
    if (!phone || phone.length < 7) return '****';
    return phone.slice(0, 3) + '****' + phone.slice(-4);
}

function maskIdNumber(idNumber) {
    if (!idNumber || idNumber.length < 6) return '****';
    return idNumber.slice(0, 3) + '********' + idNumber.slice(-3);
}

/**
 * Get race basic info
 */
export async function getRaceInfo(orgId, raceId) {
    const query = knex('races').where({ id: raceId });
    if (orgId) query.andWhere({ org_id: orgId });

    const race = await query.first();
    if (!race) return null;

    return {
        id: race.id,
        name: race.name,
        date: race.date,
        location: race.location,
        events: race.events || [],
        locationLat: race.location_lat,
        locationLng: race.location_lng,
    };
}

/**
 * Get participant statistics from records table
 */
export async function getParticipantStats(orgId, raceId) {
    // Get records count by status
    const records = await knex('records')
        .where({ org_id: orgId, race_id: raceId })
        .select('status')
        .count('* as count')
        .groupBy('status');

    const counts = {
        total: 0,
        confirmed: 0,
        checkedIn: 0,
        finished: 0,
        withdrawn: 0,
    };

    for (const row of records) {
        const count = Number(row.count || 0);
        counts.total += count;
        if (row.status === 'confirmed') counts.confirmed = count;
        if (row.status === 'checked_in') counts.checkedIn = count;
        if (row.status === 'finished') counts.finished = count;
        if (row.status === 'withdrawn') counts.withdrawn = count;
    }

    // If no status breakdown, get total from simple count
    if (counts.total === 0) {
        const [{ count }] = await knex('records')
            .where({ org_id: orgId, race_id: raceId })
            .count('* as count');
        counts.total = Number(count || 0);
    }

    return counts;
}

/**
 * Get Bib tracking statistics
 */
export async function getBibStats(orgId, raceId) {
    try {
        const stats = await bibTrackingRepo.getStats(orgId, raceId);
        return stats;
    } catch {
        // Fallback if bib tracking table doesn't exist
        return {
            totalTracked: 0,
            receiptPrinted: 0,
            pickedUp: 0,
            checkedIn: 0,
            finished: 0,
        };
    }
}

/**
 * Get event distribution from race events field
 */
export async function getEventDistribution(orgId, raceId) {
    const race = await getRaceInfo(orgId, raceId);
    if (!race || !race.events || race.events.length === 0) {
        // Fallback: get distribution from records
        const recordsByEvent = await knex('records')
            .where({ org_id: orgId, race_id: raceId })
            .select('event_name')
            .count('* as count')
            .groupBy('event_name');

        const total = recordsByEvent.reduce((sum, row) => sum + Number(row.count || 0), 0);

        return recordsByEvent.map((row) => ({
            name: row.event_name || '未知项目',
            count: Number(row.count || 0),
            percentage: total > 0 ? Math.round((Number(row.count || 0) / total) * 100) : 0,
        }));
    }

    // Get actual counts for each event
    const recordsByEvent = await knex('records')
        .where({ org_id: orgId, race_id: raceId })
        .select('event_name')
        .count('* as count')
        .groupBy('event_name');

    const eventCountMap = new Map(
        recordsByEvent.map((row) => [row.event_name, Number(row.count || 0)])
    );

    const total = race.events.reduce((sum, event) => {
        const count = eventCountMap.get(event.name) || event.targetCount || 0;
        return sum + count;
    }, 0);

    return race.events.map((event) => {
        const count = eventCountMap.get(event.name) || event.targetCount || 0;
        return {
            name: event.name,
            count,
            percentage: total > 0 ? Math.round((count / total) * 100) : 0,
        };
    });
}

/**
 * Get inventory statistics for race
 */
export async function getInventoryStats(orgId, raceId) {
    // Check if inventory_units has race_id column
    try {
        const units = await knex('inventory_units')
            .where({ org_id: orgId })
            .whereNotNull('race_id')
            .where({ race_id: raceId })
            .select('status', 'item_type')
            .count('* as count')
            .groupBy('status', 'item_type');

        const totalUnits = units.reduce((sum, row) => sum + Number(row.count || 0), 0);
        const pickedUnits = units
            .filter((row) => row.status === 'picked' || row.status === 'out')
            .reduce((sum, row) => sum + Number(row.count || 0), 0);

        // Group by type
        const typeMap = new Map();
        for (const row of units) {
            const type = row.item_type || '其他';
            if (!typeMap.has(type)) {
                typeMap.set(type, { type, total: 0, picked: 0 });
            }
            const entry = typeMap.get(type);
            entry.total += Number(row.count || 0);
            if (row.status === 'picked' || row.status === 'out') {
                entry.picked += Number(row.count || 0);
            }
        }

        return {
            totalUnits,
            pickedUnits,
            pendingUnits: totalUnits - pickedUnits,
            byType: Array.from(typeMap.values()),
        };
    } catch {
        // Fallback: use org-wide inventory stats
        const orgUnits = await knex('inventory_units')
            .where({ org_id: orgId })
            .select('status')
            .count('* as count')
            .groupBy('status');

        const totalUnits = orgUnits.reduce((sum, row) => sum + Number(row.count || 0), 0);
        const pickedUnits = orgUnits
            .filter((row) => row.status === 'picked' || row.status === 'out')
            .reduce((sum, row) => sum + Number(row.count || 0), 0);

        return {
            totalUnits,
            pickedUnits,
            pendingUnits: totalUnits - pickedUnits,
            byType: [],
        };
    }
}

/**
 * Get credential statistics for race
 */
export async function getCredentialStats(orgId, raceId) {
    try {
        const applications = await knex('credential_applications')
            .where({ org_id: orgId, race_id: raceId })
            .select('status', 'category_id')
            .count('* as count')
            .groupBy('status', 'category_id');

        const totalApplied = applications.reduce((sum, row) => sum + Number(row.count || 0), 0);
        const approved = applications
            .filter((row) => row.status === 'approved')
            .reduce((sum, row) => sum + Number(row.count || 0), 0);
        const issued = applications
            .filter((row) => row.status === 'issued')
            .reduce((sum, row) => sum + Number(row.count || 0), 0);

        // Get category names
        const categoryIds = applications
            .map((row) => row.category_id)
            .filter((id) => id !== null);

        const categories = categoryIds.length > 0
            ? await knex('credential_categories')
                .whereIn('id', categoryIds)
                .select('id', 'name')
            : [];

        const categoryMap = new Map(categories.map((cat) => [cat.id, cat.name]));

        // Group by category
        const categoryCountMap = new Map();
        for (const row of applications) {
            const categoryId = row.category_id;
            const categoryName = categoryMap.get(categoryId) || '其他';
            if (!categoryCountMap.has(categoryName)) {
                categoryCountMap.set(categoryName, 0);
            }
            categoryCountMap.set(categoryName, categoryCountMap.get(categoryName) + Number(row.count || 0));
        }

        return {
            totalApplied,
            approved,
            issued,
            byCategory: Array.from(categoryCountMap.entries()).map(([category, count]) => ({
                category,
                count,
            })),
        };
    } catch {
        return {
            totalApplied: 0,
            approved: 0,
            issued: 0,
            byCategory: [],
        };
    }
}

/**
 * Get recent activities (bib tracking events, credential events)
 */
export async function getRecentActivities(orgId, raceId, masked = false) {
    try {
        // Get recent bib tracking events
        const bibEvents = await knex('bib_tracking_events as bte')
            .leftJoin('bib_tracking_items as bti', 'bte.tracking_item_id', 'bti.id')
            .leftJoin('records as r', 'bti.record_id', 'r.id')
            .where('bti.org_id', orgId)
            .where('bti.race_id', raceId)
            .select(
                'bte.created_at',
                'bte.event_type',
                'bte.to_status',
                'bti.bib_number',
                'r.name'
            )
            .orderBy('bte.created_at', 'desc')
            .limit(10);

        const activities = bibEvents.map((event) => {
            const actionMap = {
                receipt_printed: '已出回执',
                picked_up: '号码布领取',
                checked_in: '检录入场',
                finished: '已完赛',
            };

            return {
                time: event.created_at,
                type: 'bib_event',
                bib: event.bib_number || '-',
                name: masked ? maskName(event.name) : event.name,
                action: actionMap[event.to_status] || event.event_type,
            };
        });

        return activities;
    } catch {
        return [];
    }
}

/**
 * Get race milestones/timeline
 */
export async function getMilestones(orgId, raceId) {
    // For now, return static milestones based on race date
    const race = await getRaceInfo(orgId, raceId);
    if (!race) return [];

    const raceDate = new Date(race.date);
    const now = new Date();

    // Generate typical milestones
    const milestones = [
        {
            name: '报名截止',
            date: formatDate(addDays(raceDate, -30)),
            status: now > addDays(raceDate, -30) ? 'completed' : 'pending',
        },
        {
            name: '抽签/名额分配',
            date: formatDate(addDays(raceDate, -25)),
            status: now > addDays(raceDate, -25) ? 'completed' : 'pending',
        },
        {
            name: '号码布分配',
            date: formatDate(addDays(raceDate, -15)),
            status: now > addDays(raceDate, -15) ? 'completed' : 'pending',
        },
        {
            name: '物资发放',
            date: formatDate(addDays(raceDate, -7)),
            status: now > addDays(raceDate, -7) && now < raceDate ? 'in_progress' :
                   now >= raceDate ? 'completed' : 'pending',
        },
        {
            name: '比赛日',
            date: formatDate(raceDate),
            status: now >= raceDate ? 'completed' : 'pending',
        },
    ];

    return milestones;
}

/**
 * Get full dashboard overview
 */
export async function getOverview(orgId, raceId, masked = false) {
    const [
        raceInfo,
        participantStats,
        bibStats,
        eventDistribution,
        inventoryStats,
        credentialStats,
        recentActivities,
        milestones,
    ] = await Promise.all([
        getRaceInfo(orgId, raceId),
        getParticipantStats(orgId, raceId),
        getBibStats(orgId, raceId),
        getEventDistribution(orgId, raceId),
        getInventoryStats(orgId, raceId),
        getCredentialStats(orgId, raceId),
        getRecentActivities(orgId, raceId, masked),
        getMilestones(orgId, raceId),
    ]);

    if (!raceInfo) {
        return null;
    }

    return {
        race: raceInfo,
        participants: participantStats,
        bibStatus: bibStats,
        eventDistribution,
        inventory: inventoryStats,
        credentials: credentialStats,
        recentActivities,
        milestones,
        // Reserved for future extensions
        _meta: {
            version: '1.0.0',
            extensions: [],
        },
    };
}

// Helper functions
function formatDate(date) {
    return date.toISOString().split('T')[0];
}

function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

export default {
    getOverview,
    getRaceInfo,
    getParticipantStats,
    getBibStats,
    getEventDistribution,
    getInventoryStats,
    getCredentialStats,
    getRecentActivities,
    getMilestones,
};