import { Router } from 'express'
import { requireRaceAccess } from '../../middleware/require-race-access.js'
import { bibController } from './bib.controller.js'

const router = Router()

router.get('/overview/:raceId', requireRaceAccess('raceId'), bibController.getOverview)
router.get('/templates/:raceId', requireRaceAccess('raceId'), bibController.getTemplates)
router.post(
  '/templates',
  requireRaceAccess(bibController.resolveTemplateInputRaceId),
  bibController.upsertTemplate,
)
router.delete(
  '/templates/:id',
  requireRaceAccess(bibController.resolveTemplateRaceId),
  bibController.deleteTemplate,
)
router.get('/dataset/:raceId', requireRaceAccess('raceId'), bibController.getDataset)
router.get(
  '/execution-dataset/:raceId',
  requireRaceAccess('raceId'),
  bibController.getExecutionDataset,
)
router.post('/snapshot/:raceId', requireRaceAccess('raceId'), bibController.createSnapshot)
router.get('/has-snapshot/:raceId', requireRaceAccess('raceId'), bibController.hasSnapshot)
router.post('/rollback/:raceId', requireRaceAccess('raceId'), bibController.rollback)
router.post('/bulk-assign/:raceId', requireRaceAccess('raceId'), bibController.bulkAssign)
router.post('/clear/:raceId', requireRaceAccess('raceId'), bibController.clear)

export default router
