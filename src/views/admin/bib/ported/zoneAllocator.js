import { isBibEligibleStatus } from "./bibEligibility";
import { isHalfEvent, resolveEventDisplay as resolveEventDisplayShared } from "./eventUtils";
const DEFAULT_ZONE_LABEL = "\u672A\u5206\u533A";
function normalizeText(v) {
  return String(v || "").trim();
}
function normalizeEventKey(v) {
  return normalizeText(v).toLowerCase();
}
function isSZone(zoneName) {
  return normalizeText(zoneName).toUpperCase() === "S";
}
function normalizeCapacityRatio(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1;
  if (n < 0) return 0;
  if (n > 10) return 10;
  return n;
}
function normalizeScoreUpperSeconds(raw) {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}
function parseClockToSeconds(raw) {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  const parts = t.split(":");
  if (parts.length !== 3) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  const s = Number(parts[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) return null;
  if (h < 0 || m < 0 || m >= 60 || s < 0 || s >= 60) return null;
  const total = h * 3600 + m * 60 + s;
  if (total <= 0) return null;
  return total;
}
function secondsToClock(secRaw) {
  const sec = Number(secRaw);
  if (!Number.isFinite(sec) || sec <= 0) return "--:--:--";
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor(total % 3600 / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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
function scoreSeconds(record) {
  const pb = isHalfEvent(record.event) ? record.personalBestHalf : record.personalBestFull;
  const netTime = readNetTimeField(pb);
  return parseTimeToSeconds(netTime);
}
function compareEligible(a, b) {
  if (a.hasScore !== b.hasScore) return a.hasScore ? -1 : 1;
  if (a.scoreSec !== b.scoreSec) return a.scoreSec - b.scoreSec;
  if (a.stableId !== b.stableId) return a.stableId - b.stableId;
  if (a.stableImportedAt !== b.stableImportedAt) return a.stableImportedAt - b.stableImportedAt;
  const idCmp = a.stableIdNumber.localeCompare(b.stableIdNumber, "zh-CN");
  if (idCmp !== 0) return idCmp;
  const nameCmp = a.stableName.localeCompare(b.stableName, "zh-CN");
  if (nameCmp !== 0) return nameCmp;
  return a.originalIndex - b.originalIndex;
}
function zoneEffectiveCapacity(zone) {
  const width = Number(zone.width || 0);
  const length = Number(zone.length || 0);
  const density = Number(zone.density || 0);
  const ratio = normalizeCapacityRatio(zone.capacityRatio);
  return Math.max(0, Math.floor(width * length * density * ratio));
}
function sortZones(zones) {
  return [...zones].sort((a, b) => {
    const ao = Number.isFinite(a.sortOrder) ? Number(a.sortOrder) : Number.MAX_SAFE_INTEGER;
    const bo = Number.isFinite(b.sortOrder) ? Number(b.sortOrder) : Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return normalizeText(a.zoneName).localeCompare(normalizeText(b.zoneName), "zh-CN");
  });
}
function resolveEventDisplay(eventRaw) {
  const r = resolveEventDisplayShared(eventRaw);
  return { key: r.eventKey, titleCn: r.titleCn, titleEn: r.titleEn };
}
function buildThresholdTextByManualConfig(rowIndex, zoneCount, manualCount, thresholds) {
  const prevManual = manualCount > 0 ? thresholds[manualCount - 1] : null;
  const lastIndex = zoneCount - 1;
  if (rowIndex < manualCount) {
    const curr = thresholds[rowIndex];
    const prev = rowIndex > 0 ? thresholds[rowIndex - 1] : null;
    if (curr == null) {
      return { thresholdCn: "\u672A\u914D\u7F6E\u9608\u503C", thresholdEn: "No configured threshold" };
    }
    if (prev == null) {
      return {
        thresholdCn: `\u6210\u7EE9 <= ${secondsToClock(curr)}`,
        thresholdEn: `Performance <= ${secondsToClock(curr)}`
      };
    }
    return {
      thresholdCn: `\u6210\u7EE9 > ${secondsToClock(prev)} \u4E14 <= ${secondsToClock(curr)}`,
      thresholdEn: `Performance > ${secondsToClock(prev)} and <= ${secondsToClock(curr)}`
    };
  }
  if (rowIndex === lastIndex) {
    if (prevManual != null) {
      return {
        thresholdCn: `\u6210\u7EE9 > ${secondsToClock(prevManual)} \u6216\u65E0\u6210\u7EE9`,
        thresholdEn: `Performance > ${secondsToClock(prevManual)} or without verified time`
      };
    }
    return {
      thresholdCn: "\u65E0\u6210\u7EE9\u9009\u624B",
      thresholdEn: "Runners without verified time"
    };
  }
  if (rowIndex === manualCount && prevManual != null) {
    return {
      thresholdCn: `\u6210\u7EE9 > ${secondsToClock(prevManual)}`,
      thresholdEn: `Performance > ${secondsToClock(prevManual)}`
    };
  }
  return {
    thresholdCn: "\u6309\u5BB9\u91CF\u987A\u5EF6\u5206\u914D",
    thresholdEn: "Capacity carry-over allocation"
  };
}
function buildThresholdTextByAutoRange(row, previousThresholdSec) {
  if (row.scoredCount > 0 && row.scoredMaxSec != null) {
    const maxClock = secondsToClock(row.scoredMaxSec);
    if (previousThresholdSec == null) {
      return {
        thresholdCn: `\u6210\u7EE9 <= ${maxClock}`,
        thresholdEn: `Performance <= ${maxClock}`,
        nextPreviousThresholdSec: row.scoredMaxSec
      };
    }
    return {
      thresholdCn: `\u6210\u7EE9 > ${secondsToClock(previousThresholdSec)} \u4E14 <= ${maxClock}`,
      thresholdEn: `Performance > ${secondsToClock(previousThresholdSec)} and <= ${maxClock}`,
      nextPreviousThresholdSec: row.scoredMaxSec
    };
  }
  if (previousThresholdSec != null) {
    return {
      thresholdCn: `\u6210\u7EE9 > ${secondsToClock(previousThresholdSec)} \u6216\u65E0\u6210\u7EE9`,
      thresholdEn: `Performance > ${secondsToClock(previousThresholdSec)} or without verified time`,
      nextPreviousThresholdSec: previousThresholdSec
    };
  }
  return {
    thresholdCn: "\u4EC5\u65E0\u6210\u7EE9/\u65E0\u6709\u6548\u6210\u7EE9\u9009\u624B",
    thresholdEn: "Only runners without verified time",
    nextPreviousThresholdSec: previousThresholdSec
  };
}
function buildActualRangeText(row) {
  if (row.totalCount === 0) {
    return {
      actualCn: "\u5B9E\u9645\u8303\u56F4\uFF1A\u6682\u65E0\u5206\u914D\u9009\u624B",
      actualEn: "Actual range: No assigned runners",
      isEmpty: true
    };
  }
  if (row.scoredCount > 0 && row.scoredMinSec != null && row.scoredMaxSec != null) {
    const minClock = secondsToClock(row.scoredMinSec);
    const maxClock = secondsToClock(row.scoredMaxSec);
    return {
      actualCn: row.scoredMinSec === row.scoredMaxSec ? `\u5B9E\u9645\u8303\u56F4\uFF1A${minClock}` : `\u5B9E\u9645\u8303\u56F4\uFF1A${minClock} - ${maxClock}`,
      actualEn: row.scoredMinSec === row.scoredMaxSec ? `Actual range: ${minClock}` : `Actual range: ${minClock} - ${maxClock}`,
      isEmpty: false
    };
  }
  return {
    actualCn: "\u5B9E\u9645\u8303\u56F4\uFF1A\u65E0\u6709\u6548\u6210\u7EE9\uFF08\u542B\u65E0\u6210\u7EE9\u9009\u624B\uFF09",
    actualEn: "Actual range: No verified performance (includes runners without time)",
    isEmpty: false
  };
}
function resolveManualPreferredIndex(scoreSec, manualCount, thresholds, zoneCount) {
  if (manualCount <= 0) return 0;
  for (let i = 0; i < manualCount; i++) {
    const upper = thresholds[i];
    if (upper != null && scoreSec <= upper) return i;
  }
  if (manualCount < zoneCount) return manualCount;
  return zoneCount - 1;
}
function assertEventZoneThresholdConfig(bundle) {
  const { eventLabel, zones, thresholds, manualCount } = bundle;
  for (let i = manualCount; i < thresholds.length; i++) {
    if (thresholds[i] != null) {
      throw new Error(`[\u5206\u533A\u5206\u914D\u5931\u8D25] \u9879\u76EE ${eventLabel}: \u9608\u503C\u5FC5\u987B\u4ECE\u524D\u5F80\u540E\u8FDE\u7EED\u586B\u5199\uFF0C${normalizeText(zones[i].zoneName)} \u4E4B\u524D\u5B58\u5728\u7A7A\u6863`);
    }
  }
  for (let i = 1; i < manualCount; i++) {
    const prev = thresholds[i - 1];
    const curr = thresholds[i];
    if (prev != null && curr != null && curr <= prev) {
      throw new Error(`[\u5206\u533A\u5206\u914D\u5931\u8D25] \u9879\u76EE ${eventLabel}: ${normalizeText(zones[i].zoneName)} \u9608\u503C\u9700\u5927\u4E8E\u524D\u4E00\u533A\u9608\u503C`);
    }
  }
}
function buildEventZoneBundles(zones) {
  const nonSZones = sortZones(zones).filter((z) => !isSZone(z.zoneName));
  if (nonSZones.length === 0) {
    throw new Error("[\u5206\u533A\u5206\u914D\u5931\u8D25] \u672A\u914D\u7F6E\u53EF\u7528\u5206\u533A\uFF08S \u533A\u4E0D\u53C2\u4E0E\u81EA\u52A8\u5206\u533A\uFF09");
  }
  const byEvent = /* @__PURE__ */ new Map();
  const eventOrder = [];
  for (const zone of nonSZones) {
    const eventKey = normalizeEventKey(zone.event);
    if (!eventKey) {
      throw new Error(`[\u5206\u533A\u5206\u914D\u5931\u8D25] \u5206\u533A ${normalizeText(zone.zoneName) || "(\u7A7A)"} \u672A\u914D\u7F6E\u9879\u76EE`);
    }
    if (!byEvent.has(eventKey)) {
      byEvent.set(eventKey, []);
      eventOrder.push(eventKey);
    }
    byEvent.get(eventKey).push(zone);
  }
  const bundles = [];
  for (const eventKey of eventOrder) {
    const zonesForEvent = byEvent.get(eventKey) || [];
    const caps = zonesForEvent.map(zoneEffectiveCapacity);
    const thresholds = zonesForEvent.map((z) => normalizeScoreUpperSeconds(z.scoreUpperSeconds));
    let manualCount = 0;
    while (manualCount < thresholds.length && thresholds[manualCount] != null) manualCount += 1;
    const eventDisplay = resolveEventDisplay(zonesForEvent[0]?.event || "");
    const bundle = {
      eventKey,
      eventLabel: normalizeText(zonesForEvent[0]?.event) || "(\u7A7A\u9879\u76EE)",
      titleCn: eventDisplay.titleCn,
      titleEn: eventDisplay.titleEn,
      zones: zonesForEvent,
      caps,
      thresholds,
      manualCount
    };
    assertEventZoneThresholdConfig(bundle);
    bundles.push(bundle);
  }
  return bundles;
}
function buildEligibleRunners(records) {
  const runners = [];
  records.forEach((record, index) => {
    if (!isBibEligibleStatus(record.lotteryStatus)) return;
    if (isSZone(String(record.lotteryZone || ""))) return;
    const scoreSec = scoreSeconds(record);
    const importedAt = Date.parse(String(record._importedAt || ""));
    runners.push({
      record,
      originalIndex: index,
      eventKey: normalizeEventKey(record.event),
      scoreSec,
      hasScore: Number.isFinite(scoreSec),
      stableId: typeof record.id === "number" ? record.id : Number.MAX_SAFE_INTEGER,
      stableImportedAt: Number.isFinite(importedAt) ? importedAt : Number.MAX_SAFE_INTEGER,
      stableIdNumber: String(record.idNumber || ""),
      stableName: String(record.name || "")
    });
  });
  return runners;
}
function assignByAutoCapacity(eventRunners, bundle, assignedZoneByIndex) {
  const sorted = [...eventRunners].sort(compareEligible);
  const totalCap = bundle.caps.reduce((s, c) => s + c, 0);
  if (sorted.length > totalCap) {
    throw new Error(`[\u5206\u533A\u5206\u914D\u5931\u8D25] \u9879\u76EE ${bundle.eventLabel} \u8D85\u51FA\u5BB9\u91CF\uFF1A\u4EBA\u6570 ${sorted.length}\uFF0C\u5BB9\u91CF ${totalCap}`);
  }
  let zoneCursor = 0;
  let usedInCurrent = 0;
  for (const runner of sorted) {
    while (zoneCursor < bundle.zones.length && usedInCurrent >= bundle.caps[zoneCursor]) {
      zoneCursor += 1;
      usedInCurrent = 0;
    }
    if (zoneCursor >= bundle.zones.length) {
      throw new Error(`[\u5206\u533A\u5206\u914D\u5931\u8D25] \u9879\u76EE ${bundle.eventLabel} \u8D85\u51FA\u5BB9\u91CF\uFF0C\u8BF7\u68C0\u67E5\u5206\u533A\u914D\u7F6E`);
    }
    assignedZoneByIndex.set(runner.originalIndex, normalizeText(bundle.zones[zoneCursor].zoneName));
    usedInCurrent += 1;
  }
}
function assignByManualThreshold(eventRunners, bundle, assignedZoneByIndex, overflowByZoneName) {
  const zoneCount = bundle.zones.length;
  const totalCap = bundle.caps.reduce((s, c) => s + c, 0);
  if (eventRunners.length > totalCap) {
    throw new Error(`[\u5206\u533A\u5206\u914D\u5931\u8D25] \u9879\u76EE ${bundle.eventLabel} \u8D85\u51FA\u5BB9\u91CF\uFF1A\u4EBA\u6570 ${eventRunners.length}\uFF0C\u5BB9\u91CF ${totalCap}`);
  }
  const scored = eventRunners.filter((r) => r.hasScore).sort(compareEligible);
  const unscored = eventRunners.filter((r) => !r.hasScore).sort(compareEligible);
  const used = new Array(zoneCount).fill(0);
  const capsForScored = [...bundle.caps];
  const lastIndex = zoneCount - 1;
  const reserveForUnscored = Math.min(unscored.length, bundle.caps[lastIndex]);
  capsForScored[lastIndex] = Math.max(0, capsForScored[lastIndex] - reserveForUnscored);
  const assignWithCaps = (runner, preferredIndex, capTable) => {
    for (let i = preferredIndex; i < zoneCount; i++) {
      if (used[i] < capTable[i]) {
        used[i] += 1;
        assignedZoneByIndex.set(runner.originalIndex, normalizeText(bundle.zones[i].zoneName));
        return i;
      }
      if (i === preferredIndex) {
        const zoneName = normalizeText(bundle.zones[i].zoneName);
        overflowByZoneName.set(zoneName, (overflowByZoneName.get(zoneName) || 0) + 1);
      }
    }
    return -1;
  };
  for (const runner of scored) {
    const preferredIndex = resolveManualPreferredIndex(runner.scoreSec, bundle.manualCount, bundle.thresholds, zoneCount);
    const assignedIndex = assignWithCaps(runner, preferredIndex, capsForScored);
    if (assignedIndex < 0) {
      throw new Error(`[\u5206\u533A\u5206\u914D\u5931\u8D25] \u9879\u76EE ${bundle.eventLabel} \u5BB9\u91CF\u4E0D\u8DB3\uFF0C\u65E0\u6CD5\u4E3A\u6709\u6210\u7EE9\u9009\u624B\u5206\u914D\u5206\u533A`);
    }
  }
  for (const runner of unscored) {
    if (used[lastIndex] >= bundle.caps[lastIndex]) {
      throw new Error(`[\u5206\u533A\u5206\u914D\u5931\u8D25] \u9879\u76EE ${bundle.eventLabel} \u6700\u540E\u4E00\u6863\u5BB9\u91CF\u4E0D\u8DB3\uFF0C\u65E0\u6CD5\u5BB9\u7EB3\u65E0\u6210\u7EE9\u9009\u624B`);
    }
    used[lastIndex] += 1;
    assignedZoneByIndex.set(runner.originalIndex, normalizeText(bundle.zones[lastIndex].zoneName));
  }
}
function allocateZonesByEventAndScoreDetailed(records, startZones) {
  const eligibleRunners = buildEligibleRunners(records);
  if (eligibleRunners.length === 0) {
    return {
      records: records.map((r) => ({ ...r })),
      zoneGuide: {
        groups: [],
        hasSZone: startZones.some((z) => isSZone(z.zoneName)),
        sZoneNoteCn: "S \u533A\u4E3A\u7279\u9080\u533A\uFF0C\u4E0D\u53C2\u4E0E\u81EA\u52A8\u6210\u7EE9\u5206\u533A\u3002",
        sZoneNoteEn: "S zone is reserved for invited runners and excluded from automatic performance zoning."
      },
      zoneSummary: [],
      hasManualThreshold: false
    };
  }
  const bundles = buildEventZoneBundles(startZones);
  const bundleByEvent = new Map(bundles.map((bundle) => [bundle.eventKey, bundle]));
  const runnersByEvent = /* @__PURE__ */ new Map();
  for (const runner of eligibleRunners) {
    const list = runnersByEvent.get(runner.eventKey) || [];
    list.push(runner);
    runnersByEvent.set(runner.eventKey, list);
  }
  const assignedZoneByIndex = /* @__PURE__ */ new Map();
  const overflowByZoneName = /* @__PURE__ */ new Map();
  let hasManualThreshold = false;
  for (const [eventKey, eventRunners] of runnersByEvent.entries()) {
    const bundle = bundleByEvent.get(eventKey);
    const eventLabel = normalizeText(eventRunners[0]?.record.event) || "(\u7A7A\u9879\u76EE)";
    if (!bundle) {
      throw new Error(`[\u5206\u533A\u5206\u914D\u5931\u8D25] \u9879\u76EE ${eventLabel} \u672A\u627E\u5230\u53EF\u7528\u5206\u533A\uFF08\u6309 start_zones.event \u7CBE\u786E\u5339\u914D\uFF09`);
    }
    if (bundle.manualCount > 0) {
      hasManualThreshold = true;
      assignByManualThreshold(eventRunners, bundle, assignedZoneByIndex, overflowByZoneName);
    } else {
      assignByAutoCapacity(eventRunners, bundle, assignedZoneByIndex);
    }
  }
  const mappedRecords = records.map((record, index) => {
    const nextZone = assignedZoneByIndex.get(index);
    if (!nextZone) return { ...record };
    return { ...record, lotteryZone: nextZone };
  });
  const runnerByIndex = /* @__PURE__ */ new Map();
  for (const runner of eligibleRunners) runnerByIndex.set(runner.originalIndex, runner);
  const metricsByZone = /* @__PURE__ */ new Map();
  for (const bundle of bundles) {
    for (const zone of bundle.zones) {
      const zoneName = normalizeText(zone.zoneName) || DEFAULT_ZONE_LABEL;
      if (!metricsByZone.has(zoneName)) {
        metricsByZone.set(zoneName, {
          totalCount: 0,
          scoredCount: 0,
          unscoredCount: 0,
          scoredMinSec: null,
          scoredMaxSec: null,
          overflowCount: overflowByZoneName.get(zoneName) || 0
        });
      }
    }
  }
  for (const [index, zoneNameRaw] of assignedZoneByIndex.entries()) {
    const runner = runnerByIndex.get(index);
    if (!runner) continue;
    const zoneName = normalizeText(zoneNameRaw) || DEFAULT_ZONE_LABEL;
    const metrics = metricsByZone.get(zoneName) || {
      totalCount: 0,
      scoredCount: 0,
      unscoredCount: 0,
      scoredMinSec: null,
      scoredMaxSec: null,
      overflowCount: overflowByZoneName.get(zoneName) || 0
    };
    metrics.totalCount += 1;
    if (runner.hasScore) {
      metrics.scoredCount += 1;
      metrics.scoredMinSec = metrics.scoredMinSec == null ? runner.scoreSec : Math.min(metrics.scoredMinSec, runner.scoreSec);
      metrics.scoredMaxSec = metrics.scoredMaxSec == null ? runner.scoreSec : Math.max(metrics.scoredMaxSec, runner.scoreSec);
    } else {
      metrics.unscoredCount += 1;
    }
    metricsByZone.set(zoneName, metrics);
  }
  const groups = bundles.map((bundle) => {
    let previousAutoThresholdSec = null;
    const rows = bundle.zones.map((zone, idx) => {
      const zoneName = normalizeText(zone.zoneName) || DEFAULT_ZONE_LABEL;
      const metrics = metricsByZone.get(zoneName) || {
        totalCount: 0,
        scoredCount: 0,
        unscoredCount: 0,
        scoredMinSec: null,
        scoredMaxSec: null,
        overflowCount: overflowByZoneName.get(zoneName) || 0
      };
      let thresholdCn = "";
      let thresholdEn = "";
      if (bundle.manualCount > 0) {
        const threshold = buildThresholdTextByManualConfig(idx, bundle.zones.length, bundle.manualCount, bundle.thresholds);
        thresholdCn = threshold.thresholdCn;
        thresholdEn = threshold.thresholdEn;
      } else {
        const threshold = buildThresholdTextByAutoRange(metrics, previousAutoThresholdSec);
        thresholdCn = threshold.thresholdCn;
        thresholdEn = threshold.thresholdEn;
        previousAutoThresholdSec = threshold.nextPreviousThresholdSec;
      }
      const actual = buildActualRangeText(metrics);
      return {
        zone: zoneName,
        thresholdCn,
        thresholdEn,
        actualCn: actual.actualCn,
        actualEn: actual.actualEn,
        totalCount: metrics.totalCount,
        scoredCount: metrics.scoredCount,
        unscoredCount: metrics.unscoredCount,
        overflowCount: metrics.overflowCount,
        isEmpty: actual.isEmpty
      };
    });
    return {
      eventKey: bundle.eventKey,
      titleCn: bundle.titleCn,
      titleEn: bundle.titleEn,
      rows
    };
  });
  const zoneCounter = /* @__PURE__ */ new Map();
  for (const zoneNameRaw of assignedZoneByIndex.values()) {
    const zoneName = normalizeText(zoneNameRaw) || DEFAULT_ZONE_LABEL;
    zoneCounter.set(zoneName, (zoneCounter.get(zoneName) || 0) + 1);
  }
  const zoneSummary = Array.from(zoneCounter.entries()).map(([zone, count]) => ({ zone, count })).sort((a, b) => b.count - a.count);
  return {
    records: mappedRecords,
    zoneGuide: {
      groups,
      hasSZone: startZones.some((z) => isSZone(z.zoneName)),
      sZoneNoteCn: "S \u533A\u4E3A\u7279\u9080\u533A\uFF0C\u4E0D\u53C2\u4E0E\u81EA\u52A8\u6210\u7EE9\u5206\u533A\u3002",
      sZoneNoteEn: "S zone is reserved for invited runners and excluded from automatic performance zoning."
    },
    zoneSummary,
    hasManualThreshold
  };
}
function allocateZonesByEventAndScore(records, startZones) {
  const detail = allocateZonesByEventAndScoreDetailed(records, startZones);
  return detail.records;
}
export {
  allocateZonesByEventAndScore,
  allocateZonesByEventAndScoreDetailed,
  parseClockToSeconds,
  scoreSeconds,
  secondsToClock
};
