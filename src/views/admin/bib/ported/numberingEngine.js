import { isBibEligibleStatus } from "./bibEligibility";
import { isHalfEvent } from "./eventUtils";
import {
  calculateNextStartNumber,
  defaultEventWindowRange,
  eventWindowMapKey,
  sanitizeEventWindowRange,
  windowCountFromRange
} from "./eventWindowUtils";
const DEFAULT_ZONE = "UNASSIGNED";
const DEFAULT_EVENT = "UNSPECIFIED_EVENT";
function pad2(n) {
  return String(n).padStart(2, "0");
}
function pad3(n) {
  return String(n).padStart(3, "0");
}
function normalizeGender(v) {
  const raw = String(v || "").trim().toUpperCase();
  if (raw === "M" || raw === "MALE" || raw === "\u7537") return "M";
  if (raw === "F" || raw === "FEMALE" || raw === "\u5973") return "F";
  return null;
}
function normalizeZone(v) {
  const zone = String(v || "").trim();
  return zone || DEFAULT_ZONE;
}
function normalizeEvent(v) {
  return String(v || "").trim();
}
function resolveEventLabel(v) {
  const event = normalizeEvent(v);
  return event || DEFAULT_EVENT;
}
function zonePrefix(zone) {
  const trimmed = String(zone || "").trim();
  if (!trimmed) return "Z";
  const firstAlphaNum = trimmed.match(/[A-Za-z0-9]/)?.[0];
  if (firstAlphaNum) return firstAlphaNum.toUpperCase();
  return trimmed.charAt(0).toUpperCase();
}
function normalizePrefix(v) {
  const raw = String(v || "").trim();
  if (!raw) return "";
  const first = raw.match(/[A-Za-z0-9]/)?.[0];
  return first ? first.toUpperCase() : "";
}
function resolveZonePrefix(zone, zonePrefixMap) {
  const mapped = normalizePrefix(zonePrefixMap?.[zone]);
  if (mapped) return mapped;
  return zonePrefix(zone);
}
function formatBibNo(prefix, num, digits) {
  const d = Math.max(1, Math.floor(digits || 5));
  return `${prefix}${String(num).padStart(d, "0")}`;
}
function normalizeStartNo(v, fallback) {
  const parsed = Number(v);
  if (!Number.isFinite(parsed)) return Math.max(1, Math.floor(fallback));
  return Math.max(1, Math.floor(parsed));
}
function parseTimeToSeconds(raw) {
  if (typeof raw !== "string") return Number.POSITIVE_INFINITY;
  const t = raw.trim();
  if (!t || t === "0") return Number.POSITIVE_INFINITY;
  const parts = t.split(":");
  if (parts.length === 3) {
    const [h, m, s] = parts.map((v) => Number(v));
    if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) return Number.POSITIVE_INFINITY;
    if (h < 0 || m < 0 || m >= 60 || s < 0 || s >= 60) return Number.POSITIVE_INFINITY;
    const total = h * 3600 + m * 60 + s;
    return total > 0 ? total : Number.POSITIVE_INFINITY;
  }
  if (parts.length === 2) {
    const [m, s] = parts.map((v) => Number(v));
    if (!Number.isFinite(m) || !Number.isFinite(s)) return Number.POSITIVE_INFINITY;
    if (m < 0 || s < 0 || s >= 60) return Number.POSITIVE_INFINITY;
    const total = m * 60 + s;
    return total > 0 ? total : Number.POSITIVE_INFINITY;
  }
  return Number.POSITIVE_INFINITY;
}
function readNetTimeField(v) {
  if (!v) return "";
  if (typeof v === "object" && v !== null) {
    const maybe = v.netTime;
    return typeof maybe === "string" ? maybe : "";
  }
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("{")) {
      try {
        const obj = JSON.parse(trimmed);
        return typeof obj.netTime === "string" ? obj.netTime : "";
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  return "";
}
function scoreSeconds(record) {
  const pb = isHalfEvent(record.event) ? record.personalBestHalf : record.personalBestFull;
  const netTime = readNetTimeField(pb);
  return parseTimeToSeconds(netTime);
}
function compareStable(a, b) {
  if (a.scoreSec !== b.scoreSec) return a.scoreSec - b.scoreSec;
  if (a.stableId !== b.stableId) return a.stableId - b.stableId;
  if (a.stableImportedAt !== b.stableImportedAt) return a.stableImportedAt - b.stableImportedAt;
  const idCmp = a.stableIdNumber.localeCompare(b.stableIdNumber, "zh-CN");
  if (idCmp !== 0) return idCmp;
  const nameCmp = a.stableName.localeCompare(b.stableName, "zh-CN");
  if (nameCmp !== 0) return nameCmp;
  return a.originalIndex - b.originalIndex;
}
function makeCapacityError(scopeLabel, windowType, needed, capacity) {
  const label = windowType === "bagWindowNo" ? "bag window" : "expo window";
  return new Error(`[Bib numbering failed] ${label} capacity insufficient: ${scopeLabel}, needed=${needed}, capacity=${capacity}`);
}
function assignRoundRobinWindow(scopeLabel, windowType, count, windowStartNo, windowCount, windowCapacity) {
  if (!Number.isInteger(windowStartNo) || windowStartNo <= 0) {
    throw new Error(`[Bib numbering failed] ${windowType} invalid config: windowStartNo=${windowStartNo}`);
  }
  if (!Number.isInteger(windowCount) || windowCount <= 0) {
    throw new Error(`[Bib numbering failed] ${windowType} invalid config: windowCount=${windowCount}`);
  }
  if (!Number.isInteger(windowCapacity) || windowCapacity <= 0) {
    throw new Error(`[Bib numbering failed] ${windowType} invalid config: windowCapacity=${windowCapacity}`);
  }
  const totalCapacity = windowCount * windowCapacity;
  if (totalCapacity < count) {
    throw makeCapacityError(scopeLabel, windowType, count, totalCapacity);
  }
  const used = Array.from({ length: windowCount }, () => 0);
  const result = [];
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    let placed = false;
    for (let step = 0; step < windowCount; step++) {
      const idx = (cursor + step) % windowCount;
      if (used[idx] >= windowCapacity) continue;
      used[idx] += 1;
      result.push(pad2(windowStartNo + idx));
      cursor = (idx + 1) % windowCount;
      placed = true;
      break;
    }
    if (!placed) {
      throw makeCapacityError(scopeLabel, windowType, count, totalCapacity);
    }
  }
  return result;
}
function buildBagNos(windowNos) {
  const seq = /* @__PURE__ */ new Map();
  return windowNos.map((windowNo) => {
    const next = (seq.get(windowNo) || 0) + 1;
    seq.set(windowNo, next);
    return pad3(next);
  });
}
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = h << 13 | h >>> 19;
  }
  return () => {
    h = Math.imul(h ^ h >>> 16, 2246822507);
    h = Math.imul(h ^ h >>> 13, 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}
function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 1831565813;
    let r = Math.imul(t ^ t >>> 15, t | 1);
    r ^= r + Math.imul(r ^ r >>> 7, r | 61);
    return ((r ^ r >>> 14) >>> 0) / 4294967296;
  };
}
function createRandom(seed) {
  if (!seed) return Math.random;
  const seedFn = xmur3(seed);
  return mulberry32(seedFn());
}
function shuffleWithRandom(arr, rand) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function assignBibNosPerZone(zone, zoneRunners, config) {
  const groups = /* @__PURE__ */ new Map();
  for (const runner of zoneRunners) {
    const list = groups.get(runner.normalizedGender) || [];
    list.push(runner);
    groups.set(runner.normalizedGender, list);
  }
  for (const list of groups.values()) {
    list.sort(compareStable);
  }
  const zoneMaleStart = config.zoneStartNoMaleMap?.[zone];
  const zoneFemaleStart = config.zoneStartNoFemaleMap?.[zone];
  let maleNo = normalizeStartNo(zoneMaleStart, config.startNoMale);
  let femaleNo = normalizeStartNo(zoneFemaleStart, config.startNoFemale);
  for (const runner of groups.get("M") || []) {
    runner.bibNo = formatBibNo(runner.zonePrefix, maleNo++, config.bibDigits);
    runner.bibColor = runner.zoneColor;
  }
  for (const runner of groups.get("F") || []) {
    runner.bibNo = formatBibNo(runner.zonePrefix, femaleNo++, config.bibDigits);
    runner.bibColor = runner.zoneColor;
  }
}
function assignBibNosGlobal(zoneToRunners, config) {
  const byGender = /* @__PURE__ */ new Map();
  for (const zoneRunners of zoneToRunners.values()) {
    for (const runner of zoneRunners) {
      const list = byGender.get(runner.normalizedGender) || [];
      list.push(runner);
      byGender.set(runner.normalizedGender, list);
    }
  }
  const globalComparator = (a, b) => {
    if (a.zoneRank !== b.zoneRank) return a.zoneRank - b.zoneRank;
    return compareStable(a, b);
  };
  for (const list of byGender.values()) {
    list.sort(globalComparator);
  }
  let maleNo = Math.max(1, Math.floor(config.startNoMale));
  let femaleNo = Math.max(1, Math.floor(config.startNoFemale));
  for (const runner of byGender.get("M") || []) {
    runner.bibNo = formatBibNo(runner.zonePrefix, maleNo++, config.bibDigits);
    runner.bibColor = runner.zoneColor;
  }
  for (const runner of byGender.get("F") || []) {
    runner.bibNo = formatBibNo(runner.zonePrefix, femaleNo++, config.bibDigits);
    runner.bibColor = runner.zoneColor;
  }
}
function compareZoneThenStable(a, b) {
  if (a.zoneRank !== b.zoneRank) return a.zoneRank - b.zoneRank;
  return compareStable(a, b);
}
function buildAutoEventWindowRangeMap(eventToRunners, windowCapacity) {
  const safeWindowCapacity = Math.max(1, Math.floor(windowCapacity));
  let cumulativeEnd = 0;
  const rangeMap = {};
  for (const [eventKey, runners] of eventToRunners.entries()) {
    const start = cumulativeEnd === 0 ? 1 : calculateNextStartNumber(cumulativeEnd);
    const recommendedWindowCount = Math.max(1, Math.ceil(runners.length / safeWindowCapacity));
    const end = start + recommendedWindowCount - 1;
    rangeMap[eventKey] = { start, end };
    cumulativeEnd = end;
  }
  return rangeMap;
}
function resolveEventWindowRange(config, eventKey, mode, autoRangeMap) {
  const autoFallback = autoRangeMap?.[eventKey];
  const fallback = autoFallback || defaultEventWindowRange(mode === "bag" ? config.bagWindowCount : config.expoWindowCount);
  const rangeMap = mode === "bag" ? config.eventBagWindowRangeMap : config.eventExpoWindowRangeMap;
  return sanitizeEventWindowRange(rangeMap?.[eventKey], fallback);
}
function runBibNumbering(records, config) {
  const skipped = [];
  const participants = [];
  const zoneNameSet = /* @__PURE__ */ new Set();
  const colorMap = config.zoneColorMap || {};
  records.forEach((record, index) => {
    const lotteryStatus = String(record.lotteryStatus || "").trim();
    if (!isBibEligibleStatus(lotteryStatus)) {
      skipped.push({ ...record, numberingStatus: "skipped" });
      return;
    }
    if (String(record.lotteryZone || "").trim().toUpperCase() === "S") {
      skipped.push({ ...record, numberingStatus: "skipped" });
      return;
    }
    const normalizedGender = normalizeGender(record.gender);
    if (!normalizedGender) {
      const runnerName = String(record.name || "");
      const genderValue = String(record.gender || "");
      throw new Error(`[Bib numbering failed] gender must be male/female: id=${record.id ?? "N/A"}, name=${runnerName}, gender=${genderValue}`);
    }
    const zone = normalizeZone(record.lotteryZone);
    zoneNameSet.add(zone);
    const importedAt = Date.parse(String(record._importedAt || ""));
    participants.push({
      record,
      originalIndex: index,
      eventKey: eventWindowMapKey(record.event),
      eventLabel: resolveEventLabel(record.event),
      zone,
      zoneRank: Number.MAX_SAFE_INTEGER,
      zonePrefix: resolveZonePrefix(zone, config.zonePrefixMap),
      zoneColor: String(colorMap[zone] || ""),
      scoreSec: scoreSeconds(record),
      normalizedGender,
      stableId: typeof record.id === "number" ? record.id : Number.MAX_SAFE_INTEGER,
      stableImportedAt: Number.isFinite(importedAt) ? importedAt : Number.MAX_SAFE_INTEGER,
      stableIdNumber: String(record.idNumber || ""),
      stableName: String(record.name || "")
    });
  });
  const configuredOrder = Array.from(new Set((config.zoneOrder || []).map((z) => normalizeZone(z))));
  const remainingZones = Array.from(zoneNameSet).filter((z) => !configuredOrder.includes(z)).sort((a, b) => a.localeCompare(b, "zh-CN"));
  const finalZoneOrder = [...configuredOrder.filter((z) => zoneNameSet.has(z)), ...remainingZones];
  const zoneRank = new Map(finalZoneOrder.map((zone, idx) => [zone, idx]));
  for (const runner of participants) {
    runner.zoneRank = zoneRank.get(runner.zone) ?? Number.MAX_SAFE_INTEGER;
  }
  const eventToRunners = /* @__PURE__ */ new Map();
  for (const runner of participants) {
    const list = eventToRunners.get(runner.eventKey) || [];
    list.push(runner);
    eventToRunners.set(runner.eventKey, list);
  }
  const autoBagRangeMap = buildAutoEventWindowRangeMap(eventToRunners, config.bagWindowCapacity);
  const autoExpoRangeMap = buildAutoEventWindowRangeMap(eventToRunners, config.expoWindowCapacity);
  const zoneToRunners = /* @__PURE__ */ new Map();
  for (const runner of participants) {
    const list = zoneToRunners.get(runner.zone) || [];
    list.push(runner);
    zoneToRunners.set(runner.zone, list);
  }
  for (const [eventKey, eventRunnersRaw] of eventToRunners.entries()) {
    const eventRunners = [...eventRunnersRaw].sort(compareZoneThenStable);
    const eventLabel = eventRunners[0]?.eventLabel || DEFAULT_EVENT;
    const scopeLabel = `\u9879\u76EE=${eventLabel}`;
    const bagRange = resolveEventWindowRange(config, eventKey, "bag", autoBagRangeMap);
    const bagWindowNos = assignRoundRobinWindow(
      scopeLabel,
      "bagWindowNo",
      eventRunners.length,
      bagRange.start,
      windowCountFromRange(bagRange),
      config.bagWindowCapacity
    );
    const bagNos = buildBagNos(bagWindowNos);
    for (let i = 0; i < eventRunners.length; i++) {
      eventRunners[i].bagWindowNo = bagWindowNos[i];
      eventRunners[i].bagNo = bagNos[i];
    }
    const expoRange = resolveEventWindowRange(config, eventKey, "expo", autoExpoRangeMap);
    const shuffled = shuffleWithRandom(
      eventRunners.map((runner, idx) => ({ runner, idx })),
      createRandom(config.expoSeed ? `${config.expoSeed}::event::${eventKey || "__empty__"}` : void 0)
    );
    const expoWindowNosOnShuffled = assignRoundRobinWindow(
      scopeLabel,
      "expoWindowNo",
      eventRunners.length,
      expoRange.start,
      windowCountFromRange(expoRange),
      config.expoWindowCapacity
    );
    for (let i = 0; i < shuffled.length; i++) {
      shuffled[i].runner.expoWindowNo = expoWindowNosOnShuffled[i];
    }
  }
  if (config.bibNoMode === "global") {
    assignBibNosGlobal(zoneToRunners, config);
  } else {
    for (const zone of finalZoneOrder) {
      const zoneRunners = zoneToRunners.get(zone) || [];
      assignBibNosPerZone(zone, zoneRunners, config);
    }
  }
  const assigned = participants.slice().sort((a, b) => a.originalIndex - b.originalIndex).map((p) => ({
    ...p.record,
    bagWindowNo: p.bagWindowNo || "",
    bagNo: p.bagNo || "",
    expoWindowNo: p.expoWindowNo || "",
    bibNo: p.bibNo || "",
    bibColor: p.bibColor || "",
    numberingStatus: "participating"
  }));
  return { assigned, skipped };
}
export {
  runBibNumbering
};
