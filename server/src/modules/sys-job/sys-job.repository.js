import knex from '../../db/knex.js'

export function listJobs() {
  return knex('sys_job').orderBy('job_group').orderBy('job_name')
}

export async function createJob(data) {
  const [result] = await knex('sys_job')
    .insert({
      job_name: data.jobName,
      job_group: data.jobGroup,
      cron_expression: data.cronExpression,
      invoke_target: data.invokeTarget,
      concurrent: data.concurrent,
      misfire_policy: data.misfirePolicy,
      remark: data.remark,
    })
    .returning('*')
  return result
}

export async function updateJob(id, data) {
  const updates = {
    ...(data.jobName !== undefined ? { job_name: data.jobName } : {}),
    ...(data.jobGroup !== undefined ? { job_group: data.jobGroup } : {}),
    ...(data.cronExpression !== undefined ? { cron_expression: data.cronExpression } : {}),
    ...(data.invokeTarget !== undefined ? { invoke_target: data.invokeTarget } : {}),
    ...(data.concurrent !== undefined ? { concurrent: data.concurrent } : {}),
    ...(data.misfirePolicy !== undefined ? { misfire_policy: data.misfirePolicy } : {}),
    ...(data.remark !== undefined ? { remark: data.remark } : {}),
    updated_at: knex.fn.now(),
  }
  const [result] = await knex('sys_job').where({ id }).update(updates).returning('*')
  return result
}

export function getJob(id) {
  return knex('sys_job').where({ id }).first()
}

export function deleteJob(id) {
  return knex('sys_job').where({ id }).delete()
}

export async function updateJobStatus(id, status) {
  const [result] = await knex('sys_job')
    .where({ id })
    .update({ status, updated_at: knex.fn.now() })
    .returning('*')
  return result
}

export async function getJobLogs(id, { page, pageSize }) {
  const [countResult, logs] = await Promise.all([
    knex('sys_job_log').where({ job_id: id }).count('id as total').first(),
    knex('sys_job_log')
      .where({ job_id: id })
      .orderBy('created_at', 'desc')
      .offset((page - 1) * pageSize)
      .limit(pageSize),
  ])
  return { logs, total: Number(countResult?.total || 0), page, pageSize }
}
