import express from 'express';
import knex from '../../db/knex.js';

const router = express.Router();
const adminRouter = express.Router();

// GET /api/admin/dict/type/list - list all dict types
adminRouter.get('/type/list', async (req, res, next) => {
  try {
    const types = await knex('sys_dict_type').orderBy('dict_type');
    res.json({ success: true, data: types });
  } catch (err) { next(err); }
});

// POST /api/admin/dict/type - create dict type
adminRouter.post('/type', async (req, res, next) => {
  try {
    const { dictType, dictName, remark } = req.body;
    const [inserted] = await knex('sys_dict_type')
      .insert({ dict_type: dictType, dict_name: dictName, remark })
      .returning('*');
    res.json({ success: true, data: inserted });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ success: false, message: '字典类型已存在' });
    next(err);
  }
});

// PUT /api/admin/dict/type/:id - update dict type
adminRouter.put('/type/:id', async (req, res, next) => {
  try {
    const { dictName, status, remark } = req.body;
    const [updated] = await knex('sys_dict_type')
      .where('id', req.params.id)
      .update({ dict_name: dictName, status, remark, updated_at: knex.fn.now() })
      .returning('*');
    if (!updated) return res.status(404).json({ success: false, message: '字典类型不存在' });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// DELETE /api/admin/dict/type/:id - delete dict type (cascades to data)
adminRouter.delete('/type/:id', async (req, res, next) => {
  try {
    const deleted = await knex('sys_dict_type').where('id', req.params.id).del();
    if (!deleted) return res.status(404).json({ success: false, message: '字典类型不存在' });
    res.json({ success: true, message: '删除成功' });
  } catch (err) { next(err); }
});

// GET /api/admin/dict/data/:dictType - get dict data for a type
adminRouter.get('/data/:dictType', async (req, res, next) => {
  try {
    const items = await knex('sys_dict_data')
      .where('dict_type', req.params.dictType)
      .orderBy('sort_order');
    res.json({ success: true, data: items });
  } catch (err) { next(err); }
});

// POST /api/admin/dict/data - create dict data entry
adminRouter.post('/data', async (req, res, next) => {
  try {
    const { dictType, dictLabel, dictValue, sortOrder, cssClass, listClass, isDefault, status, remark } = req.body;
    const [inserted] = await knex('sys_dict_data')
      .insert({
        dict_type: dictType, dict_label: dictLabel, dict_value: dictValue,
        sort_order: sortOrder || 0, css_class: cssClass, list_class: listClass,
        is_default: isDefault || 'N', status: status || '0', remark,
      })
      .returning('*');
    res.json({ success: true, data: inserted });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ success: false, message: '字典数据已存在' });
    next(err);
  }
});

// PUT /api/admin/dict/data/:id - update dict data entry
adminRouter.put('/data/:id', async (req, res, next) => {
  try {
    const { dictLabel, dictValue, sortOrder, cssClass, listClass, isDefault, status, remark } = req.body;
    const [updated] = await knex('sys_dict_data')
      .where('id', req.params.id)
      .update({
        dict_label: dictLabel, dict_value: dictValue,
        sort_order: sortOrder, css_class: cssClass, list_class: listClass,
        is_default: isDefault, status, remark,
        updated_at: knex.fn.now(),
      })
      .returning('*');
    if (!updated) return res.status(404).json({ success: false, message: '字典数据不存在' });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// DELETE /api/admin/dict/data/:id - delete dict data entry
adminRouter.delete('/data/:id', async (req, res, next) => {
  try {
    const deleted = await knex('sys_dict_data').where('id', req.params.id).del();
    if (!deleted) return res.status(404).json({ success: false, message: '字典数据不存在' });
    res.json({ success: true, message: '删除成功' });
  } catch (err) { next(err); }
});

// ── Public routes (for dropdowns) ─────────────────────────────

/**
 * @swagger
 * /api/public/dict/{dictType}:
 *   get:
 *     tags: [Dictionary]
 *     summary: 获取字典数据
 *     description: 根据字典类型获取启用的字典数据列表，用于下拉框等前端组件
 *     security: []
 *     parameters:
 *       - in: path
 *         name: dictType
 *         required: true
 *         schema:
 *           type: string
 *         description: 字典类型编码
 *     responses:
 *       200:
 *         description: 获取成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       dict_label:
 *                         type: string
 *                       dict_value:
 *                         type: string
 *                       sort_order:
 *                         type: integer
 */
// GET /api/public/dict/:dictType - get dict data for a type
router.get('/:dictType', async (req, res, next) => {
  try {
    const items = await knex('sys_dict_data')
      .where({ dict_type: req.params.dictType, status: '0' })
      .orderBy('sort_order');
    res.json({ success: true, data: items });
  } catch (err) { next(err); }
});

export { router as publicRoutes, adminRouter as adminRoutes };
