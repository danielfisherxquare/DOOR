import { jsx, jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import bibApi from "../../../../../api/bib";
import { BIB_ELIGIBLE_STATUSES, isBibEligibleStatus } from "./bibEligibility";
import { runBibNumbering } from "./numberingEngine";
import { allocateZonesByEventAndScoreDetailed, scoreSeconds } from "./zoneAllocator";
import {
  calculateNextStartNumber,
  defaultEventWindowRange,
  eventWindowMapKey,
  sanitizeEventWindowRange,
  windowCountFromRange
} from "./eventWindowUtils";
import { resolveEventDisplay } from "./eventUtils";
const PREVIEW_LIMIT = 100;
const UNKNOWN_STATUS_LABEL = "\u7A7A\u72B6\u6001";
const DEFAULT_ZONE_LABEL = "\u672A\u5206\u533A";
const DEFAULT_EVENT_KEY = "__unspecified_event__";
const DEFAULT_EVENT_CN = "\u672A\u6307\u5B9A\u9879\u76EE";
const DEFAULT_EVENT_EN = "Unspecified Event";
const ELIGIBLE_STATUS_HINT = Array.from(BIB_ELIGIBLE_STATUSES).join(" / ");
const GENDER_ALLOWED_HINT = "\u4EC5\u652F\u6301 M / F / MALE / FEMALE / \u7537 / \u5973";
function normalizeText(v) {
  return String(v || "").trim();
}
function formatBagNoDisplay(v) {
  const raw = normalizeText(v);
  if (!raw) return "";
  const match = raw.match(/^(?:\d{1,2}-)?(\d+)$/);
  if (!match) return raw;
  const seq = match[1];
  return seq.length >= 3 ? seq.slice(-3) : seq.padStart(3, "0");
}
function normalizeEventKey(v) {
  return normalizeText(v).toLowerCase();
}
function isSZone(zoneName) {
  return normalizeText(zoneName).toUpperCase() === "S";
}
function compareZoneSort(a, b) {
  const ao = Number.isFinite(a.sortOrder) ? Number(a.sortOrder) : Number.MAX_SAFE_INTEGER;
  const bo = Number.isFinite(b.sortOrder) ? Number(b.sortOrder) : Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  return normalizeText(a.zoneName).localeCompare(normalizeText(b.zoneName), "zh-CN");
}
function sortStartZones(startZones) {
  return [...startZones].filter((z) => normalizeText(z.zoneName) !== "").sort(compareZoneSort);
}
function buildZoneOrder(startZones) {
  return sortStartZones(startZones).map((z) => normalizeText(z.zoneName));
}
function buildZoneColorMap(startZones) {
  const map = {};
  for (const zone of startZones) {
    const zoneName = normalizeText(zone.zoneName);
    if (!zoneName) continue;
    map[zoneName] = normalizeText(zone.color);
  }
  return map;
}
function normalizeGenderValue(v) {
  const raw = normalizeText(v).toUpperCase();
  if (raw === "M" || raw === "MALE" || raw === "\u7537") return "M";
  if (raw === "F" || raw === "FEMALE" || raw === "\u5973") return "F";
  return null;
}
function buildAutoEventWindowRangeMap(entries, windowCapacity) {
  const safeWindowCapacity = Math.max(1, Math.floor(Number(windowCapacity) || 1));
  const rangeMap = {};
  let cumulativeEnd = 0;
  for (const entry of entries) {
    const start = cumulativeEnd === 0 ? 1 : calculateNextStartNumber(cumulativeEnd);
    const recommendedWindowCount = Math.max(1, Math.ceil(entry.count / safeWindowCapacity));
    const end = start + recommendedWindowCount - 1;
    rangeMap[entry.eventKey] = { start, end };
    cumulativeEnd = end;
  }
  return rangeMap;
}
function collectEventCounts(records) {
  const eventMap = /* @__PURE__ */ new Map();
  for (const record of records) {
    const eventKey = eventWindowMapKey(String(record.event || ""));
    const eventLabel = normalizeText(record.event) || DEFAULT_EVENT_CN;
    const current = eventMap.get(eventKey);
    if (current) {
      current.count += 1;
      continue;
    }
    eventMap.set(eventKey, { eventLabel, count: 1 });
  }
  return Array.from(eventMap.entries()).map(([eventKey, value]) => ({
    eventKey,
    eventLabel: value.eventLabel,
    count: value.count
  }));
}
function resolveConfiguredEventWindowRange(config, eventKey, mode, autoRangeMap) {
  const fallback = autoRangeMap[eventKey] || defaultEventWindowRange(mode === "bag" ? config.bagWindowCount : config.expoWindowCount);
  const customRangeMap = mode === "bag" ? config.eventBagWindowRangeMap : config.eventExpoWindowRangeMap;
  return sanitizeEventWindowRange(customRangeMap?.[eventKey], fallback);
}
function buildIssuesFromError(error, fallbackTitle) {
  const summary = error instanceof Error ? error.message : fallbackTitle;
  if (summary.includes("gender must be male/female")) {
    return [{
      key: "runtime-invalid-gender",
      level: "error",
      title: "\u6027\u522B\u5B57\u6BB5\u4E0D\u5408\u6CD5",
      summary: "\u5B58\u5728\u65E0\u6CD5\u8BC6\u522B\u7684\u6027\u522B\u503C\uFF0C\u7F16\u53F7\u5F15\u64CE\u5DF2\u4E2D\u6B62\u3002",
      details: [summary, GENDER_ALLOWED_HINT]
    }];
  }
  if (summary.includes("capacity insufficient")) {
    return [{
      key: "runtime-window-capacity",
      level: "error",
      title: "\u7A97\u53E3\u5BB9\u91CF\u4E0D\u8DB3",
      summary: "\u5F53\u524D\u5B58\u8863\u7A97\u53E3\u6216\u535A\u89C8\u4F1A\u7A97\u53E3\u5BB9\u91CF\u4E0D\u8DB3\uFF0C\u65E0\u6CD5\u5B8C\u6210\u6392\u53F7\u3002",
      details: [summary]
    }];
  }
  if (summary.includes("\u5206\u533A\u5206\u914D\u5931\u8D25")) {
    return [{
      key: "runtime-zone-allocation",
      level: "error",
      title: "\u5206\u533A\u5206\u914D\u5931\u8D25",
      summary: "\u8D77\u8DD1\u5206\u533A\u914D\u7F6E\u672A\u901A\u8FC7\u6392\u53F7\u6821\u9A8C\u3002",
      details: [summary]
    }];
  }
  if (summary.includes("\u5FEB\u7167")) {
    return [{
      key: "runtime-snapshot",
      level: "error",
      title: "\u6392\u53F7\u5FEB\u7167\u5931\u8D25",
      summary
    }];
  }
  return [{
    key: `runtime-${fallbackTitle}`,
    level: "error",
    title: fallbackTitle,
    summary
  }];
}
function buildExecutionDiagnostics(records, config, startZones) {
  if (records.length === 0) {
    return [{
      key: "no-eligible-records",
      level: "info",
      title: "\u6682\u65E0\u53EF\u6392\u53F7\u9009\u624B",
      summary: `\u5F53\u524D\u6267\u884C\u6570\u636E\u96C6\u4E3A\u7A7A\uFF0C\u4EC5 ${ELIGIBLE_STATUS_HINT} \u4E14\u975E S \u533A\u9009\u624B\u4F1A\u8FDB\u5165\u6392\u53F7\u3002`
    }];
  }
  let allocatedRecords = records;
  try {
    const allocation = allocateZonesByEventAndScoreDetailed(records, startZones);
    allocatedRecords = allocation.records;
  } catch (error) {
    const summary = error instanceof Error ? error.message : "\u5206\u533A\u5206\u914D\u5931\u8D25";
    return [{
      key: "zone-allocation-failed",
      level: "error",
      title: "\u5206\u533A\u5206\u914D\u5931\u8D25",
      summary: "\u5F53\u524D\u8D77\u8DD1\u5206\u533A\u914D\u7F6E\u65E0\u6CD5\u901A\u8FC7\u6392\u53F7\u524D\u7F6E\u6821\u9A8C\u3002",
      details: [summary]
    }];
  }
  const issues = [];
  const participants = allocatedRecords.filter((record) => isBibEligibleStatus(record.lotteryStatus) && !isSZone(record.lotteryZone));
  const invalidGenderDetails = participants.filter((record) => normalizeGenderValue(record.gender) == null).slice(0, 8).map((record) => `ID ${record.id ?? "-"} / ${normalizeText(record.name) || "\u672A\u547D\u540D"} / gender=${normalizeText(record.gender) || "(\u7A7A)"}`);
  const invalidGenderCount = participants.reduce((sum, record) => sum + (normalizeGenderValue(record.gender) == null ? 1 : 0), 0);
  if (invalidGenderCount > 0) {
    issues.push({
      key: "invalid-gender-values",
      level: "error",
      title: "\u6027\u522B\u5B57\u6BB5\u4E0D\u5408\u6CD5",
      summary: `${invalidGenderCount} \u540D\u9009\u624B\u7684 gender \u65E0\u6CD5\u8BC6\u522B\uFF0C\u7F16\u53F7\u5F15\u64CE\u4E0D\u4F1A\u7EE7\u7EED\u6267\u884C\u3002`,
      details: [GENDER_ALLOWED_HINT, ...invalidGenderDetails]
    });
  }
  const eventCounts = collectEventCounts(participants);
  if (eventCounts.length === 0) {
    issues.push({
      key: "no-participants-after-filter",
      level: "info",
      title: "\u6682\u65E0\u53C2\u4E0E\u6392\u53F7\u7684\u9009\u624B",
      summary: `\u5F53\u524D\u6267\u884C\u6570\u636E\u96C6\u6CA1\u6709\u547D\u4E2D ${ELIGIBLE_STATUS_HINT} \u4E14\u975E S \u533A\u7684\u8BB0\u5F55\u3002`
    });
    return issues;
  }
  const bagWindowCapacity = Math.max(1, Math.floor(Number(config.bagWindowCapacity) || 1));
  const expoWindowCapacity = Math.max(1, Math.floor(Number(config.expoWindowCapacity) || 1));
  const autoBagRangeMap = buildAutoEventWindowRangeMap(eventCounts, bagWindowCapacity);
  const autoExpoRangeMap = buildAutoEventWindowRangeMap(eventCounts, expoWindowCapacity);
  for (const entry of eventCounts) {
    const bagRange = resolveConfiguredEventWindowRange(config, entry.eventKey, "bag", autoBagRangeMap);
    const bagWindowCount = windowCountFromRange(bagRange);
    const bagCapacity = bagWindowCount * bagWindowCapacity;
    if (bagCapacity < entry.count) {
      issues.push({
        key: `bag-capacity-${entry.eventKey}`,
        level: "error",
        title: "\u5B58\u8863\u7A97\u53E3\u5BB9\u91CF\u4E0D\u8DB3",
        summary: `\u9879\u76EE ${entry.eventLabel} \u9700\u8981 ${entry.count} \u4EBA\uFF0C\u4F46\u5F53\u524D\u5B58\u8863\u7A97\u53E3\u603B\u5BB9\u91CF\u53EA\u6709 ${bagCapacity} \u4EBA\u3002`,
        details: [
          `\u7A97\u53E3\u8303\u56F4 ${bagRange.start}-${bagRange.end}\uFF0C\u5171 ${bagWindowCount} \u4E2A\u7A97\u53E3\u3002`,
          `\u5355\u7A97\u53E3\u5BB9\u91CF ${bagWindowCapacity} \u4EBA\u3002`
        ]
      });
    }
    const expoRange = resolveConfiguredEventWindowRange(config, entry.eventKey, "expo", autoExpoRangeMap);
    const expoWindowCount = windowCountFromRange(expoRange);
    const expoCapacity = expoWindowCount * expoWindowCapacity;
    if (expoCapacity < entry.count) {
      issues.push({
        key: `expo-capacity-${entry.eventKey}`,
        level: "error",
        title: "\u535A\u89C8\u4F1A\u7A97\u53E3\u5BB9\u91CF\u4E0D\u8DB3",
        summary: `\u9879\u76EE ${entry.eventLabel} \u9700\u8981 ${entry.count} \u4EBA\uFF0C\u4F46\u5F53\u524D\u535A\u89C8\u4F1A\u7A97\u53E3\u603B\u5BB9\u91CF\u53EA\u6709 ${expoCapacity} \u4EBA\u3002`,
        details: [
          `\u7A97\u53E3\u8303\u56F4 ${expoRange.start}-${expoRange.end}\uFF0C\u5171 ${expoWindowCount} \u4E2A\u7A97\u53E3\u3002`,
          `\u5355\u7A97\u53E3\u5BB9\u91CF ${expoWindowCapacity} \u4EBA\u3002`
        ]
      });
    }
  }
  return issues;
}
function formatSecondsToClock(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return "--:--:--";
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor(total % 3600 / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function buildZoneGuide(assignedRecords, startZones) {
  const sortedZones = sortStartZones(startZones);
  const hasSZone = sortedZones.some((zone) => isSZone(zone.zoneName));
  const zoneOrder = [];
  const zoneMetaMap = /* @__PURE__ */ new Map();
  const zoneMetricsMap = /* @__PURE__ */ new Map();
  for (const zone of sortedZones) {
    const zoneName = normalizeText(zone.zoneName);
    if (!zoneName || isSZone(zoneName)) continue;
    if (zoneMetaMap.has(zoneName)) continue;
    zoneMetaMap.set(zoneName, { eventLabel: normalizeText(zone.event) });
    zoneOrder.push(zoneName);
  }
  for (const record of assignedRecords) {
    const zoneName = normalizeText(record.lotteryZone) || DEFAULT_ZONE_LABEL;
    if (isSZone(zoneName)) continue;
    if (!zoneMetaMap.has(zoneName)) {
      zoneMetaMap.set(zoneName, { eventLabel: "" });
      zoneOrder.push(zoneName);
    }
    const metrics = zoneMetricsMap.get(zoneName) || {
      totalCount: 0,
      scoredCount: 0,
      unscoredCount: 0,
      scoredSeconds: [],
      inferredEventLabel: ""
    };
    metrics.totalCount += 1;
    const sec = scoreSeconds(record);
    if (Number.isFinite(sec)) {
      metrics.scoredCount += 1;
      metrics.scoredSeconds.push(sec);
    } else {
      metrics.unscoredCount += 1;
    }
    if (!metrics.inferredEventLabel) {
      metrics.inferredEventLabel = normalizeText(record.event);
    }
    zoneMetricsMap.set(zoneName, metrics);
  }
  const groupDraftMap = /* @__PURE__ */ new Map();
  let groupOrder = 0;
  for (const zoneName of zoneOrder) {
    const meta = zoneMetaMap.get(zoneName);
    if (!meta) continue;
    const metrics = zoneMetricsMap.get(zoneName) || {
      totalCount: 0,
      scoredCount: 0,
      unscoredCount: 0,
      scoredSeconds: [],
      inferredEventLabel: ""
    };
    const eventDisplay = resolveEventDisplay(meta.eventLabel || metrics.inferredEventLabel);
    const minSec = metrics.scoredSeconds.length > 0 ? Math.min(...metrics.scoredSeconds) : null;
    const maxSec = metrics.scoredSeconds.length > 0 ? Math.max(...metrics.scoredSeconds) : null;
    let group = groupDraftMap.get(eventDisplay.eventKey);
    if (!group) {
      group = {
        eventKey: eventDisplay.eventKey,
        titleCn: eventDisplay.titleCn,
        titleEn: eventDisplay.titleEn,
        order: groupOrder++,
        rows: []
      };
      groupDraftMap.set(eventDisplay.eventKey, group);
    }
    group.rows.push({
      zone: zoneName,
      totalCount: metrics.totalCount,
      scoredCount: metrics.scoredCount,
      unscoredCount: metrics.unscoredCount,
      minSec,
      maxSec
    });
  }
  const groups = Array.from(groupDraftMap.values()).sort((a, b) => a.order - b.order).map((group) => {
    let previousThresholdSec = null;
    const rows = group.rows.map((row) => {
      if (row.scoredCount > 0 && row.minSec != null && row.maxSec != null) {
        const minClock = formatSecondsToClock(row.minSec);
        const maxClock = formatSecondsToClock(row.maxSec);
        const thresholdCn = previousThresholdSec == null ? `\u6210\u7EE9 \u2264 ${maxClock}` : `\u6210\u7EE9 > ${formatSecondsToClock(previousThresholdSec)} \u4E14 \u2264 ${maxClock}`;
        const thresholdEn = previousThresholdSec == null ? `Performance \u2264 ${maxClock}` : `Performance > ${formatSecondsToClock(previousThresholdSec)} and \u2264 ${maxClock}`;
        previousThresholdSec = row.maxSec;
        return {
          zone: row.zone,
          thresholdCn,
          thresholdEn,
          actualCn: row.minSec === row.maxSec ? `\u5B9E\u9645\u8303\u56F4\uFF1A${minClock}` : `\u5B9E\u9645\u8303\u56F4\uFF1A${minClock} - ${maxClock}`,
          actualEn: row.minSec === row.maxSec ? `Actual range: ${minClock}` : `Actual range: ${minClock} - ${maxClock}`,
          totalCount: row.totalCount,
          scoredCount: row.scoredCount,
          unscoredCount: row.unscoredCount,
          isEmpty: false
        };
      }
      if (row.totalCount === 0) {
        return {
          zone: row.zone,
          thresholdCn: "\u5F53\u524D\u65E0\u5206\u914D\uFF0C\u9608\u503C\u5F85\u5F62\u6210",
          thresholdEn: "No assigned runners; threshold unavailable",
          actualCn: "\u5B9E\u9645\u8303\u56F4\uFF1A\u6682\u65E0\u5206\u914D\u9009\u624B",
          actualEn: "Actual range: No assigned runners",
          totalCount: 0,
          scoredCount: 0,
          unscoredCount: 0,
          isEmpty: true
        };
      }
      if (previousThresholdSec != null) {
        return {
          zone: row.zone,
          thresholdCn: `\u6210\u7EE9 > ${formatSecondsToClock(previousThresholdSec)} \u6216\u65E0\u6210\u7EE9`,
          thresholdEn: `Performance > ${formatSecondsToClock(previousThresholdSec)} or without verified time`,
          actualCn: "\u5B9E\u9645\u8303\u56F4\uFF1A\u65E0\u6709\u6548\u6210\u7EE9\uFF08\u542B\u65E0\u6210\u7EE9\u9009\u624B\uFF09",
          actualEn: "Actual range: No verified performance (includes runners without time)",
          totalCount: row.totalCount,
          scoredCount: row.scoredCount,
          unscoredCount: row.unscoredCount,
          isEmpty: false
        };
      }
      return {
        zone: row.zone,
        thresholdCn: "\u4EC5\u65E0\u6210\u7EE9/\u65E0\u6709\u6548\u6210\u7EE9\u9009\u624B",
        thresholdEn: "Only runners without verified time",
        actualCn: "\u5B9E\u9645\u8303\u56F4\uFF1A\u65E0\u6709\u6548\u6210\u7EE9\uFF08\u542B\u65E0\u6210\u7EE9\u9009\u624B\uFF09",
        actualEn: "Actual range: No verified performance (includes runners without time)",
        totalCount: row.totalCount,
        scoredCount: row.scoredCount,
        unscoredCount: row.unscoredCount,
        isEmpty: false
      };
    });
    return { eventKey: group.eventKey, titleCn: group.titleCn, titleEn: group.titleEn, rows };
  });
  return {
    groups,
    hasSZone,
    sZoneNoteCn: "S\u533A\u4E3A\u7279\u9080\u533A\uFF0C\u4E0D\u53C2\u4E0E\u81EA\u52A8\u6210\u7EE9\u5206\u5C42\u3002",
    sZoneNoteEn: "S zone is reserved for invited runners and excluded from automatic performance zoning."
  };
}
function shuffleRows(rows) {
  const next = [...rows];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}
function samplePreviewRowsByZoneRatio(rows, limit) {
  if (rows.length <= 1) return rows;
  const sampleSize = Math.min(Math.max(0, limit), rows.length);
  if (sampleSize === rows.length) return shuffleRows(rows);
  const zoneMap = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const zone = normalizeText(row.zone) || DEFAULT_ZONE_LABEL;
    const list = zoneMap.get(zone) || [];
    list.push(row);
    zoneMap.set(zone, list);
  }
  const total = rows.length;
  const zones = Array.from(zoneMap.entries()).map(([zone, zoneRows]) => {
    const rawQuota = sampleSize * zoneRows.length / total;
    const base = Math.min(zoneRows.length, Math.floor(rawQuota));
    return {
      zone,
      rows: zoneRows,
      quota: base,
      fraction: rawQuota - Math.floor(rawQuota)
    };
  });
  let assigned = zones.reduce((s, z) => s + z.quota, 0);
  let remaining = sampleSize - assigned;
  while (remaining > 0) {
    const candidates = zones.filter((z) => z.quota < z.rows.length).sort((a, b) => {
      if (b.fraction !== a.fraction) return b.fraction - a.fraction;
      return a.zone.localeCompare(b.zone, "zh-CN");
    });
    if (candidates.length === 0) break;
    let progressed = false;
    for (const zone of candidates) {
      if (remaining <= 0) break;
      if (zone.quota >= zone.rows.length) continue;
      zone.quota += 1;
      remaining -= 1;
      progressed = true;
    }
    if (!progressed) break;
    assigned = zones.reduce((s, z) => s + z.quota, 0);
    remaining = sampleSize - assigned;
  }
  const sampled = [];
  for (const zone of zones) {
    sampled.push(...shuffleRows(zone.rows).slice(0, zone.quota));
  }
  return shuffleRows(sampled).slice(0, sampleSize);
}
function pickLegacyField(row, ...keys) {
  for (const key of keys) {
    const value = row[key];
    if (value !== void 0 && value !== null) {
      return value;
    }
  }
  return void 0;
}
function normalizeExecutionDataset(rawDataset) {
  const dataset = Array.isArray(rawDataset) ? { eligibleRecords: rawDataset } : rawDataset || {};
  const eligibleRecords = Array.isArray(dataset.eligibleRecords) ? dataset.eligibleRecords.filter((item) => !!item && typeof item === "object") : [];
  const skippedIds = Array.isArray(dataset.skippedIds) ? dataset.skippedIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0) : [];
  const statusSummary = Array.isArray(dataset.statusSummary) ? dataset.statusSummary.map((item) => {
    const row = item || {};
    return {
      status: normalizeText(row.status),
      count: Math.max(0, Number(row.count || 0))
    };
  }) : [];
  const eligibleCountValue = Number(dataset.eligibleCount);
  const eligibleCount = Number.isFinite(eligibleCountValue) ? Math.max(0, Math.floor(eligibleCountValue)) : void 0;
  return {
    eligibleRecords,
    skippedIds,
    statusSummary,
    eligibleCount
  };
}
function toDbRecordForBib(row) {
  const raw = row;
  return {
    id: Number.isFinite(Number(raw.id)) ? Number(raw.id) : void 0,
    raceId: void 0,
    name: normalizeText(raw.name),
    namePinyin: "",
    phone: "",
    country: "",
    idType: "",
    idNumber: normalizeText(pickLegacyField(raw, "idNumber", "id_number")),
    gender: normalizeText(raw.gender),
    age: "",
    birthday: "",
    event: normalizeText(raw.event),
    source: "",
    clothingSize: "",
    province: "",
    city: "",
    district: "",
    address: "",
    email: "",
    emergencyName: "",
    emergencyPhone: "",
    bloodType: "",
    orderGroupId: "",
    paymentStatus: "",
    mark: "",
    lotteryStatus: normalizeText(pickLegacyField(raw, "lotteryStatus", "lottery_status")),
    personalBestFull: pickLegacyField(raw, "personalBestFull", "personal_best_full"),
    personalBestHalf: pickLegacyField(raw, "personalBestHalf", "personal_best_half"),
    lotteryZone: normalizeText(pickLegacyField(raw, "lotteryZone", "lottery_zone")),
    _source: "",
    _importedAt: normalizeText(pickLegacyField(raw, "_importedAt", "_imported_at"))
  };
}
function buildExecutionPlan(records, config, startZones, options) {
  const allocation = allocateZonesByEventAndScoreDetailed(records, startZones);
  const allocatedRecords = allocation.records;
  const statusSummary = Array.isArray(options?.statusSummary) ? [...options.statusSummary].map((item) => ({
    status: normalizeText(item.status) || UNKNOWN_STATUS_LABEL,
    count: Math.max(0, Number(item.count || 0))
  })).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.status.localeCompare(b.status, "zh-CN");
  }) : (() => {
    const statusCounter = /* @__PURE__ */ new Map();
    for (const record of allocatedRecords) {
      const status = normalizeText(record.lotteryStatus) || UNKNOWN_STATUS_LABEL;
      statusCounter.set(status, (statusCounter.get(status) || 0) + 1);
    }
    return Array.from(statusCounter.entries()).map(([status, count]) => ({ status, count })).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.status.localeCompare(b.status, "zh-CN");
    });
  })();
  const eligibleCount = typeof options?.eligibleCount === "number" ? Math.max(0, Math.floor(options.eligibleCount)) : allocatedRecords.reduce((sum, record) => {
    return sum + (isBibEligibleStatus(record.lotteryStatus) && !isSZone(record.lotteryZone) ? 1 : 0);
  }, 0);
  const numberingResult = runBibNumbering(allocatedRecords, {
    ...config,
    zoneOrder: buildZoneOrder(startZones),
    zoneColorMap: buildZoneColorMap(startZones)
  });
  const assignedRows = numberingResult.assigned.filter((r) => typeof r.id === "number").map((r) => ({
    id: r.id,
    name: normalizeText(r.name),
    zone: normalizeText(r.lotteryZone) || DEFAULT_ZONE_LABEL,
    bagWindowNo: r.bagWindowNo,
    bagNo: formatBagNoDisplay(r.bagNo),
    expoWindowNo: r.expoWindowNo,
    bibNo: r.bibNo,
    bibColor: normalizeText(r.bibColor)
  }));
  const updates = assignedRows.map((r) => ({
    id: r.id,
    lotteryZone: r.zone,
    bagWindowNo: r.bagWindowNo,
    bagNo: r.bagNo,
    expoWindowNo: r.expoWindowNo,
    bibNumber: r.bibNo,
    bibColor: r.bibColor
  }));
  const skippedUpdates = Array.isArray(options?.skippedIds) ? options.skippedIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0).map((id) => ({
    id,
    bagWindowNo: "",
    bagNo: "",
    expoWindowNo: "",
    bibNumber: "",
    bibColor: ""
  })) : numberingResult.skipped.filter((r) => typeof r.id === "number").map((r) => ({
    id: r.id,
    bagWindowNo: "",
    bagNo: "",
    expoWindowNo: "",
    bibNumber: "",
    bibColor: ""
  }));
  const zoneCounter = /* @__PURE__ */ new Map();
  for (const row of assignedRows) {
    zoneCounter.set(row.zone, (zoneCounter.get(row.zone) || 0) + 1);
  }
  const zoneSummary = Array.from(zoneCounter.entries()).map(([zone, count]) => ({ zone, count })).sort((a, b) => b.count - a.count);
  const sampledRows = samplePreviewRowsByZoneRatio(assignedRows, PREVIEW_LIMIT);
  const zoneGuide = allocation.zoneGuide.groups.length > 0 ? allocation.zoneGuide : buildZoneGuide(numberingResult.assigned, startZones);
  return {
    updates,
    skippedUpdates,
    preview: {
      assignedCount: updates.length,
      skippedCount: skippedUpdates.length,
      eligibleCount,
      eligibleStatusHint: ELIGIBLE_STATUS_HINT,
      statusSummary,
      zoneSummary,
      zoneGuide,
      rows: sampledRows
    }
  };
}
function StatItem({ label, value }) {
  return /* @__PURE__ */ jsxs(
    "div",
    {
      style: {
        border: "1px solid var(--border)",
        borderRadius: 0,
        padding: "0.625rem 0.75rem",
        background: "var(--bg-secondary)"
      },
      children: [
        /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }, children: label }),
        /* @__PURE__ */ jsx("div", { style: { fontSize: 15, fontWeight: 700 }, children: value })
      ]
    }
  );
}
function BibExecution({ raceId, config, startZones, onReload, showMessage }) {
  const [running, setRunning] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [preview, setPreview] = useState(null);
  const [issues, setIssues] = useState([]);
  const [hasSnapshot, setHasSnapshot] = useState(false);
  const [showSZoneGuide, setShowSZoneGuide] = useState(false);
  const planCacheRef = useRef(null);
  const zoneCount = useMemo(() => {
    return new Set(startZones.map((s) => normalizeText(s.zoneName)).filter(Boolean)).size;
  }, [startZones]);
  const planSignature = useMemo(() => JSON.stringify({
    raceId,
    config,
    startZones: startZones.map((zone) => ({
      zoneName: normalizeText(zone.zoneName),
      sortOrder: Number.isFinite(zone.sortOrder) ? Number(zone.sortOrder) : null,
      color: normalizeText(zone.color),
      event: normalizeText(zone.event),
      capacityRatio: typeof zone.capacityRatio === "number" ? zone.capacityRatio : null,
      scoreUpperSeconds: typeof zone.scoreUpperSeconds === "number" ? zone.scoreUpperSeconds : null
    }))
  }), [config, raceId, startZones]);
  const eligibleStatuses = useMemo(() => Array.from(BIB_ELIGIBLE_STATUSES), []);
  const refreshSnapshotState = useCallback(async () => {
    try {
      const response = await bibApi.hasBibSnapshot(raceId);
      setHasSnapshot(Boolean(response.data?.hasSnapshot));
    } catch (error) {
      console.error("\u67E5\u8BE2\u6392\u53F7\u5FEB\u7167\u5931\u8D25", error);
      setHasSnapshot(false);
    }
  }, [raceId]);
  useEffect(() => {
    void refreshSnapshotState();
  }, [refreshSnapshotState, raceId]);
  useEffect(() => {
    planCacheRef.current = null;
    setIssues([]);
  }, [planSignature]);
  useEffect(() => {
    if (!startZones.some((zone) => isSZone(zone.zoneName))) {
      setShowSZoneGuide(false);
    }
  }, [startZones]);
  const fetchAndBuildPlan = useCallback(async () => {
    const response = await bibApi.getBibExecutionDataset(raceId);
    const dataset = normalizeExecutionDataset(response.data);
    const records = dataset.eligibleRecords.map(toDbRecordForBib);
    const nextIssues = buildExecutionDiagnostics(records, config, startZones);
    setIssues(nextIssues);
    if (nextIssues.some((issue) => issue.level === "error")) {
      throw new Error(nextIssues.find((issue) => issue.level === "error")?.summary || "\u6392\u53F7\u524D\u7F6E\u6821\u9A8C\u672A\u901A\u8FC7");
    }
    const plan = buildExecutionPlan(records, config, startZones, {
      skippedIds: dataset.skippedIds,
      statusSummary: dataset.statusSummary,
      eligibleCount: dataset.eligibleCount
    });
    planCacheRef.current = {
      signature: planSignature,
      plan
    };
    return plan;
  }, [config, eligibleStatuses, planSignature, raceId, startZones]);
  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const plan = await fetchAndBuildPlan();
      setPreview(plan.preview);
      showMessage(`\u9884\u89C8\u5B8C\u6210\uFF1A\u968F\u673A\u62BD\u6837 ${plan.preview.rows.length} \u4EBA`, "info");
    } catch (e) {
      setPreview(null);
      setIssues((prev) => prev.length > 0 ? prev : buildIssuesFromError(e, "\u9884\u89C8\u5931\u8D25"));
      const msg = e instanceof Error ? e.message : "\u751F\u6210\u9884\u89C8\u5931\u8D25";
      showMessage(msg, "error");
    } finally {
      setPreviewing(false);
    }
  };
  const handleExecute = async () => {
    if (!confirm("开始执行排号？\n\n⚠️ 将自动创建当前赛事排号字段快照，可回滚到执行前状态。\n快照仅覆盖当前赛事的号码布、存衣窗口、存衣号、博览会窗口和号码布颜色。")) return;
    setRunning(true);
    try {
      const cached = planCacheRef.current;
      const plan = cached && cached.signature === planSignature ? cached.plan : await fetchAndBuildPlan();
      if (plan.updates.length === 0) {
        setPreview(plan.preview);
        showMessage(`\u5F53\u524D\u65E0\u53EF\u6392\u53F7\u9009\u624B\uFF08\u4EC5 ${plan.preview.eligibleStatusHint} \u53C2\u4E0E\uFF09`, "info");
        return;
      }
      await bibApi.createBibSnapshot(raceId);
      const snapshotResponse = await bibApi.hasBibSnapshot(raceId);
      if (!snapshotResponse.data?.hasSnapshot) {
        throw new Error("\u521B\u5EFA\u6392\u53F7\u5FEB\u7167\u5931\u8D25\uFF0C\u5DF2\u4E2D\u6B62\u6267\u884C");
      }
      if (plan.updates.length + plan.skippedUpdates.length > 0) {
        const assignments = [...plan.updates, ...plan.skippedUpdates].map((r) => ({
          recordId: r.id,
          bibNumber: r.bibNumber || "",
          bagWindowNo: r.bagWindowNo || "",
          bagNo: r.bagNo || "",
          expoWindowNo: r.expoWindowNo || "",
          bibColor: r.bibColor || ""
        }));
        await bibApi.bulkAssignBib(raceId, assignments);
        const localUpdates = assignments.map((a) => ({
          id: a.recordId,
          data: {
            bibNumber: a.bibNumber,
            bagWindowNo: a.bagWindowNo,
            bagNo: a.bagNo,
            expoWindowNo: a.expoWindowNo,
            bibColor: a.bibColor
          }
        }));
      }
      setPreview(plan.preview);
      await refreshSnapshotState();
      showMessage(`\u6392\u53F7\u5B8C\u6210\uFF1A\u53C2\u4E0E ${plan.updates.length} \u4EBA\uFF0C\u4E0D\u53C2\u4E0E ${plan.skippedUpdates.length} \u4EBA`, "success");
      onReload();
    } catch (e) {
      setIssues((prev) => prev.length > 0 ? prev : buildIssuesFromError(e, "\u6267\u884C\u5931\u8D25"));
      const msg = e instanceof Error ? e.message : "\u6392\u53F7\u8FC7\u7A0B\u51FA\u9519";
      showMessage(msg, "error");
    } finally {
      setRunning(false);
    }
  };
  const handleRollback = async () => {
    if (!hasSnapshot) {
      showMessage("\u6682\u65E0\u53EF\u56DE\u6EDA\u7684\u6392\u53F7\u5FEB\u7167", "info");
      return;
    }
    if (!confirm("\u56DE\u6EDA\u5230\u4E0A\u6B21\u6267\u884C\u6392\u53F7\u524D\uFF1F\u5F53\u524D\u6392\u53F7\u7ED3\u679C\u4F1A\u88AB\u64A4\u9500\u3002")) return;
    setRollingBack(true);
    try {
      const result = await bibApi.rollbackBib(raceId);
      if (!result?.success) {
        throw new Error("\u6392\u53F7\u56DE\u6EDA\u5931\u8D25");
      }
      planCacheRef.current = null;
      setPreview(null);
      setIssues([]);
      await refreshSnapshotState();
      onReload();
      showMessage("\u6392\u53F7\u5DF2\u56DE\u6EDA\u5230\u4E0A\u6B21\u6267\u884C\u524D\u72B6\u6001", "success");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "\u6392\u53F7\u56DE\u6EDA\u5931\u8D25";
      showMessage(msg, "error");
    } finally {
      setRollingBack(false);
    }
  };
  const handleClear = async () => {
    if (!confirm("\u6E05\u9664\u6240\u6709\u6392\u53F7\u7ED3\u679C\uFF1F")) return;
    planCacheRef.current = null;
    setIssues([]);
    setPreview(null);
    await bibApi.clearBib(raceId);
    onReload();
    showMessage("\u5DF2\u6E05\u9664\u5168\u90E8\u6392\u53F7\u5B57\u6BB5", "info");
  };
  return /* @__PURE__ */ jsxs("div", { className: "card bib-panel bib-execution-panel", style: { border: "1px solid var(--border)", gap: 14 }, children: [
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("h4", { style: { marginBottom: 6 }, children: "\u6267\u884C\u6392\u53F7" }),
      /* @__PURE__ */ jsx("div", { style: { fontSize: 12, color: "var(--text-secondary)" }, children: "\u9884\u89C8\u4F1A\u4ECE\u53C2\u4E0E\u6392\u53F7\u9009\u624B\u4E2D\u968F\u673A\u62BD\u6837\u6700\u591A 100 \u4EBA\uFF0C\u6309\u5206\u533A\u4EBA\u6570\u6BD4\u4F8B\u5206\u914D\u6837\u672C\u3002" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "bib-execution-stats", children: [
      /* @__PURE__ */ jsx(StatItem, { label: "\u5206\u533A\u6570\u91CF", value: `${zoneCount}` }),
      /* @__PURE__ */ jsx(StatItem, { label: "\u53F7\u7801\u5E03\u6A21\u5F0F", value: config.bibNoMode === "global" ? "\u5168\u8D5B\u8FDE\u7EED" : "\u5206\u533A\u91CD\u7F6E" }),
      /* @__PURE__ */ jsx(StatItem, { label: "\u53F7\u7801\u4F4D\u6570", value: `${config.bibDigits}` }),
      /* @__PURE__ */ jsx(StatItem, { label: "\u56DE\u6EDA\u72B6\u6001", value: hasSnapshot ? "\u53EF\u56DE\u6EDA" : "\u65E0\u5FEB\u7167" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "bib-execution-actions", children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          className: "btn btn--secondary",
          onClick: handlePreview,
          disabled: previewing || running || rollingBack,
          style: { width: "100%", justifyContent: "center", fontWeight: 700 },
          children: previewing ? "\u751F\u6210\u9884\u89C8\u4E2D..." : "\u9884\u89C8\u6392\u53F7\u7ED3\u679C\uFF08100\u4EBA\uFF09"
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          className: "btn btn--primary",
          onClick: handleExecute,
          disabled: running || rollingBack,
          style: { width: "100%", justifyContent: "center", fontWeight: 700 },
          children: running ? "\u6267\u884C\u4E2D..." : "\u6267\u884C\u6392\u53F7\uFF08\u81EA\u52A8\u521B\u5EFA\u5FEB\u7167\uFF09"
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          className: "btn btn-ghost",
          onClick: handleRollback,
          disabled: rollingBack || running || !hasSnapshot,
          style: {
            width: "100%",
            justifyContent: "center",
            border: "1px solid var(--border)",
            background: hasSnapshot ? "var(--surface)" : "var(--bg-secondary)",
            color: hasSnapshot ? "var(--text-primary)" : "var(--text-muted)"
          },
          children: rollingBack ? "\u56DE\u6EDA\u4E2D..." : "\u56DE\u6EDA\u5230\u4E0A\u6B21\u6267\u884C\u524D"
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          className: "btn btn-ghost",
          onClick: handleClear,
          style: {
            width: "100%",
            justifyContent: "center",
            border: "1px solid var(--border)",
            background: "var(--surface)"
          },
          children: "\u6E05\u9664\u6240\u6709\u5206\u914D"
        }
      )
    ] }),
    issues.length > 0 && /* @__PURE__ */ jsxs(
      "div",
      {
        style: {
          border: "1px solid var(--border)",
          borderRadius: 0,
          padding: "0.875rem 1rem",
          background: "var(--bg-secondary)",
          display: "grid",
          gap: 10
        },
        children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("div", { style: { fontSize: 13, fontWeight: 700 }, children: "\u6267\u884C\u8BCA\u65AD" }),
            /* @__PURE__ */ jsx("div", { style: { fontSize: 12, color: "var(--text-secondary)" }, children: "\u5DF2\u5217\u51FA\u5F53\u524D\u4F1A\u963B\u585E\u6216\u5F71\u54CD\u6392\u53F7\u9884\u89C8/\u6267\u884C\u7684\u539F\u56E0\u3002" })
          ] }),
          /* @__PURE__ */ jsx("div", { style: { display: "grid", gap: 8 }, children: issues.map((issue) => /* @__PURE__ */ jsxs(
            "div",
            {
              style: {
                border: `1px solid ${issue.level === "error" ? "rgba(220,38,38,0.25)" : "rgba(59,130,246,0.25)"}`,
                borderRadius: 10,
                padding: "0.75rem 0.875rem",
                background: issue.level === "error" ? "rgba(254,242,242,0.9)" : "rgba(239,246,255,0.9)",
                display: "grid",
                gap: 6
              },
              children: [
                /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }, children: [
                  /* @__PURE__ */ jsx("strong", { style: { fontSize: 13, color: issue.level === "error" ? "#991B1B" : "#1D4ED8" }, children: issue.title }),
                  /* @__PURE__ */ jsx(
                    "span",
                    {
                      className: "pill",
                      style: {
                        border: "none",
                        background: issue.level === "error" ? "rgba(220,38,38,0.12)" : "rgba(59,130,246,0.12)",
                        color: issue.level === "error" ? "#991B1B" : "#1D4ED8"
                      },
                      children: issue.level === "error" ? "\u963B\u585E" : "\u63D0\u793A"
                    }
                  )
                ] }),
                /* @__PURE__ */ jsx("div", { style: { fontSize: 12, color: "var(--text-primary)" }, children: issue.summary }),
                issue.details && issue.details.length > 0 && /* @__PURE__ */ jsx("ul", { style: { margin: 0, paddingLeft: 18, display: "grid", gap: 4, fontSize: 12, color: "var(--text-secondary)" }, children: issue.details.map((detail, index) => /* @__PURE__ */ jsx("li", { children: detail }, `${issue.key}-${index}`)) })
              ]
            },
            issue.key
          )) })
        ]
      }
    ),
    preview && /* @__PURE__ */ jsxs("div", { className: "bib-execution-preview", children: [
      /* @__PURE__ */ jsxs("div", { className: "bib-execution-preview-head", children: [
        /* @__PURE__ */ jsx("strong", { style: { fontSize: 13 }, children: "\u6267\u884C\u9884\u89C8" }),
        /* @__PURE__ */ jsxs("span", { style: { fontSize: 12, color: "var(--text-secondary)" }, children: [
          "\u9884\u8BA1\u5206\u914D ",
          preview.assignedCount,
          " \u4EBA\uFF0C\u4E0D\u53C2\u4E0E ",
          preview.skippedCount,
          " \u4EBA\uFF0C\u6837\u672C ",
          preview.rows.length,
          " \u4EBA"
        ] })
      ] }),
      preview.assignedCount === 0 && /* @__PURE__ */ jsxs(
        "div",
        {
          style: {
            border: "1px dashed var(--border)",
            borderRadius: 0,
            padding: "0.625rem 0.75rem",
            background: "var(--bg-secondary)",
            display: "grid",
            gap: 8
          },
          children: [
            /* @__PURE__ */ jsxs("div", { style: { fontSize: 12, color: "var(--text-secondary)" }, children: [
              "\u5F53\u524D\u53EF\u53C2\u4E0E\u6392\u53F7\u4EBA\u6570\u4E3A 0\u3002\u53C2\u4E0E\u89C4\u5219\uFF1A",
              preview.eligibleStatusHint
            ] }),
            /* @__PURE__ */ jsxs("div", { style: { fontSize: 12, color: "var(--text-secondary)" }, children: [
              "\u5F53\u524D\u8D5B\u4E8B\u8BB0\u5F55\u603B\u6570\uFF1A",
              preview.statusSummary.reduce((sum, item) => sum + item.count, 0),
              "\uFF0C\u53EF\u53C2\u4E0E\u72B6\u6001\u4EBA\u6570\uFF1A",
              preview.eligibleCount
            ] }),
            /* @__PURE__ */ jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 }, children: preview.statusSummary.slice(0, 10).map((item) => /* @__PURE__ */ jsxs("span", { className: "pill", style: { border: "1px solid var(--border)" }, children: [
              item.status,
              ": ",
              item.count
            ] }, item.status)) })
          ]
        }
      ),
      /* @__PURE__ */ jsx("div", { className: "bib-execution-zone-pills", children: preview.zoneSummary.slice(0, 10).map((z) => /* @__PURE__ */ jsxs("span", { className: "pill pill-blue", children: [
        z.zone,
        ": ",
        z.count
      ] }, z.zone)) }),
      /* @__PURE__ */ jsxs("div", { className: "bib-execution-zone-guide", children: [
        /* @__PURE__ */ jsxs("div", { className: "bib-execution-zone-guide-head", children: [
          /* @__PURE__ */ jsxs("div", { className: "bib-execution-zone-guide-title-wrap", children: [
            /* @__PURE__ */ jsx("div", { className: "bib-execution-zone-guide-title", children: "\u5206\u533A\u8BF4\u660E \xB7 Zoning Criteria" }),
            /* @__PURE__ */ jsx("div", { className: "bib-execution-zone-guide-sub", children: "\u5206\u533A\u4F9D\u636E\u4E3A\u672C\u6B21\u6392\u53F7\u6240\u4F7F\u7528\u7684\u5386\u53F2\u6700\u597D\u6210\u7EE9\uFF08\u6309\u9879\u76EE\u5339\u914D\u5168\u9A6C/\u534A\u9A6C\u6210\u7EE9\uFF09\u81EA\u52A8\u8BA1\u7B97\u3002" }),
            /* @__PURE__ */ jsx("div", { className: "bib-execution-zone-guide-sub", children: "Zones are generated from runners' best historical performance used in this numbering run." })
          ] }),
          preview.zoneGuide.hasSZone && /* @__PURE__ */ jsxs("label", { className: "bib-execution-zone-guide-toggle", children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "checkbox",
                checked: showSZoneGuide,
                onChange: (e) => setShowSZoneGuide(e.target.checked)
              }
            ),
            /* @__PURE__ */ jsx("span", { children: "\u663E\u793A S \u533A\u8BF4\u660E / Show S Zone" })
          ] })
        ] }),
        preview.zoneGuide.groups.length === 0 ? /* @__PURE__ */ jsx("div", { className: "bib-execution-zone-guide-empty", children: "\u6682\u65E0\u53EF\u5C55\u793A\u7684\u5206\u533A\u8BF4\u660E" }) : /* @__PURE__ */ jsx("div", { className: "bib-execution-zone-guide-groups", children: preview.zoneGuide.groups.map((group) => /* @__PURE__ */ jsxs("section", { className: "bib-execution-zone-guide-group", children: [
          /* @__PURE__ */ jsxs("div", { className: "bib-execution-zone-guide-group-head", children: [
            /* @__PURE__ */ jsx("span", { children: group.titleCn }),
            /* @__PURE__ */ jsx("span", { children: group.titleEn })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "bib-execution-zone-guide-list", children: group.rows.map((row) => /* @__PURE__ */ jsxs(
            "article",
            {
              className: `bib-execution-zone-guide-row${row.isEmpty ? " is-empty" : ""}`,
              children: [
                /* @__PURE__ */ jsx("div", { className: "bib-execution-zone-guide-zone", children: row.zone }),
                /* @__PURE__ */ jsxs("div", { className: "bib-execution-zone-guide-copy", children: [
                  /* @__PURE__ */ jsx("div", { className: "bib-execution-zone-guide-threshold-cn", children: row.thresholdCn }),
                  /* @__PURE__ */ jsx("div", { className: "bib-execution-zone-guide-threshold-en", children: row.thresholdEn }),
                  /* @__PURE__ */ jsx("div", { className: "bib-execution-zone-guide-actual-cn", children: row.actualCn }),
                  /* @__PURE__ */ jsx("div", { className: "bib-execution-zone-guide-actual-en", children: row.actualEn })
                ] }),
                /* @__PURE__ */ jsxs("div", { className: "bib-execution-zone-guide-stats", children: [
                  /* @__PURE__ */ jsxs("span", { className: "pill", children: [
                    "\u603B ",
                    row.totalCount
                  ] }),
                  /* @__PURE__ */ jsxs("span", { className: "pill", children: [
                    "\u6709\u6210\u7EE9 ",
                    row.scoredCount
                  ] }),
                  /* @__PURE__ */ jsxs("span", { className: "pill", children: [
                    "\u65E0\u6210\u7EE9 ",
                    row.unscoredCount
                  ] })
                ] })
              ]
            },
            `${group.eventKey}-${row.zone}`
          )) })
        ] }, group.eventKey)) }),
        preview.zoneGuide.hasSZone && showSZoneGuide && /* @__PURE__ */ jsxs("div", { className: "bib-execution-zone-guide-s-note", children: [
          /* @__PURE__ */ jsx("div", { children: preview.zoneGuide.sZoneNoteCn }),
          /* @__PURE__ */ jsx("div", { children: preview.zoneGuide.sZoneNoteEn })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "bib-execution-table-wrap", children: /* @__PURE__ */ jsxs("table", { className: "bib-execution-table", children: [
        /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("th", { children: "\u59D3\u540D" }),
          /* @__PURE__ */ jsx("th", { children: "\u5206\u533A" }),
          /* @__PURE__ */ jsx("th", { children: "\u5B58\u8863\u7A97\u53E3\u53F7" }),
          /* @__PURE__ */ jsx("th", { children: "\u5305\u53F7" }),
          /* @__PURE__ */ jsx("th", { children: "\u535A\u89C8\u4F1A\u7A97\u53E3\u53F7" }),
          /* @__PURE__ */ jsx("th", { children: "\u53F7\u7801\u5E03\u53F7" }),
          /* @__PURE__ */ jsx("th", { children: "\u989C\u8272" })
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { children: preview.rows.map((row) => /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("td", { children: row.name }),
          /* @__PURE__ */ jsx("td", { children: row.zone }),
          /* @__PURE__ */ jsx("td", { children: row.bagWindowNo }),
          /* @__PURE__ */ jsx("td", { children: formatBagNoDisplay(row.bagNo) }),
          /* @__PURE__ */ jsx("td", { children: row.expoWindowNo }),
          /* @__PURE__ */ jsx("td", { style: { fontFamily: "monospace", fontWeight: 700 }, children: row.bibNo }),
          /* @__PURE__ */ jsx("td", { children: /* @__PURE__ */ jsx(
            "span",
            {
              style: {
                width: 12,
                height: 12,
                borderRadius: 999,
                background: row.bibColor || "var(--text-muted)",
                display: "inline-block"
              }
            }
          ) })
        ] }, row.id)) })
      ] }) })
    ] })
  ] });
}
export {
  BibExecution as default
};
