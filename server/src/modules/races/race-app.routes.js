import { Router } from 'express';
import { operationLog } from '../../middleware/operation-log.js';
import { requireRaceAccess } from '../../middleware/require-race-access.js';
import {
  parseRaceConflictRulePayload,
  parseRaceLotteryModePayload,
} from './race.schema.js';
import { raceService } from './race.service.js';

const router = Router();

router.get('/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
  try {
    const race = await raceService.getRace(
      req.raceAccess.operatorOrgId,
      req.raceAccess.raceId,
    );
    if (!race) {
      return res.status(404).json({ success: false, message: 'Race not found' });
    }
    return res.json({ success: true, data: race });
  } catch (error) {
    return next(error);
  }
});

router.patch(
  '/:raceId/lottery-mode',
  requireRaceAccess('raceId'),
  operationLog({
    module: 'races',
    businessType: 'UPDATE',
    titleFactory: (req) => `更新赛事抽签模式: ${req.params?.raceId || ''}`,
  }),
  async (req, res, next) => {
    try {
      const payload = parseRaceLotteryModePayload(req.body);
      const race = await raceService.updateRace(
        req.raceAccess.operatorOrgId,
        req.raceAccess.raceId,
        payload,
      );
      if (!race) {
        return res.status(404).json({ success: false, message: 'Race not found' });
      }
      return res.json({ success: true, data: race });
    } catch (error) {
      return next(error);
    }
  },
);

router.patch(
  '/:raceId/conflict-rule',
  requireRaceAccess('raceId'),
  operationLog({
    module: 'races',
    businessType: 'UPDATE',
    titleFactory: (req) => `更新赛事名单冲突规则: ${req.params?.raceId || ''}`,
  }),
  async (req, res, next) => {
    try {
      const payload = parseRaceConflictRulePayload(req.body);
      const race = await raceService.updateRace(
        req.raceAccess.operatorOrgId,
        req.raceAccess.raceId,
        payload,
      );
      if (!race) {
        return res.status(404).json({ success: false, message: 'Race not found' });
      }
      return res.json({ success: true, data: race });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
