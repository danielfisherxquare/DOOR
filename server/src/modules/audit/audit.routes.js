import { Router } from 'express'
import { requireRaceAccess } from '../../middleware/require-race-access.js'
import { auditController } from './audit.controller.js'

const router = Router()

router.get('/prep-stats/:raceId', requireRaceAccess('raceId'), auditController.prepStats)
router.post('/reset/:raceId', requireRaceAccess('raceId'), auditController.reset)
router.post(
  '/step/underage/:raceId',
  requireRaceAccess('raceId'),
  auditController.enqueueStep('underage'),
)
router.post(
  '/step/blacklist/:raceId',
  requireRaceAccess('raceId'),
  auditController.enqueueStep('blacklist'),
)
router.post(
  '/step/fake-elite/:raceId',
  requireRaceAccess('raceId'),
  auditController.enqueueStep('fake-elite'),
)
router.post(
  '/step/direct-lock/:raceId',
  requireRaceAccess('raceId'),
  auditController.enqueueStep('direct-lock'),
)
router.post(
  '/step/mass-pool/:raceId',
  requireRaceAccess('raceId'),
  auditController.enqueueStep('mass-pool'),
)

export default router
