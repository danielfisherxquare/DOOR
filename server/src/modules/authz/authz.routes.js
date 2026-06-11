import { Router } from 'express';
import { buildAuthzProfile } from '../../authz/profile.service.js';

export function createAuthzRoutes({ buildProfile = buildAuthzProfile } = {}) {
  const router = Router();

  router.get('/profile', async (req, res, next) => {
    try {
      const data = await buildProfile({
        authContext: req.authContext,
        requestedOrgId: req.query.orgId,
        requestedRaceId: req.query.raceId,
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export default createAuthzRoutes();
