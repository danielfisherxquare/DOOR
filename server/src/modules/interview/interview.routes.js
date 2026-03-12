import { Router } from 'express';
import InterviewService from './interview.service.js';

const router = Router();

router.get('/', async (req, res, next) => {
    try {
        const { limit, offset, orderBy, orderDir } = req.query;
        const interviews = await InterviewService.list({ 
            limit: limit ? parseInt(limit) : undefined,
            offset: offset ? parseInt(offset) : undefined,
            orderBy,
            orderDir
        });
        res.json({ success: true, data: interviews });
    } catch (err) {
        next(err);
    }
});

router.get('/criteria', (req, res) => {
    res.json({ success: true, data: InterviewService.getCriteriaData() });
});

router.get('/:id', async (req, res, next) => {
    try {
        const interview = await InterviewService.getById(req.params.id);
        if (!interview) {
            return res.status(404).json({ success: false, error: 'Interview not found' });
        }
        res.json({ success: true, data: interview });
    } catch (err) {
        next(err);
    }
});

router.post('/', async (req, res, next) => {
    try {
        const { candidate_name, interview_date, interviewer, scores, notes } = req.body;
        
        if (!candidate_name || !interview_date) {
            return res.status(400).json({ 
                success: false, 
                error: 'candidate_name and interview_date are required' 
            });
        }
        
        const interview = await InterviewService.create({
            candidate_name,
            interview_date,
            interviewer,
            scores,
            notes
        });
        
        res.status(201).json({ success: true, data: interview });
    } catch (err) {
        next(err);
    }
});

router.put('/:id', async (req, res, next) => {
    try {
        const { candidate_name, interview_date, interviewer, scores, notes } = req.body;
        
        const interview = await InterviewService.update(req.params.id, {
            candidate_name,
            interview_date,
            interviewer,
            scores,
            notes
        });
        
        if (!interview) {
            return res.status(404).json({ success: false, error: 'Interview not found' });
        }
        
        res.json({ success: true, data: interview });
    } catch (err) {
        next(err);
    }
});

router.delete('/:id', async (req, res, next) => {
    try {
        const deleted = await InterviewService.delete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ success: false, error: 'Interview not found' });
        }
        res.json({ success: true, data: deleted });
    } catch (err) {
        next(err);
    }
});

router.post('/compare', async (req, res, next) => {
    try {
        const { ids } = req.body;
        
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'ids array is required' 
            });
        }
        
        const interviews = await InterviewService.compare(ids);
        res.json({ success: true, data: interviews });
    } catch (err) {
        next(err);
    }
});

export default router;