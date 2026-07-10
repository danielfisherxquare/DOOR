import { Router } from 'express'
import { operationLog } from '../../middleware/operation-log.js'
import { requireAuth } from '../../middleware/require-auth.js'
import { requireRaceAccess } from '../../middleware/require-race-access.js'
import { recordController } from './record.controller.js'

const router = Router()

router.post('/query', requireAuth, recordController.query)
router.post('/analysis', requireAuth, recordController.analysis)
router.post('/unique-values', requireAuth, recordController.uniqueValues)
router.get('/quick-stats/:raceId', requireRaceAccess('raceId'), recordController.quickStats)

router.put(
  '/:recordId',
  operationLog({
    module: 'records',
    businessType: 'UPDATE',
    titleFactory: (req) => `更新记录: ${req.params?.recordId || ''}`,
  }),
  requireRaceAccess(recordController.resolveRaceIdByRecordId),
  recordController.update,
)

router.post(
  '/bulk-update',
  operationLog({
    module: 'records',
    businessType: 'UPDATE',
    titleFactory: () => '批量更新记录',
  }),
  requireRaceAccess(recordController.resolveRaceIdByBulkUpdates),
  recordController.bulkUpdate,
)

router.delete(
  '/race/:raceId',
  operationLog({
    module: 'records',
    businessType: 'DELETE',
    titleFactory: (req) => `清空赛事数据: ${req.params?.raceId || ''}`,
  }),
  requireRaceAccess('raceId'),
  recordController.deleteRace,
)

router.get('/export/:raceId', requireRaceAccess('raceId'), recordController.exportRace)

router.post(
  '/import-verification/:raceId',
  operationLog({
    module: 'records',
    businessType: 'IMPORT',
    titleFactory: (req) => `导入验证: ${req.params?.raceId || ''}`,
  }),
  requireRaceAccess('raceId'),
  recordController.importVerification,
)

export default router
