import { Router } from 'express'
import { authorize } from '../../middleware/authorize.js'
import { operationLog } from '../../middleware/operation-log.js'
import { teamController } from './team.controller.js'
import { uploadTeamMemberPhotoMiddleware } from './team-photo.js'

const router = Router()
const withOrg = teamController.resolveOrgContext

router.use(
  authorize({
    action: 'assume',
    resource: { kind: 'role', roles: ['org_admin', 'super_admin'] },
  }),
)

router.get('/team-members', withOrg, teamController.listTeamMembers)
router.get('/team-members/template', teamController.getImportTemplate)
router.post('/team-members/import-preview', withOrg, teamController.previewImport)
router.post(
  '/team-members/import-commit',
  withOrg,
  operationLog({
    module: 'team',
    businessType: 'IMPORT',
    titleFactory: () => '批量导入团队成员',
  }),
  teamController.commitImport,
)
router.get('/team-members/:teamMemberId', withOrg, teamController.getTeamMember)
router.get('/team-members/:teamMemberId/photo', withOrg, teamController.getTeamMemberPhoto)
router.post(
  '/team-members',
  withOrg,
  operationLog({
    module: 'team',
    businessType: 'INSERT',
    titleFactory: (req) => `创建团队成员: ${req.body?.name || ''}`,
  }),
  teamController.createTeamMember,
)
router.patch(
  '/team-members/:teamMemberId',
  withOrg,
  operationLog({
    module: 'team',
    businessType: 'UPDATE',
    titleFactory: (req) => `更新团队成员: ${req.params?.teamMemberId || ''}`,
  }),
  teamController.updateTeamMember,
)
router.post(
  '/team-members/:teamMemberId/photo',
  withOrg,
  uploadTeamMemberPhotoMiddleware.single('photo'),
  teamController.uploadTeamMemberPhoto,
)
router.delete(
  '/team-members/:teamMemberId/photo',
  withOrg,
  teamController.deleteTeamMemberPhoto,
)
router.post(
  '/team-members/:teamMemberId/archive',
  withOrg,
  operationLog({
    module: 'team',
    businessType: 'UPDATE',
    titleFactory: (req) => `归档团队成员: ${req.params?.teamMemberId || ''}`,
  }),
  teamController.archiveTeamMember,
)
router.post(
  '/team-members/:teamMemberId/restore',
  withOrg,
  operationLog({
    module: 'team',
    businessType: 'UPDATE',
    titleFactory: (req) => `恢复团队成员: ${req.params?.teamMemberId || ''}`,
  }),
  teamController.restoreTeamMember,
)
router.post(
  '/team-members/:teamMemberId/enable-account',
  withOrg,
  operationLog({
    module: 'team',
    businessType: 'UPDATE',
    titleFactory: (req) => `启用团队成员账号: ${req.params?.teamMemberId || ''}`,
  }),
  teamController.enableTeamMemberAccount,
)
router.post(
  '/team-members/:teamMemberId/reset-password',
  withOrg,
  operationLog({
    module: 'team',
    businessType: 'UPDATE',
    titleFactory: (req) => `重置团队成员密码: ${req.params?.teamMemberId || ''}`,
  }),
  teamController.resetTeamMemberPassword,
)
router.get('/team-candidates', withOrg, teamController.listTeamCandidates)

export default router
