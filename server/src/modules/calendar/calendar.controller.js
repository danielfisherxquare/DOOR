import knex from '../../db/knex.js';

export async function getCalendarEvents(req, res, next) {
    try {
        // Fetch races
        const races = await knex('races').select('id', 'name as title', 'date');

        // Fetch milestone project tasks linked to a race
        const milestones = await knex('project_tasks')
            .join('projects', 'project_tasks.project_id', 'projects.id')
            .where('project_tasks.is_milestone', true)
            .whereNotNull('projects.race_id')
            .select(
                'project_tasks.id',
                'project_tasks.title',
                'project_tasks.end_date as date', // Using end_date as the default milestone date
                'projects.race_id'
            );

        // Format and aggregate
        const events = [
            ...races.filter(r => r.date).map(r => ({ ...r, type: 'race' })),
            ...milestones.filter(m => m.date).map(m => ({ ...m, type: 'milestone' }))
        ];

        res.json({ success: true, data: events });
    } catch (err) {
        next(err);
    }
}
