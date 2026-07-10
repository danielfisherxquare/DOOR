import { Router } from 'express'
import { authorize } from '../../middleware/authorize.js'
import * as repository from './dictionary.repository.js'
import {
  parseDictionaryDataPayload,
  parseDictionaryId,
  parseDictionaryType,
  parseDictionaryTypePayload,
} from './dictionary.schema.js'

const publicRouter = Router()
const adminRouter = Router()

adminRouter.use(
  authorize({
    action: 'assume',
    resource: { kind: 'role', roles: ['super_admin'] },
  }),
)

adminRouter.get('/type/list', async (_req, res, next) => {
  try {
    res.json({ success: true, data: await repository.listTypes() })
  } catch (error) {
    next(error)
  }
})

adminRouter.post('/type', async (req, res, next) => {
  try {
    const input = parseDictionaryTypePayload(req.body)
    const data = await repository.createType(input)
    res.json({ success: true, data })
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: '字典类型已存在' })
    }
    next(error)
  }
})

adminRouter.put('/type/:id', async (req, res, next) => {
  try {
    const input = parseDictionaryTypePayload(req.body, { partial: true })
    const data = await repository.updateType(
      parseDictionaryId(req.params.id),
      input,
    )
    if (!data) return res.status(404).json({ success: false, message: '字典类型不存在' })
    res.json({ success: true, data })
  } catch (error) {
    next(error)
  }
})

adminRouter.delete('/type/:id', async (req, res, next) => {
  try {
    const deleted = await repository.deleteType(parseDictionaryId(req.params.id))
    if (!deleted) return res.status(404).json({ success: false, message: '字典类型不存在' })
    res.json({ success: true, message: '删除成功' })
  } catch (error) {
    next(error)
  }
})

adminRouter.get('/data/:dictType', async (req, res, next) => {
  try {
    const data = await repository.listData(parseDictionaryType(req.params.dictType))
    res.json({ success: true, data })
  } catch (error) {
    next(error)
  }
})

adminRouter.post('/data', async (req, res, next) => {
  try {
    const input = parseDictionaryDataPayload(req.body)
    const data = await repository.createData(input)
    res.json({ success: true, data })
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: '字典数据已存在' })
    }
    next(error)
  }
})

adminRouter.put('/data/:id', async (req, res, next) => {
  try {
    const input = parseDictionaryDataPayload(req.body, { partial: true })
    const data = await repository.updateData(
      parseDictionaryId(req.params.id),
      input,
    )
    if (!data) return res.status(404).json({ success: false, message: '字典数据不存在' })
    res.json({ success: true, data })
  } catch (error) {
    next(error)
  }
})

adminRouter.delete('/data/:id', async (req, res, next) => {
  try {
    const deleted = await repository.deleteData(parseDictionaryId(req.params.id))
    if (!deleted) return res.status(404).json({ success: false, message: '字典数据不存在' })
    res.json({ success: true, message: '删除成功' })
  } catch (error) {
    next(error)
  }
})

publicRouter.get('/:dictType', async (req, res, next) => {
  try {
    const data = await repository.listData(parseDictionaryType(req.params.dictType), {
      onlyEnabled: true,
    })
    res.json({ success: true, data })
  } catch (error) {
    next(error)
  }
})

export { publicRouter as publicRoutes, adminRouter as adminRoutes }
