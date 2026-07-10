import { Router } from 'express'
import { authorize } from '../../middleware/authorize.js'
import * as repository from './column-mapping.repository.js'
import {
  assertColumnMappingScopeAllowed,
  parseColumnMappingDeletePayload,
  parseColumnMappingPayload,
  parseColumnMappingReadScope,
  parseColumnMappingWriteScope,
  resolveColumnMappingOrgId,
} from './column-mapping.schema.js'

const router = Router()

router.use(
  authorize({
    action: 'assume',
    resource: { kind: 'role', roles: ['org_admin', 'super_admin', 'race_admin'] },
  }),
)

function orgSource(req) {
  return { orgId: req.query.orgId ?? req.body?.orgId }
}

router.get('/', async (req, res, next) => {
  try {
    const scope = parseColumnMappingReadScope(req.query.scope)
    assertColumnMappingScopeAllowed(req.authContext, scope)
    const orgId = await resolveColumnMappingOrgId(
      req.authContext,
      orgSource(req),
      repository.organizationExists,
    )
    const userId = req.authContext?.userId || null
    const mappings =
      scope === 'user'
        ? await repository.findByUserScope(orgId, userId)
        : scope === 'org'
          ? await repository.findByOrgScope(orgId)
          : await repository.findEffective(orgId, userId)
    res.json({ success: true, data: mappings })
  } catch (error) {
    next(error)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const input = parseColumnMappingPayload(req.body)
    const scope = parseColumnMappingWriteScope(req.query.scope ?? input.scope)
    assertColumnMappingScopeAllowed(req.authContext, scope)
    const orgId = await resolveColumnMappingOrgId(
      req.authContext,
      orgSource(req),
      repository.organizationExists,
    )
    const userId = req.authContext?.userId || null
    const data =
      scope === 'org'
        ? await repository.upsertOrgBatch(orgId, input.mappings)
        : await repository.upsertUserBatch(orgId, userId, input.mappings)
    res.status(201).json({ success: true, data })
  } catch (error) {
    next(error)
  }
})

router.delete('/', async (req, res, next) => {
  try {
    const input = parseColumnMappingDeletePayload(req.body)
    const scope = parseColumnMappingWriteScope(req.query.scope ?? input.scope)
    assertColumnMappingScopeAllowed(req.authContext, scope)
    const orgId = await resolveColumnMappingOrgId(
      req.authContext,
      orgSource(req),
      repository.organizationExists,
    )
    const userId = req.authContext?.userId || null
    const deleted =
      scope === 'org'
        ? await repository.deleteOrgByIds(orgId, input.ids)
        : await repository.deleteUserByIds(orgId, userId, input.ids)
    res.json({ success: true, data: { deleted } })
  } catch (error) {
    next(error)
  }
})

router.delete('/all', async (req, res, next) => {
  try {
    const scope = parseColumnMappingWriteScope(req.body?.scope ?? req.query.scope)
    assertColumnMappingScopeAllowed(req.authContext, scope)
    const orgId = await resolveColumnMappingOrgId(
      req.authContext,
      orgSource(req),
      repository.organizationExists,
    )
    const userId = req.authContext?.userId || null
    const deleted =
      scope === 'org'
        ? await repository.clearOrgScope(orgId)
        : await repository.clearUserScope(orgId, userId)
    res.json({ success: true, data: { deleted } })
  } catch (error) {
    next(error)
  }
})

export default router
