import knex from '../../db/knex.js'

export function listTypes() {
  return knex('sys_dict_type').orderBy('dict_type')
}

export async function createType(data) {
  const [result] = await knex('sys_dict_type')
    .insert({
      dict_type: data.dictType,
      dict_name: data.dictName,
      status: data.status,
      remark: data.remark,
    })
    .returning('*')
  return result
}

export async function updateType(id, data) {
  const updates = {
    ...(data.dictName !== undefined ? { dict_name: data.dictName } : {}),
    ...(data.status !== undefined ? { status: data.status } : {}),
    ...(data.remark !== undefined ? { remark: data.remark } : {}),
    updated_at: knex.fn.now(),
  }
  const [result] = await knex('sys_dict_type').where({ id }).update(updates).returning('*')
  return result
}

export function deleteType(id) {
  return knex('sys_dict_type').where({ id }).delete()
}

export function listData(dictType, { onlyEnabled = false } = {}) {
  const query = knex('sys_dict_data').where({ dict_type: dictType }).orderBy('sort_order')
  if (onlyEnabled) query.where('status', '0')
  return query
}

export async function createData(data) {
  const [result] = await knex('sys_dict_data')
    .insert({
      dict_type: data.dictType,
      dict_label: data.dictLabel,
      dict_value: data.dictValue,
      sort_order: data.sortOrder,
      css_class: data.cssClass,
      list_class: data.listClass,
      is_default: data.isDefault,
      status: data.status,
      remark: data.remark,
    })
    .returning('*')
  return result
}

export async function updateData(id, data) {
  const updates = {
    ...(data.dictLabel !== undefined ? { dict_label: data.dictLabel } : {}),
    ...(data.dictValue !== undefined ? { dict_value: data.dictValue } : {}),
    ...(data.sortOrder !== undefined ? { sort_order: data.sortOrder } : {}),
    ...(data.cssClass !== undefined ? { css_class: data.cssClass } : {}),
    ...(data.listClass !== undefined ? { list_class: data.listClass } : {}),
    ...(data.isDefault !== undefined ? { is_default: data.isDefault } : {}),
    ...(data.status !== undefined ? { status: data.status } : {}),
    ...(data.remark !== undefined ? { remark: data.remark } : {}),
    updated_at: knex.fn.now(),
  }
  const [result] = await knex('sys_dict_data').where({ id }).update(updates).returning('*')
  return result
}

export function deleteData(id) {
  return knex('sys_dict_data').where({ id }).delete()
}
