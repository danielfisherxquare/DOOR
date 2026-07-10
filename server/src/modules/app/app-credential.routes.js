import { Router } from 'express'
import { requireRaceAccess } from '../../middleware/require-race-access.js'
import { authorize } from '../../middleware/authorize.js'
import { credentialController } from '../credential/credential.controller.js'
import credentialWorkbenchRoutes from '../credential/credential.routes.js'

const router = Router()
const operateSelf = authorize({
  action: 'use',
  resource: { kind: 'capability', scope: 'self', name: 'operate' },
})
const viewSelf = authorize({
  action: 'use',
  resource: { kind: 'capability', scope: 'self', name: 'view' },
})

router.post(
  '/requests/:raceId',
  operateSelf,
  requireRaceAccess('raceId'),
  credentialController.createRequest,
)

router.get(
  '/requests/:raceId/:requestId',
  viewSelf,
  requireRaceAccess('raceId'),
  credentialController.getRequest,
)

router.get(
  '/credentials/:raceId/:credentialId',
  viewSelf,
  requireRaceAccess('raceId'),
  credentialController.getCredential,
)

router.post('/scan/resolve', viewSelf, credentialController.resolveCredential)

// App surface hosts the credential workbench UI. Keep the self-service routes
// above for least-privilege users, then fall through to the shared workbench
// routes for admins/operators using the same app workspace.
router.use(credentialWorkbenchRoutes)

export default router
