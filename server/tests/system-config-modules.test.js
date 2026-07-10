import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  parseDictionaryDataPayload,
  parseDictionaryTypePayload,
} from '../src/modules/dictionary/dictionary.schema.js'
import { parseSysJobPayload } from '../src/modules/sys-job/sys-job.schema.js'
import { createSysJobService } from '../src/modules/sys-job/sys-job.service.js'
import { Scheduler } from '../src/services/scheduler.js'

describe('dictionary schemas', () => {
  it('whitelists dictionary fields and normalizes public status flags', () => {
    assert.deepEqual(
      parseDictionaryTypePayload({
        dictType: ' race.status ',
        dictName: ' 赛事状态 ',
        remark: '',
        status: '0',
        dict_type: 'forged',
      }),
      {
        dictType: 'race.status',
        dictName: '赛事状态',
        remark: null,
        status: '0',
      },
    )
    assert.deepEqual(
      parseDictionaryDataPayload({
        dictType: 'race.status',
        dictLabel: ' Open ',
        dictValue: 'open',
        sortOrder: '2',
        isDefault: 'N',
      }),
      {
        dictType: 'race.status',
        dictLabel: 'Open',
        dictValue: 'open',
        sortOrder: 2,
        isDefault: 'N',
        status: '0',
      },
    )
    assert.throws(
      () => parseDictionaryDataPayload({ dictType: 'race.status', dictLabel: 'X', dictValue: 'x', status: 'enabled' }),
      /status/,
    )
  })
})

describe('system job module', () => {
  it('rejects invalid cron expressions and strips lifecycle fields', () => {
    assert.deepEqual(
      parseSysJobPayload({
        jobName: ' Token cleanup ',
        cronExpression: '0 0 * * *',
        invokeTarget: 'token:cleanup',
        status: 'running',
        created_at: 'forged',
      }),
      {
        jobName: 'Token cleanup',
        jobGroup: 'default',
        cronExpression: '0 0 * * *',
        invokeTarget: 'token:cleanup',
        concurrent: '1',
        misfirePolicy: 'skip',
      },
    )
    assert.throws(
      () =>
        parseSysJobPayload({
          jobName: 'Bad',
          cronExpression: 'bad cron',
          invokeTarget: 'token:cleanup',
        }),
      /cronExpression/,
    )
  })

  it('does not stop a scheduled job when database deletion fails', async () => {
    let stopped = false
    const service = createSysJobService({
      repository: {
        deleteJob: async () => {
          throw new Error('database delete failed')
        },
      },
      scheduler: {
        stopJob: () => {
          stopped = true
        },
      },
      listTargets: () => ['token:cleanup'],
    })

    await assert.rejects(() => service.deleteJob(7), /database delete failed/)
    assert.equal(stopped, false)
  })

  it('prevents overlapping executions when concurrency is disabled', async () => {
    let release
    let executions = 0
    const logs = []
    const scheduler = new Scheduler({
      executeJobFn: async () => {
        executions += 1
        await new Promise((resolve) => {
          release = resolve
        })
        return { success: true }
      },
      writeLog: async (entry) => logs.push(entry),
    })
    const job = { id: 9, invoke_target: 'token:cleanup', concurrent: '1' }

    const first = scheduler.execute(job)
    await new Promise((resolve) => setImmediate(resolve))
    const second = await scheduler.execute(job)
    release()
    const firstResult = await first

    assert.equal(executions, 1)
    assert.equal(firstResult.success, true)
    assert.equal(second.success, false)
    assert.equal(second.skipped, true)
    assert.equal(logs.length, 2)
  })
})
