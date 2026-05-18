import knex from '../db/knex.js';

const SEED_DATA = [
  {
    type: 'sys_user_status',
    name: '用户状态',
    items: [
      { label: '正常', value: 'active', sort: 1, listClass: 'success' },
      { label: '禁用', value: 'disabled', sort: 2, listClass: 'danger' },
      { label: '锁定', value: 'locked', sort: 3, listClass: 'warning' },
    ],
  },
  {
    type: 'sys_job_status',
    name: '任务状态',
    items: [
      { label: '运行中', value: 'running', sort: 1 },
      { label: '已暂停', value: 'paused', sort: 2 },
    ],
  },
  {
    type: 'sys_job_log_status',
    name: '任务执行状态',
    items: [
      { label: '成功', value: 'success', sort: 1, listClass: 'success' },
      { label: '失败', value: 'fail', sort: 2, listClass: 'danger' },
    ],
  },
  {
    type: 'sys_operation_business_type',
    name: '操作类型',
    items: [
      { label: '新增', value: 'INSERT', sort: 1 },
      { label: '修改', value: 'UPDATE', sort: 2 },
      { label: '删除', value: 'DELETE', sort: 3 },
      { label: '导出', value: 'EXPORT', sort: 4 },
      { label: '导入', value: 'IMPORT', sort: 5 },
      { label: '授权', value: 'GRANT', sort: 6 },
      { label: '其他', value: 'OTHER', sort: 7 },
    ],
  },
  {
    type: 'gender',
    name: '性别',
    items: [
      { label: '男', value: 'male', sort: 1 },
      { label: '女', value: 'female', sort: 2 },
      { label: '其他', value: 'other', sort: 3 },
    ],
  },
  {
    type: 'race_status',
    name: '赛事状态',
    items: [
      { label: '草稿', value: 'draft', sort: 1 },
      { label: '报名中', value: 'open', sort: 2 },
      { label: '已截止', value: 'closed', sort: 3 },
      { label: '进行中', value: 'in_progress', sort: 4 },
      { label: '已完成', value: 'completed', sort: 5 },
      { label: '已取消', value: 'cancelled', sort: 6 },
    ],
  },
  {
    type: 'credential_status',
    name: '证件状态',
    items: [
      { label: '待审核', value: 'pending', sort: 1, listClass: 'warning' },
      { label: '已通过', value: 'approved', sort: 2, listClass: 'success' },
      { label: '已拒绝', value: 'rejected', sort: 3, listClass: 'danger' },
      { label: '已发放', value: 'issued', sort: 4, listClass: 'primary' },
      { label: '已作废', value: 'voided', sort: 5, listClass: 'default' },
    ],
  },
  {
    type: 'record_gender',
    name: '参赛者性别',
    items: [
      { label: '男', value: '男', sort: 1 },
      { label: '女', value: '女', sort: 2 },
    ],
  },
  {
    type: 'clothing_size',
    name: '服装尺码',
    items: [
      { label: 'XS', value: 'XS', sort: 1 },
      { label: 'S', value: 'S', sort: 2 },
      { label: 'M', value: 'M', sort: 3 },
      { label: 'L', value: 'L', sort: 4 },
      { label: 'XL', value: 'XL', sort: 5 },
      { label: '2XL', value: '2XL', sort: 6 },
      { label: '3XL', value: '3XL', sort: 7 },
      { label: '4XL', value: '4XL', sort: 8 },
    ],
  },
  {
    type: 'reimbursement_status',
    name: '报销状态',
    items: [
      { label: '待处理', value: 'pending', sort: 1 },
      { label: '处理中', value: 'processing', sort: 2 },
      { label: '已完成', value: 'completed', sort: 3 },
      { label: '有误', value: 'error', sort: 4 },
    ],
  },
];

export async function seedDictionaries() {
  const trx = await knex.transaction();
  try {
    for (const dict of SEED_DATA) {
      // Upsert dict type
      const [existing] = await trx('sys_dict_type').where('dict_type', dict.type);
      if (!existing) {
        await trx('sys_dict_type').insert({
          dict_type: dict.type,
          dict_name: dict.name,
        });
      }

      // Upsert dict data items
      for (const item of dict.items) {
        const [existingItem] = await trx('sys_dict_data')
          .where({ dict_type: dict.type, dict_value: item.value });
        if (!existingItem) {
          await trx('sys_dict_data').insert({
            dict_type: dict.type,
            dict_label: item.label,
            dict_value: item.value,
            sort_order: item.sort || 0,
            list_class: item.listClass || null,
          });
        }
      }
    }
    await trx.commit();
    console.log('[Seed] Dictionaries seeded successfully');
  } catch (err) {
    await trx.rollback();
    console.error('[Seed] Dictionary seeding failed:', err.message);
  }
}
