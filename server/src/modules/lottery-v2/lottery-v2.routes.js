import { Router } from 'express'
import { requireRaceAccess } from '../../middleware/require-race-access.js'
import { lotteryV2Controller } from './lottery-v2.controller.js'

const router = Router()

router.get('/config/:raceId', requireRaceAccess('raceId'), lotteryV2Controller.getConfig)
router.put('/config/:raceId', requireRaceAccess('raceId'), lotteryV2Controller.saveConfig)
router.post('/preview/:raceId', requireRaceAccess('raceId'), lotteryV2Controller.enqueuePreview)
router.get('/preview/:raceId', requireRaceAccess('raceId'), lotteryV2Controller.getPreview)
router.post('/finalize/:raceId', requireRaceAccess('raceId'), lotteryV2Controller.enqueueFinalize)
router.get('/results/:raceId', requireRaceAccess('raceId'), lotteryV2Controller.getResults)
router.post('/rollback/:raceId', requireRaceAccess('raceId'), lotteryV2Controller.rollback)

export default router
