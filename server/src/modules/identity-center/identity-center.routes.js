import { Router } from 'express';
import { authorize } from '../../middleware/authorize.js';
import { identityCenterController } from './identity-center.controller.js';

const router = Router();

router.use(authorize({
    action: 'assume',
    resource: { kind: 'role', roles: ['org_admin', 'super_admin'] },
}));

router.get('/summary', identityCenterController.getSummary);
router.get('/accounts', identityCenterController.listAccounts);
router.get('/module-matrix', identityCenterController.getModuleMatrix);
router.put('/module-matrix', identityCenterController.saveModuleMatrix);
router.get('/org-race-matrix', identityCenterController.getOrgRaceMatrix);
router.put('/org-race-matrix', identityCenterController.saveOrgRaceMatrix);
router.get('/user-race-matrix', identityCenterController.getUserRaceMatrix);
router.put('/user-race-matrix', identityCenterController.saveUserRaceMatrix);

export default router;
