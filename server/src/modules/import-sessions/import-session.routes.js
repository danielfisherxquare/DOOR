import { Router } from 'express'
import { authorize } from '../../middleware/authorize.js'
import { requireRaceAccess } from '../../middleware/require-race-access.js'
import { importSessionController } from './import-session.controller.js'

const router = Router()

router.use(
  authorize({
    action: 'assume',
    resource: { kind: 'role', roles: ['org_admin', 'super_admin', 'race_admin'] },
  }),
)

router.post('/', importSessionController.create)
router.get('/:sid', importSessionController.get)
router.put('/:sid/summary', importSessionController.setSummary)
router.post('/:sid/chunks', importSessionController.appendChunk)
router.get('/:sid/chunks', importSessionController.getChunk)
router.delete('/:sid', importSessionController.cancel)
router.post(
  '/:sid/commit',
  requireRaceAccess(importSessionController.resolveRaceIdByCommit),
  importSessionController.commit,
)

export default router
