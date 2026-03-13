import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door';
process.env.ASSESSMENT_FIELD_ENCRYPTION_KEY = process.env.ASSESSMENT_FIELD_ENCRYPTION_KEY || 'test-assessment-field-encryption-key';
process.env.ASSESSMENT_SESSION_JWT_SECRET = process.env.ASSESSMENT_SESSION_JWT_SECRET || 'test-assessment-session-secret';
process.env.ASSESSMENT_HASH_PEPPER = process.env.ASSESSMENT_HASH_PEPPER || 'test-assessment-hash-pepper';

const { default: knex } = await import('../src/db/knex.js');
const { default: assessmentAdminRoutes } = await import('../src/modules/assessment/assessment-admin.routes.js');
const { default: assessmentPublicRoutes } = await import('../src/modules/assessment/assessment-public.routes.js');

let app;

async function clearAssessmentTables() {
    await knex('assessment_member_report_snapshots').del();
    await knex('assessment_submissions').del();
    await knex('assessment_drafts').del();
    await knex('assessment_sessions').del();
    await knex('assessment_invite_codes').del();
    await knex('assessment_members').del();
    await knex('assessment_template_snapshots').del();
    await knex('assessment_campaigns').del();
    await knex('races').del();
    await knex('organizations').del();
}

describe('Assessment Routes', () => {
    before(async () => {
        await knex.migrate.latest();
        app = express();
        app.use(express.json());
        app.use('/api/admin/assessment', (req, _res, next) => {
            req.authContext = { userId: 'super-admin-test', role: 'super_admin', orgId: null };
            next();
        }, assessmentAdminRoutes);
        app.use('/api/assessment/public', assessmentPublicRoutes);
    });

    beforeEach(async () => {
        await clearAssessmentTables();
    });

    after(async () => {
        await clearAssessmentTables();
        await knex.destroy();
    });

    it('supports the assessment flow from campaign creation to submission', async () => {
        const [org] = await knex('organizations')
            .insert({ name: 'Assessment Test Org', slug: 'assessment-test-org' })
            .returning('*');
        const [race] = await knex('races')
            .insert({
                org_id: org.id,
                name: 'Assessment Race',
                date: '2026-03-13',
                location: 'Shanghai',
                events: JSON.stringify([]),
                conflict_rule: 'strict',
            })
            .returning('*');

        const createRes = await request(app)
            .post('/api/admin/assessment/campaigns')
            .send({ raceId: race.id, name: 'Race Assessment', year: 2026 });
        assert.equal(createRes.status, 201);
        const campaignId = createRes.body.data.campaign.id;

        const rosterRows = [
            { employeeCode: 'A001', employeeName: 'Alice', position: 'Lead', teamName: 'Ops', department: 'Field', sortOrder: 1 },
            { employeeCode: 'A002', employeeName: 'Bob', position: 'Support', teamName: 'Ops', department: 'Field', sortOrder: 2 },
        ];

        const previewRes = await request(app)
            .post(`/api/admin/assessment/campaigns/${campaignId}/roster/import-preview`)
            .send({ rows: rosterRows });
        assert.equal(previewRes.status, 200);
        assert.equal(previewRes.body.data.rowCount, 2);

        const commitRes = await request(app)
            .post(`/api/admin/assessment/campaigns/${campaignId}/roster/commit`)
            .send({ rows: previewRes.body.data.rows });
        assert.equal(commitRes.status, 200);
        assert.equal(commitRes.body.data.length, 2);

        const publishRes = await request(app)
            .post(`/api/admin/assessment/campaigns/${campaignId}/publish`)
            .send();
        assert.equal(publishRes.status, 200);
        assert.equal(publishRes.body.data.campaign.status, 'published');

        const codeRes = await request(app)
            .post(`/api/admin/assessment/campaigns/${campaignId}/invite-codes/generate`)
            .send({ count: 1 });
        assert.equal(codeRes.status, 200);
        const inviteCode = codeRes.body.data.inviteCodes[0].plainCode;

        const loginRes = await request(app)
            .post(`/api/assessment/public/campaigns/${campaignId}/login`)
            .send({ inviteCode, deviceFingerprint: 'device-1' });
        assert.equal(loginRes.status, 200);
        const accessToken = loginRes.body.data.accessToken;
        assert.ok(accessToken);
        assert.equal(loginRes.body.data.progress.totalCount, 2);

        const memberId = loginRes.body.data.progress.items[0].id;

        const saveDraftRes = await request(app)
            .put(`/api/assessment/public/campaigns/${campaignId}/members/${memberId}/draft`)
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
                scores: Array.from({ length: 10 }, (_, index) => ({ itemId: `item_${index + 1}`, score: index === 0 ? 8 : null })),
                comment: 'draft comment',
            });
        assert.equal(saveDraftRes.status, 200);

        const getDraftRes = await request(app)
            .get(`/api/assessment/public/campaigns/${campaignId}/members/${memberId}/draft`)
            .set('Authorization', `Bearer ${accessToken}`);
        assert.equal(getDraftRes.status, 200);
        assert.equal(getDraftRes.body.data.draft.comment, 'draft comment');

        const submitRes = await request(app)
            .post(`/api/assessment/public/campaigns/${campaignId}/members/${memberId}/submission`)
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
                scores: Array.from({ length: 10 }, (_, index) => ({ itemId: `item_${index + 1}`, score: index + 1 })),
                comment: 'final comment',
            });
        assert.equal(submitRes.status, 200);
        assert.equal(submitRes.body.data.progress.completedCount, 1);

        const progressRes = await request(app)
            .get(`/api/assessment/public/campaigns/${campaignId}/progress`)
            .set('Authorization', `Bearer ${accessToken}`);
        assert.equal(progressRes.status, 200);
        assert.equal(progressRes.body.data.completedCount, 1);
    });
});
