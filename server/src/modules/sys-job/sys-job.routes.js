import { Router } from 'express'
import { authorize } from '../../middleware/authorize.js'
import { parseSysJobId, parseSysJobLogFilters, parseSysJobPayload } from './sys-job.schema.js'
import { sysJobService } from './sys-job.service.js'

const router = Router()

router.use(
  authorize({
    action: 'assume',
    resource: { kind: 'role', roles: ['super_admin'] },
  }),
)

router.get('/list', async (_req, res, next) => {
  try {
    res.json({ success: true, data: await sysJobService.listJobs() })
  } catch (error) {
    next(error)
  }
})

router.get('/targets/list', (_req, res) => {
  res.json({ success: true, data: sysJobService.listTargets() })
})

router.post('/', async (req, res, next) => {
  try {
    const data = await sysJobService.createJob(parseSysJobPayload(req.body))
    res.json({ success: true, data })
  } catch (error) {
    next(error)
  }
})

router.put('/:id', async (req, res, next) => {
  try {
    const data = await sysJobService.updateJob(
      parseSysJobId(req.params.id),
      parseSysJobPayload(req.body, { partial: true }),
    )
    if (!data) return res.status(404).json({ success: false, message: '任务不存在' })
    res.json({ success: true, data })
  } catch (error) {
    next(error)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await sysJobService.deleteJob(parseSysJobId(req.params.id))
    if (!deleted) return res.status(404).json({ success: false, message: '任务不存在' })
    res.json({ success: true, message: '删除成功' })
  } catch (error) {
    next(error)
  }
})

router.post('/:id/start', async (req, res, next) => {
  try {
    const job = await sysJobService.startJob(parseSysJobId(req.params.id))
    if (!job) return res.status(404).json({ success: false, message: '任务不存在' })
    res.json({ success: true, message: '任务已启动' })
  } catch (error) {
    next(error)
  }
})

router.post('/:id/pause', async (req, res, next) => {
  try {
    const job = await sysJobService.pauseJob(parseSysJobId(req.params.id))
    if (!job) return res.status(404).json({ success: false, message: '任务不存在' })
    res.json({ success: true, message: '任务已暂停' })
  } catch (error) {
    next(error)
  }
})

router.post('/:id/run-once', async (req, res, next) => {
  try {
    await sysJobService.runOnce(parseSysJobId(req.params.id))
    res.json({ success: true, message: '任务执行完成' })
  } catch (error) {
    next(error)
  }
})

router.get('/:id/logs', async (req, res, next) => {
  try {
    const data = await sysJobService.getLogs(
      parseSysJobId(req.params.id),
      parseSysJobLogFilters(req.query),
    )
    res.json({ success: true, data })
  } catch (error) {
    next(error)
  }
})

export default router
