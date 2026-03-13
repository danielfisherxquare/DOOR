import knex from '../db/knex.js';
import { verifyAssessmentSessionToken } from '../modules/assessment/assessment-crypto.js';

export async function requireAssessmentSession(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Assessment session required' });
    }

    try {
        const decoded = verifyAssessmentSessionToken(authHeader.slice(7));
        if (req.params?.campaignId && String(req.params.campaignId) !== String(decoded.campaignId)) {
            return res.status(401).json({ success: false, message: 'Assessment session campaign mismatch' });
        }
        const session = await knex('assessment_sessions')
            .where({ id: decoded.sessionId, invite_code_id: decoded.inviteCodeId, campaign_id: decoded.campaignId })
            .where('status', 'active')
            .where('expires_at', '>', new Date())
            .first();

        if (!session) {
            return res.status(401).json({ success: false, message: 'Assessment session expired' });
        }

        req.assessmentContext = {
            sessionId: decoded.sessionId,
            inviteCodeId: decoded.inviteCodeId,
            campaignId: decoded.campaignId,
        };
        next();
    } catch (_error) {
        return res.status(401).json({ success: false, message: 'Assessment session invalid' });
    }
}
