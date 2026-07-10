import { pickFields, validationError } from '../../lib/http/validation.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const taskStatuses = new Set(['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']);

function invalid(message) {
  throw validationError(message, undefined, 'PROJECT_INPUT_INVALID');
}

function compact(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function text(value, label, { max, optional = false, nullable = false } = {}) {
  if (value === undefined) return optional ? undefined : (nullable ? null : invalid(`${label} 不能为空`));
  if (value === null || value === '') {
    if (nullable) return null;
    invalid(`${label} 不能为空`);
  }
  const parsed = String(value).trim();
  if (!parsed) {
    if (nullable) return null;
    invalid(`${label} 不能为空`);
  }
  if (parsed.length > max) invalid(`${label} 最长 ${max} 个字符`);
  return parsed;
}

function uuid(value, label, { optional = false, nullable = false } = {}) {
  if (value === undefined) return optional ? undefined : (nullable ? null : invalid(`${label} 不能为空`));
  if (value === null || value === '') {
    if (nullable) return null;
    invalid(`${label} 不能为空`);
  }
  const parsed = String(value).trim();
  if (!uuidPattern.test(parsed)) invalid(`${label} 格式无效`);
  return parsed;
}

function positiveInteger(value, label, { optional = false, nullable = false } = {}) {
  if (value === undefined) return optional ? undefined : (nullable ? null : invalid(`${label} 不能为空`));
  if (value === null || value === '') {
    if (nullable) return null;
    invalid(`${label} 不能为空`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) invalid(`${label} 必须是正整数`);
  return parsed;
}

function dateTime(value, label, { optional = false } = {}) {
  if (value === undefined) return optional ? undefined : null;
  if (value === null || value === '') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) invalid(`${label} 格式无效`);
  return parsed.toISOString();
}

function boolean(value, label, { optional = false } = {}) {
  if (value === undefined) return optional ? undefined : false;
  if (typeof value !== 'boolean') invalid(`${label} 必须是布尔值`);
  return value;
}

function finiteNumber(value, label, { optional = false } = {}) {
  if (value === undefined) return optional ? undefined : 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Math.abs(parsed) > 1_000_000) invalid(`${label} 格式无效`);
  return parsed;
}

export function parseProjectId(value, label = 'projectId') {
  return uuid(value, label);
}

export function parseProjectFilters(value = {}) {
  const query = pickFields(value, ['orgId', 'raceId'], { label: '查询参数' });
  return compact({
    orgId: uuid(query.orgId, 'orgId', { optional: true }),
    raceId: positiveInteger(query.raceId, 'raceId', { optional: true }),
  });
}

export function parseProjectPayload(value, { partial = false } = {}) {
  const data = pickFields(value, ['name', 'description', 'race_id', 'org_id']);
  const result = compact({
    name: text(data.name, 'name', { max: 200, optional: partial }),
    description: text(data.description, 'description', { max: 10_000, optional: partial, nullable: true }),
    raceId: positiveInteger(data.race_id, 'race_id', { optional: partial, nullable: true }),
    orgId: uuid(data.org_id, 'org_id', { optional: partial, nullable: true }),
  });
  if (partial && Object.keys(result).length === 0) invalid('至少提供一个可更新字段');
  return result;
}

export function parseTaskPayload(value, { partial = false } = {}) {
  const data = pickFields(value, [
    'title',
    'parent_id',
    'status',
    'start_date',
    'end_date',
    'is_milestone',
    'notes',
    'sort_order',
    'responsible_group',
  ]);
  const status = data.status === undefined && partial ? undefined : String(data.status || 'TODO');
  if (status !== undefined && !taskStatuses.has(status)) invalid('status 无效');
  const result = compact({
    title: text(data.title, 'title', { max: 500, optional: partial }),
    parentId: uuid(data.parent_id, 'parent_id', { optional: partial, nullable: true }),
    status,
    startDate: dateTime(data.start_date, 'start_date', { optional: partial }),
    endDate: dateTime(data.end_date, 'end_date', { optional: partial }),
    isMilestone: boolean(data.is_milestone, 'is_milestone', { optional: partial }),
    notes: text(data.notes, 'notes', { max: 50_000, optional: partial, nullable: true }),
    sortOrder: finiteNumber(data.sort_order, 'sort_order', { optional: partial }),
    responsibleGroup: text(data.responsible_group, 'responsible_group', {
      max: 500,
      optional: partial,
      nullable: true,
    }),
  });
  if (partial && Object.keys(result).length === 0) invalid('至少提供一个可更新字段');
  if (result.startDate && result.endDate && result.startDate > result.endDate) {
    invalid('开始日期不能晚于结束日期');
  }
  return result;
}

export function parseAssigneePayload(value) {
  const data = pickFields(value, ['assignees']);
  if (!Array.isArray(data.assignees)) invalid('assignees 必须是数组');
  if (data.assignees.length > 100) invalid('assignees 最多 100 项');
  const seen = new Set();
  return data.assignees.map((entry, index) => {
    const item = pickFields(entry, ['sourceType', 'teamMemberId', 'position'], {
      label: `assignees[${index}]`,
    });
    if (item.sourceType !== 'team_member') invalid(`assignees[${index}].sourceType 必须是 team_member`);
    const teamMemberId = uuid(item.teamMemberId, `assignees[${index}].teamMemberId`);
    if (seen.has(teamMemberId)) invalid(`assignees[${index}].teamMemberId 重复`);
    seen.add(teamMemberId);
    return {
      sourceType: 'team_member',
      teamMemberId,
      position: text(item.position, `assignees[${index}].position`, {
        max: 200,
        optional: true,
        nullable: true,
      }),
    };
  });
}

export function parseCandidateFilters(value = {}) {
  const query = pickFields(value, ['keyword'], { label: '查询参数' });
  return {
    keyword: text(query.keyword, 'keyword', { max: 100, optional: true, nullable: true }) || '',
  };
}
