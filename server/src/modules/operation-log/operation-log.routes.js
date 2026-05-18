import express from 'express';
import knex from '../../db/knex.js';
import { requirePermission } from '../../middleware/require-permission.js';

const router = express.Router();

// All operation log routes require admin surface
router.use(requirePermission({ surface: 'admin' }));

// GET /api/admin/operation-logs - paginated list
router.get('/', async (req, res, next) => {
  try {
    const {
      page = 1,
      pageSize = 20,
      module,
      businessType,
      userId,
      status,
      startDate,
      endDate,
      keyword,
    } = req.query;
    const offset = (page - 1) * pageSize;

    let query = knex('operation_log')
      .leftJoin('users', 'operation_log.user_id', 'users.id')
      .select('operation_log.*', 'users.username', 'users.email')
      .orderBy('operation_log.created_at', 'desc');

    if (module) query = query.where('operation_log.module', module);
    if (businessType) query = query.where('operation_log.business_type', businessType);
    if (userId) query = query.where('operation_log.user_id', userId);
    if (status) query = query.where('operation_log.status', status);
    if (startDate) query = query.where('operation_log.created_at', '>=', startDate);
    if (endDate) query = query.where('operation_log.created_at', '<=', endDate + 'T23:59:59Z');
    if (keyword) query = query.where('operation_log.title', 'ilike', `%${keyword}%`);

    // Separate count query to avoid GROUP BY conflict with joined tables
    let countQuery = knex('operation_log');
    if (module) countQuery = countQuery.where('operation_log.module', module);
    if (businessType) countQuery = countQuery.where('operation_log.business_type', businessType);
    if (userId) countQuery = countQuery.where('operation_log.user_id', userId);
    if (status) countQuery = countQuery.where('operation_log.status', status);
    if (startDate) countQuery = countQuery.where('operation_log.created_at', '>=', startDate);
    if (endDate) countQuery = countQuery.where('operation_log.created_at', '<=', endDate + 'T23:59:59Z');
    if (keyword) countQuery = countQuery.where('operation_log.title', 'ilike', `%${keyword}%`);

    const [countResult] = await countQuery.count('id as total');
    const total = parseInt(countResult.total, 10);

    const logs = await query.clone().offset(offset).limit(parseInt(pageSize, 10));

    res.json({
      success: true,
      data: { logs, total, page: parseInt(page, 10), pageSize: parseInt(pageSize, 10) },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/operation-logs/modules/list - available module names for filter dropdown
router.get('/modules/list', async (req, res, next) => {
  try {
    const modules = await knex('operation_log')
      .distinct('module')
      .orderBy('module')
      .pluck('module');
    res.json({ success: true, data: modules });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/operation-logs/:id - single log detail
router.get('/:id', async (req, res, next) => {
  try {
    const log = await knex('operation_log')
      .leftJoin('users', 'operation_log.user_id', 'users.id')
      .select('operation_log.*', 'users.username')
      .where('operation_log.id', req.params.id)
      .first();

    if (!log) return res.status(404).json({ success: false, message: '日志不存在' });

    res.json({ success: true, data: log });
  } catch (err) {
    next(err);
  }
});

export default router;
