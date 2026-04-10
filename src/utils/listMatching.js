/**
 * 黑白名单匹配工具函数
 *
 * 从 LotteryListsPanel.jsx 提取的纯函数，用于通配符匹配、
 * 名单条目与选手记录的碰撞检测和状态回写。
 */

import recordsApi from '../api/records'

/**
 * 名单驱动的 lotteryStatus 合集，
 * 仅这些状态值受黑/白名单匹配逻辑管辖。
 */
export const LIST_DRIVEN_STATUSES = new Set([
  '直通名额',
  '不予通过',
  '模糊剔除',
  '强制剔除',
  '强制保签',
])

/**
 * 将简易通配符（`*` / `?`）转换为等价的正则表达式。
 * @param {string} pattern - 含 `*` 或 `?` 的字符串
 * @returns {RegExp}
 */
export function wildcardToRegex(pattern) {
  const escaped = String(pattern || '')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`, 'i')
}

/**
 * 判断值是否包含通配符。
 */
export function isWildcard(value) {
  return String(value || '').includes('*') || String(value || '').includes('?')
}

/**
 * 对单条名单条目执行精确匹配 / 模糊匹配。
 *
 * @param {{ idNumber: string }} entry - 名单条目
 * @param {Array<{ id: number, idNumber: string }>} records - 选手记录集合
 * @returns {{ matchedRecordId: number|null, matchType: string, matchedIds: number[] }}
 */
export function resolveEntryMatch(entry, records) {
  const idNumber = String(entry.idNumber || '').trim()
  if (!idNumber) {
    return { matchedRecordId: null, matchType: '', matchedIds: [] }
  }

  if (!isWildcard(idNumber)) {
    const matched = records.find((record) => String(record.idNumber || '').trim() === idNumber)
    return {
      matchedRecordId: matched?.id || null,
      matchType: matched ? 'exact' : '',
      matchedIds: matched?.id ? [matched.id] : [],
    }
  }

  const regex = wildcardToRegex(idNumber)
  const matchedIds = records
    .filter((record) => regex.test(String(record.idNumber || '').trim()))
    .map((record) => record.id)
    .filter(Boolean)

  return {
    matchedRecordId: matchedIds[0] || null,
    matchType: matchedIds.length ? 'fuzzy' : '',
    matchedIds,
  }
}

/**
 * 批量为名单条目执行匹配。
 */
export function buildResolvedEntries(entries, records) {
  return entries.map((entry) => {
    const match = resolveEntryMatch(entry, records)
    return {
      ...entry,
      matchedRecordId: match.matchedRecordId,
      matchType: match.matchType,
      _matchedIds: match.matchedIds,
    }
  })
}

/**
 * 根据匹配结果和冲突规则，批量写回 lotteryStatus。
 *
 * @param {Array} entries - 含 `_matchedIds` 的已解析名单
 * @param {Array} records - 选手记录集合
 * @param {'strict'|'permissive'} conflictRule - 冲突规则
 * @returns {Promise<{ updated: number, conflictCount: number }>}
 */
export async function applyStatusesForEntries(entries, records, conflictRule) {
  const exactWhitelist = new Set(
    entries
      .filter((entry) => entry.listType === 'whitelist' && !isWildcard(entry.idNumber))
      .map((entry) => String(entry.idNumber || '').trim()),
  )
  const exactBlacklist = new Set(
    entries
      .filter((entry) => entry.listType === 'blacklist' && !isWildcard(entry.idNumber))
      .map((entry) => String(entry.idNumber || '').trim()),
  )

  const conflictIds = new Set(
    [...exactWhitelist].filter((idNumber) => exactBlacklist.has(idNumber)),
  )

  const updates = new Map()

  entries.forEach((entry) => {
    const matchedIds = Array.isArray(entry._matchedIds) ? entry._matchedIds : []
    if (!matchedIds.length) return

    let nextStatus = ''
    const exactConflict = conflictIds.has(String(entry.idNumber || '').trim())

    if (exactConflict) {
      nextStatus = conflictRule === 'strict' ? '强制剔除' : '强制保签'
    } else if (entry.listType === 'whitelist') {
      nextStatus = '直通名额'
    } else {
      nextStatus = entry.matchType === 'fuzzy' ? '模糊剔除' : '不予通过'
    }

    matchedIds.forEach((recordId) => {
      const record = records.find((item) => item.id === recordId)
      if (!record) return
      updates.set(recordId, { id: recordId, data: { lotteryStatus: nextStatus } })
    })
  })

  records.forEach((record) => {
    if (!record?.id) return
    if (!LIST_DRIVEN_STATUSES.has(record.lotteryStatus || '')) return
    if (updates.has(record.id)) return
    updates.set(record.id, { id: record.id, data: { lotteryStatus: '' } })
  })

  if (updates.size > 0) {
    await recordsApi.bulkUpdate(Array.from(updates.values()))
  }

  return { updated: updates.size, conflictCount: conflictIds.size }
}
