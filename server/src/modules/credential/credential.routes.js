import { Router } from 'express'
import { requireRaceAccess } from '../../middleware/require-race-access.js'
import { authorize } from '../../middleware/authorize.js'
import { operationLog } from '../../middleware/operation-log.js'
import { credentialController } from './credential.controller.js'

const router = Router()
const requireCredentialAdmin = authorize({
  action: 'assume',
  resource: { kind: 'role', roles: ['org_admin', 'super_admin'] },
})

router.get(
  '/access-areas/:raceId',
  requireRaceAccess('raceId'),
  credentialController.getAccessAreas,
)
router.post(
  '/access-areas/:raceId',
  requireRaceAccess('raceId'),
  credentialController.createAccessArea,
)
router.put(
  '/access-areas/:raceId/:accessAreaId',
  requireRaceAccess('raceId'),
  credentialController.updateAccessArea,
)
router.delete(
  '/access-areas/:raceId/:accessAreaId',
  requireRaceAccess('raceId'),
  credentialController.deleteAccessArea,
)
router.get('/categories/:raceId', requireRaceAccess('raceId'), credentialController.getCategories)
router.post('/categories/:raceId', requireRaceAccess('raceId'), credentialController.createCategory)
router.put(
  '/categories/:raceId/:categoryId',
  requireRaceAccess('raceId'),
  credentialController.updateCategory,
)
router.delete(
  '/categories/:raceId/:categoryId',
  requireRaceAccess('raceId'),
  credentialController.deleteCategory,
)
router.get(
  '/style-templates/:raceId',
  requireRaceAccess('raceId'),
  credentialController.getStyleTemplates,
)
router.get(
  '/style-templates/:raceId/:templateId',
  requireRaceAccess('raceId'),
  credentialController.getStyleTemplate,
)
router.post(
  '/style-templates/:raceId',
  requireRaceAccess('raceId'),
  credentialController.createStyleTemplate,
)
router.put(
  '/style-templates/:raceId/:templateId',
  requireRaceAccess('raceId'),
  credentialController.updateStyleTemplate,
)
router.delete(
  '/style-templates/:raceId/:templateId',
  requireRaceAccess('raceId'),
  credentialController.deleteStyleTemplate,
)
router.get(
  '/requests/:raceId',
  requireCredentialAdmin,
  requireRaceAccess('raceId'),
  credentialController.getRequests,
)
router.get(
  '/requests/:raceId/:requestId',
  requireRaceAccess('raceId'),
  credentialController.getRequest,
)
router.post('/requests/:raceId', requireRaceAccess('raceId'), credentialController.createRequest)
router.post(
  '/requests/:raceId/:requestId/review',
  operationLog({
    module: 'credential',
    businessType: 'UPDATE',
    titleFactory: (req) => `审核证件申请: ${req.params?.requestId || ''}`,
  }),
  requireCredentialAdmin,
  requireRaceAccess('raceId'),
  credentialController.reviewRequest,
)
router.get(
  '/credentials/:raceId',
  requireCredentialAdmin,
  requireRaceAccess('raceId'),
  credentialController.getCredentials,
)
router.get(
  '/credentials/:raceId/:credentialId',
  requireRaceAccess('raceId'),
  credentialController.getCredential,
)
router.post('/scan/resolve', credentialController.resolveCredential)
router.post(
  '/credentials/:raceId/:credentialId/void',
  operationLog({
    module: 'credential',
    businessType: 'UPDATE',
    titleFactory: (req) => `作废证件: ${req.params?.credentialId || ''}`,
  }),
  requireCredentialAdmin,
  requireRaceAccess('raceId'),
  credentialController.voidCredential,
)
router.post(
  '/credentials/:raceId/:credentialId/issue',
  operationLog({
    module: 'credential',
    businessType: 'UPDATE',
    titleFactory: (req) => `签发证件: ${req.params?.credentialId || ''}`,
  }),
  requireRaceAccess('raceId'),
  credentialController.issueCredential,
)
router.post(
  '/credentials/:raceId/:credentialId/reissue',
  operationLog({
    module: 'credential',
    businessType: 'UPDATE',
    titleFactory: (req) => `补办证件: ${req.params?.credentialId || ''}`,
  }),
  requireCredentialAdmin,
  requireRaceAccess('raceId'),
  credentialController.reissueCredential,
)
router.get(
  '/stats/:raceId',
  requireCredentialAdmin,
  requireRaceAccess('raceId'),
  credentialController.getStats,
)

export default router
