import { Router } from 'express'
import { requireRaceAccess } from '../../middleware/require-race-access.js'
import { lotteryController } from './lottery.controller.js'

const router = Router()

router.get('/configs/:raceId', requireRaceAccess('raceId'), lotteryController.getRaceCapacity)
router.post('/configs/:raceId', requireRaceAccess('raceId'), lotteryController.saveRaceCapacity)
router.delete(
  '/configs/entry/:id',
  requireRaceAccess(lotteryController.resolveCapacityRaceId),
  lotteryController.deleteRaceCapacity,
)

router.get('/lists/:raceId', requireRaceAccess('raceId'), lotteryController.getLists)
router.post(
  '/lists',
  requireRaceAccess(lotteryController.resolveListEntriesRaceId),
  lotteryController.saveLists,
)
router.delete('/lists/:raceId', requireRaceAccess('raceId'), lotteryController.deleteLists)
router.delete(
  '/lists/entry/:id',
  requireRaceAccess(lotteryController.resolveListRaceId),
  lotteryController.deleteList,
)
router.put(
  '/lists/entry/:id',
  requireRaceAccess(lotteryController.resolveListRaceId),
  lotteryController.updateList,
)
router.post(
  '/lists/bulk-add',
  requireRaceAccess(lotteryController.resolveListEntriesRaceId),
  lotteryController.bulkAddLists,
)
router.post(
  '/lists/bulk-put',
  requireRaceAccess(lotteryController.resolveListEntriesRaceId),
  lotteryController.bulkPutLists,
)
router.post(
  '/lists/bulk-delete',
  requireRaceAccess(lotteryController.resolveBulkListRaceId),
  lotteryController.bulkDeleteLists,
)
router.get('/lists/conflicts/:raceId', requireRaceAccess('raceId'), lotteryController.getConflicts)

router.get('/rules/:raceId', requireRaceAccess('raceId'), lotteryController.getRules)
router.post(
  '/rules',
  requireRaceAccess(lotteryController.resolveRuleInputRaceId),
  lotteryController.saveRule,
)

router.get('/weights/:raceId', requireRaceAccess('raceId'), lotteryController.getWeights)
router.post(
  '/weights',
  requireRaceAccess(lotteryController.resolveWeightInputRaceId),
  lotteryController.saveWeight,
)
router.delete(
  '/weights/:id',
  requireRaceAccess(lotteryController.resolveWeightRaceId),
  lotteryController.deleteWeight,
)
router.delete(
  '/weights/all/:raceId',
  requireRaceAccess('raceId'),
  lotteryController.deleteAllWeights,
)

router.post('/finalize/:raceId', requireRaceAccess('raceId'), lotteryController.finalize)
router.get('/results/:raceId', requireRaceAccess('raceId'), lotteryController.getResults)
router.get('/has-snapshot/:raceId', requireRaceAccess('raceId'), lotteryController.hasSnapshot)
router.post('/rollback/:raceId', requireRaceAccess('raceId'), lotteryController.rollback)

export default router
