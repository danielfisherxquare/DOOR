import { pickFields, requireRecord, validationError } from '../../lib/http/validation.js';
import { normalizeEvent } from '../../utils/event-normalizer.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const conflictRules = new Set(['strict', 'permissive']);
const lotteryModes = new Set(['lottery', 'direct']);

function invalid(message) {
  throw validationError(message, undefined, 'RACE_INPUT_INVALID');
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

function uuid(value, label, { optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return undefined;
    invalid(`${label} 不能为空`);
  }
  const parsed = String(value).trim();
  if (!uuidPattern.test(parsed)) invalid(`${label} 格式无效`);
  return parsed;
}

function option(value, label, allowed, { optional = false, fallback } = {}) {
  if (value === undefined) return optional ? undefined : fallback;
  const parsed = String(value);
  if (!allowed.has(parsed)) invalid(`${label} 无效`);
  return parsed;
}

function coordinate(value, label, min, max, { optional = false } = {}) {
  if (value === undefined) return optional ? undefined : null;
  if (value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    invalid(`${label} 必须在 ${min} 到 ${max} 之间`);
  }
  return parsed;
}

function raceDate(value, { optional = false } = {}) {
  if (value === undefined && optional) return undefined;
  const parsed = text(value, 'date', { max: 10 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed)) invalid('date 必须使用 YYYY-MM-DD 格式');
  const [year, month, day] = parsed.split('-').map(Number);
  const normalized = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1900 ||
    year > 2200 ||
    normalized.getUTCFullYear() !== year ||
    normalized.getUTCMonth() !== month - 1 ||
    normalized.getUTCDate() !== day
  ) {
    invalid('date 不是有效日期');
  }
  return parsed;
}

function events(value, { optional = false } = {}) {
  if (value === undefined) return optional ? undefined : undefined;
  if (value === null) return [];
  if (!Array.isArray(value)) invalid('events 必须是数组');
  if (value.length > 100) invalid('events 最多 100 项');
  const seen = new Set();
  return value.map((entry, index) => {
    const item = pickFields(entry, ['name', 'targetCount'], { label: `events[${index}]` });
    const name = normalizeEvent(text(item.name, `events[${index}].name`, { max: 200 }));
    if (seen.has(name)) invalid(`events[${index}].name 规范化后重复`);
    seen.add(name);
    const targetCount = Number(item.targetCount ?? 0);
    if (!Number.isSafeInteger(targetCount) || targetCount < 0 || targetCount > 100_000_000) {
      invalid(`events[${index}].targetCount 必须是非负整数`);
    }
    return { name, targetCount };
  });
}

function parseRacePayload(value, { partial }) {
  const data = pickFields(value, [
    'name',
    'date',
    'location',
    'conflictRule',
    'events',
    'orgId',
    'locationLat',
    'locationLng',
    'routeData',
    'mapFeaturesData',
    'lotteryModeDefault',
  ]);
  const result = compact({
    name: text(data.name, 'name', { max: 300, optional: partial }),
    date: raceDate(data.date, { optional: partial }),
    location: text(data.location, 'location', { max: 500, optional: partial, nullable: true }),
    conflictRule: option(data.conflictRule, 'conflictRule', conflictRules, {
      optional: partial,
      fallback: 'strict',
    }),
    events: events(data.events, { optional: true }),
    orgId: uuid(data.orgId, 'orgId', { optional: true }),
    locationLat: coordinate(data.locationLat, 'locationLat', -90, 90, { optional: partial }),
    locationLng: coordinate(data.locationLng, 'locationLng', -180, 180, { optional: partial }),
    routeData: text(data.routeData, 'routeData', { max: 5_000_000, optional: partial, nullable: true }),
    mapFeaturesData: text(data.mapFeaturesData, 'mapFeaturesData', {
      max: 5_000_000,
      optional: partial,
      nullable: true,
    }),
    lotteryModeDefault: option(data.lotteryModeDefault, 'lotteryModeDefault', lotteryModes, {
      optional: partial,
      fallback: 'lottery',
    }),
  });
  if (partial) {
    const mutableKeys = Object.keys(result).filter((key) => key !== 'orgId');
    if (mutableKeys.length === 0) invalid('至少提供一个可更新字段');
  }
  return result;
}

export function parseRaceCreatePayload(value) {
  return parseRacePayload(value, { partial: false });
}

export function parseRaceUpdatePayload(value) {
  return parseRacePayload(value, { partial: true });
}

export function parseRaceListFilters(value = {}) {
  const query = pickFields(value, ['orgId'], { label: '查询参数' });
  return compact({ orgId: uuid(query.orgId, 'orgId', { optional: true }) });
}

export function parseRaceLotteryModePayload(value) {
  const record = requireRecord(value);
  const unknownFields = Object.keys(record).filter((key) => key !== 'lotteryModeDefault');
  if (unknownFields.length > 0) {
    invalid(`不支持修改字段：${unknownFields.join('、')}`);
  }
  if (!Object.hasOwn(record, 'lotteryModeDefault')) {
    invalid('lotteryModeDefault 不能为空');
  }
  return {
    lotteryModeDefault: option(
      record.lotteryModeDefault,
      'lotteryModeDefault',
      lotteryModes,
      { fallback: 'lottery' },
    ),
  };
}

export function parseRaceConflictRulePayload(value) {
  const record = requireRecord(value);
  const unknownFields = Object.keys(record).filter((key) => key !== 'conflictRule');
  if (unknownFields.length > 0) {
    invalid(`不支持修改字段：${unknownFields.join('、')}`);
  }
  if (!Object.hasOwn(record, 'conflictRule')) {
    invalid('conflictRule 不能为空');
  }
  return {
    conflictRule: option(record.conflictRule, 'conflictRule', conflictRules),
  };
}
