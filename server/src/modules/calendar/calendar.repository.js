import knex from '../../db/knex.js'

export async function getRaces(orgId) {
  const query = knex('races').select('id', 'name as title', 'date')
  if (orgId) query.where('org_id', orgId)
  return query
}

export async function getMilestones(orgId) {
  const query = knex('project_tasks')
    .join('projects', 'project_tasks.project_id', 'projects.id')
    .where('project_tasks.is_milestone', true)
    .whereNotNull('projects.race_id')
    .select(
      'project_tasks.id',
      'project_tasks.title',
      'project_tasks.end_date as date',
      'projects.race_id',
    )
  if (orgId) query.where('projects.org_id', orgId)
  return query
}
