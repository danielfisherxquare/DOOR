import knex from '../../db/knex.js'

function executionError(status, code, message) {
  const error = new Error(message)
  error.status = status
  error.code = code
  error.expose = true
  return error
}

export async function lockLotteryRace(orgId, raceId, database = knex) {
  const row = await database('races')
    .where({ id: raceId, org_id: orgId })
    .forUpdate()
    .first('id')

  if (!row) {
    throw executionError(404, 'LOTTERY_RACE_NOT_FOUND', '赛事不存在或不可访问')
  }
  return { id: Number(row.id) }
}

export async function assertNoActivePipelineExecution(
  orgId,
  raceId,
  executionTypes,
  database = knex,
) {
  const running = await database('pipeline_executions')
    .where({ org_id: orgId, race_id: raceId, status: 'running' })
    .whereIn('execution_type', executionTypes)
    .first('id', 'execution_type')

  if (running) {
    throw executionError(
      409,
      'CONCURRENT_EXECUTION',
      `存在正在执行的 ${running.execution_type} 任务 (id=${running.id})，请等待完成`,
    )
  }
}

export async function assertNoFinalizedLotteryV2(orgId, raceId, database = knex) {
  const snapshot = await database('lottery_v2_snapshots')
    .where({ org_id: orgId, race_id: raceId, status: 'finalized' })
    .first('id')

  if (snapshot) {
    throw executionError(
      409,
      'LOTTERY_V2_ALREADY_FINALIZED',
      'Lottery V2 已正式执行，请先回滚 V2 结果再运行其他抽签',
    )
  }
}

export async function assertNoLotteryV1Snapshot(orgId, raceId, database = knex) {
  const snapshot = await database('pipeline_snapshots')
    .where({ org_id: orgId, race_id: raceId, snapshot_type: 'pre_lottery' })
    .first('id')

  if (snapshot) {
    throw executionError(
      409,
      'LOTTERY_V1_SNAPSHOT_EXISTS',
      'Lottery V1 结果尚未回滚，请先回滚 V1 再运行 Lottery V2',
    )
  }
}
