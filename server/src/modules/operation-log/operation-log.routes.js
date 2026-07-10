import { Router } from 'express'
import {
  parseOperationLogFilters,
  parseOperationLogId,
  resolveOperationLogOrgId,
} from './operation-log.schema.js'
import * as repository from './operation-log.repository.js'

const router = Router()

router.get('/', async (req, res, next) => {
  try {
    const orgId = resolveOperationLogOrgId(req.authContext, req.query)
    const filters = parseOperationLogFilters(req.query)
    const data = await repository.listOperationLogs(orgId, filters)
    res.json({ success: true, data })
  } catch (error) {
    next(error)
  }
})

router.get('/modules/list', async (req, res, next) => {
  try {
    const orgId = resolveOperationLogOrgId(req.authContext, req.query)
    const modules = await repository.listOperationLogModules(orgId)
    res.json({ success: true, data: modules })
  } catch (error) {
    next(error)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const orgId = resolveOperationLogOrgId(req.authContext, req.query)
    const log = await repository.getOperationLogById(orgId, parseOperationLogId(req.params.id))
    if (!log) return res.status(404).json({ success: false, message: '日志不存在' })
    res.json({ success: true, data: log })
  } catch (error) {
    next(error)
  }
})

export default router
