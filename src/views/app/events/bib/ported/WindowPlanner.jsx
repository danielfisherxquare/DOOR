import { jsx, jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import {
  calculateNextStartNumber,
  defaultEventWindowRange,
  eventWindowMapKey,
  sanitizeEventWindowRange,
  windowCountFromRange
} from "./eventWindowUtils";
const TEXT = {
  title: "\u7A97\u53E3\u5206\u914D\u89C4\u5212",
  subtitle: "\u53EF\u6309\u9879\u76EE\u5355\u72EC\u8BBE\u7F6E\u7A97\u53E3\u53F7\u8D77\u6B62\u8303\u56F4\uFF0C\u5E76\u5B9E\u65F6\u67E5\u770B\u6BCF\u4E2A\u9879\u76EE\u7684\u7A97\u53E3\u5206\u5E03\u3002",
  bagMode: "\u5B58\u8863\u7A97\u53E3\u53F7",
  expoMode: "\u535A\u89C8\u4F1A\u7A97\u53E3\u53F7",
  eventCount: "\u9879\u76EE\u6570",
  participantCount: "\u53C2\u4E0E\u4EBA\u6570",
  defaultWindowCount: "\u9ED8\u8BA4\u7A97\u53E3\u6570",
  tightGap: "\u6700\u7D27\u4F59\u91CF",
  defaultWindowCountInput: "\u9ED8\u8BA4\u7A97\u53E3\u6570\u91CF",
  windowCapacityInput: "\u6BCF\u7A97\u53E3\u5BB9\u91CF",
  expoSeed: "\u968F\u673A\u79CD\u5B50\uFF08\u76F8\u540C\u79CD\u5B50 = \u76F8\u540C\u7ED3\u679C\uFF09",
  expoSeedPlaceholder: "\u7559\u7A7A\u5219\u968F\u673A",
  applyRecommended: "\u5E94\u7528\u201C\u6700\u5927\u63A8\u8350\u7A97\u53E3\u6570\u201D",
  clearRanges: "\u6E05\u7A7A\u5168\u90E8\u9879\u76EE\u8D77\u6B62\u53F7\uFF08\u6062\u590D\u81EA\u52A8\u7F16\u53F7\uFF09",
  event: "\u9879\u76EE",
  participants: "\u4EBA\u6570",
  recommendedWindows: "\u63A8\u8350\u7A97\u53E3\u6570",
  windowRange: "\u7A97\u53E3\u53F7\u8D77\u6B62",
  effectiveWindows: "\u6709\u6548\u7A97\u53E3\u6570",
  capacityGap: "\u5BB9\u91CF\u4F59\u91CF",
  empty: "\u6682\u65E0\u53EF\u89C4\u5212\u9879\u76EE\uFF08\u8FD8\u6CA1\u6709\u53C2\u4E0E\u6392\u53F7\u7684\u9009\u624B\uFF09\u3002",
  preview: "\u9884\u89C8",
  insufficientCapacity: "\u5BB9\u91CF\u4E0D\u8DB3",
  remainingUnassigned: "\u8FD8\u6709",
  peopleUnassigned: "\u4EBA\u65E0\u6CD5\u5206\u914D",
  fullyAssigned: "\u5DF2\u53EF\u5B8C\u6574\u5206\u914D",
  people: "\u4EBA"
};
function toInt(v, fallback, min) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, n);
}
function normalizeHexColor(raw) {
  const v = String(raw || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const r = v.slice(1);
    return `#${r[0]}${r[0]}${r[1]}${r[1]}${r[2]}${r[2]}`;
  }
  return "#6366F1";
}
function distributeWithZoneColors(total, windowStartNo, windowCount, windowCapacity, zoneDistribution, startZones) {
  const items = Array.from({ length: Math.max(0, windowCount) }).map((_, idx) => ({
    windowNo: String(windowStartNo + idx).padStart(2, "0"),
    assigned: 0
  }));
  const zoneBreakdown = Array.from({ length: Math.max(0, windowCount) }).map(() => /* @__PURE__ */ new Map());
  if (total <= 0 || windowCount <= 0 || windowCapacity <= 0) {
    return { items, overflow: total > 0 ? total : 0, zoneBreakdown };
  }
  const zoneColorMap = /* @__PURE__ */ new Map();
  for (const zone of startZones || []) {
    const zoneName = String(zone.zoneName || "").trim();
    if (zoneName && zone.color) {
      zoneColorMap.set(zoneName, normalizeHexColor(zone.color));
    }
  }
  if (!zoneDistribution || zoneDistribution.length === 0) {
    let cursor2 = 0;
    let assignedTotal2 = 0;
    for (let i = 0; i < total; i += 1) {
      let placed = false;
      for (let step = 0; step < windowCount; step += 1) {
        const idx = (cursor2 + step) % windowCount;
        if (items[idx].assigned >= windowCapacity) continue;
        items[idx].assigned += 1;
        cursor2 = (idx + 1) % windowCount;
        assignedTotal2 += 1;
        placed = true;
        break;
      }
      if (!placed) break;
    }
    return { items, overflow: Math.max(0, total - assignedTotal2), zoneBreakdown };
  }
  let cursor = 0;
  let assignedTotal = 0;
  for (const zoneInfo of zoneDistribution) {
    const zoneName = zoneInfo.zone;
    const zoneColor = zoneColorMap.get(zoneName) || "#6366F1";
    const count = zoneInfo.count;
    for (let i = 0; i < count; i += 1) {
      let placed = false;
      for (let step = 0; step < windowCount; step += 1) {
        const idx = (cursor + step) % windowCount;
        if (items[idx].assigned >= windowCapacity) continue;
        items[idx].assigned += 1;
        zoneBreakdown[idx].set(zoneColor, (zoneBreakdown[idx].get(zoneColor) || 0) + 1);
        cursor = (idx + 1) % windowCount;
        assignedTotal += 1;
        placed = true;
        break;
      }
      if (!placed) break;
    }
  }
  return { items, overflow: Math.max(0, total - assignedTotal), zoneBreakdown };
}
function buildWindowBar(item, activeWindowCapacity, zoneBreakdown) {
  if (zoneBreakdown && zoneBreakdown.size > 0) {
    const segments = Array.from(zoneBreakdown.entries()).map(([color, count]) => ({
      color,
      count,
      heightPercent: item.assigned > 0 ? count / activeWindowCapacity * 100 : 0
    })).filter((segment) => segment.heightPercent > 0).sort((a, b) => b.count - a.count);
    let bottom = 0;
    return segments.map((segment, index) => {
      const element = /* @__PURE__ */ jsx(
        "div",
        {
          style: {
            position: "absolute",
            left: 0,
            right: 0,
            bottom: `${bottom}%`,
            height: `${segment.heightPercent}%`,
            background: segment.color
          }
        },
        `${segment.color}-${index}`
      );
      bottom += segment.heightPercent;
      return element;
    });
  }
  const ratio = activeWindowCapacity > 0 ? item.assigned / activeWindowCapacity : 0;
  return /* @__PURE__ */ jsx(
    "div",
    {
      style: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: `${Math.max(6, Math.round(ratio * 100))}%`,
        background: ratio > 0.95 ? "#F59E0B" : "#6366F1"
      }
    }
  );
}
function WindowPlanner({ config, setConfig, eventPlans, startZones }) {
  const [mode, setMode] = useState("bag");
  const activeWindowCount = mode === "bag" ? config.bagWindowCount : config.expoWindowCount;
  const activeWindowCapacity = mode === "bag" ? config.bagWindowCapacity : config.expoWindowCapacity;
  const defaultRange = useMemo(() => defaultEventWindowRange(activeWindowCount), [activeWindowCount]);
  const activeRangeMap = useMemo(
    () => mode === "bag" ? config.eventBagWindowRangeMap || {} : config.eventExpoWindowRangeMap || {},
    [mode, config.eventBagWindowRangeMap, config.eventExpoWindowRangeMap]
  );
  const rows = useMemo(() => {
    return eventPlans.reduce((acc, eventPlan) => {
      const previousEnd = acc.length > 0 ? acc[acc.length - 1].range.end : 0;
      const eventKey = eventPlan.eventKey || eventWindowMapKey(eventPlan.event);
      const customRange = activeRangeMap[eventKey];
      const range = customRange ? sanitizeEventWindowRange(customRange, defaultRange) : (() => {
        const start = previousEnd === 0 ? 1 : calculateNextStartNumber(previousEnd);
        const recommendedCount = Math.max(1, Math.ceil(eventPlan.participants / Math.max(1, activeWindowCapacity)));
        const end = start + recommendedCount - 1;
        return { start, end };
      })();
      const windowCount = windowCountFromRange(range);
      const recommended = Math.max(1, Math.ceil(eventPlan.participants / Math.max(1, activeWindowCapacity)));
      const capacity = windowCount * activeWindowCapacity;
      const gap = capacity - eventPlan.participants;
      const distribution = distributeWithZoneColors(
        eventPlan.participants,
        range.start,
        windowCount,
        activeWindowCapacity,
        eventPlan.zoneDistribution,
        startZones
      );
      acc.push({
        ...eventPlan,
        eventKey,
        range,
        windowCount,
        recommended,
        capacity,
        gap,
        distribution
      });
      return acc;
    }, []);
  }, [activeRangeMap, activeWindowCapacity, defaultRange, eventPlans, startZones]);
  const recommendedMaxWindowCount = useMemo(() => {
    if (rows.length === 0) return 1;
    return Math.max(1, ...rows.map((row) => row.recommended));
  }, [rows]);
  const totalParticipants = useMemo(() => rows.reduce((sum, row) => sum + row.participants, 0), [rows]);
  const tightGap = useMemo(() => {
    if (rows.length === 0) return 0;
    return Math.min(...rows.map((row) => row.gap));
  }, [rows]);
  const isOverCapacity = tightGap < 0;
  const updateModeConfig = (nextCount, nextCapacity) => {
    if (mode === "bag") {
      setConfig({ ...config, bagWindowCount: nextCount, bagWindowCapacity: nextCapacity });
      return;
    }
    setConfig({ ...config, expoWindowCount: nextCount, expoWindowCapacity: nextCapacity });
  };
  const saveModeRangeMap = (nextMap) => {
    if (mode === "bag") {
      setConfig({ ...config, eventBagWindowRangeMap: nextMap });
      return;
    }
    setConfig({ ...config, eventExpoWindowRangeMap: nextMap });
  };
  const updateEventRange = (eventKey, field, raw) => {
    const current = sanitizeEventWindowRange(activeRangeMap[eventKey], defaultRange);
    const parsed = toInt(raw, field === "start" ? current.start : current.end, 1);
    const nextRange = field === "start" ? { start: parsed, end: Math.max(parsed, current.end) } : { start: current.start, end: Math.max(current.start, parsed) };
    saveModeRangeMap({
      ...activeRangeMap,
      [eventKey]: sanitizeEventWindowRange(nextRange, defaultRange)
    });
  };
  return /* @__PURE__ */ jsxs("div", { className: "card bib-panel", style: { border: "1px solid var(--border)", gap: 14 }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h4", { style: { marginBottom: 6 }, children: TEXT.title }),
        /* @__PURE__ */ jsx("div", { style: { fontSize: 12, color: "var(--text-secondary)" }, children: TEXT.subtitle })
      ] }),
      /* @__PURE__ */ jsxs(
        "select",
        {
          className: "input",
          value: mode,
          onChange: (event) => setMode(event.target.value),
          style: { width: 180 },
          children: [
            /* @__PURE__ */ jsx("option", { value: "bag", children: TEXT.bagMode }),
            /* @__PURE__ */ jsx("option", { value: "expo", children: TEXT.expoMode })
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }, children: [
      /* @__PURE__ */ jsx(MiniStat, { label: TEXT.eventCount, value: `${rows.length}`, color: "#6366F1" }),
      /* @__PURE__ */ jsx(MiniStat, { label: TEXT.participantCount, value: totalParticipants.toLocaleString(), color: "#10B981" }),
      /* @__PURE__ */ jsx(MiniStat, { label: TEXT.defaultWindowCount, value: `${activeWindowCount}`, color: "#0EA5E9" }),
      /* @__PURE__ */ jsx(MiniStat, { label: TEXT.tightGap, value: tightGap.toLocaleString(), color: isOverCapacity ? "#EF4444" : "#22C55E" })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }, children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("label", { style: { fontSize: 11, color: "var(--text-muted)" }, children: TEXT.defaultWindowCountInput }),
        /* @__PURE__ */ jsx(
          "input",
          {
            className: "input",
            type: "number",
            min: 1,
            value: activeWindowCount,
            onChange: (event) => updateModeConfig(toInt(event.target.value, activeWindowCount, 1), activeWindowCapacity)
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("label", { style: { fontSize: 11, color: "var(--text-muted)" }, children: TEXT.windowCapacityInput }),
        /* @__PURE__ */ jsx(
          "input",
          {
            className: "input",
            type: "number",
            min: 1,
            value: activeWindowCapacity,
            onChange: (event) => updateModeConfig(activeWindowCount, toInt(event.target.value, activeWindowCapacity, 1))
          }
        )
      ] }),
      mode === "expo" && /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("label", { style: { fontSize: 11, color: "var(--text-muted)" }, children: TEXT.expoSeed }),
        /* @__PURE__ */ jsx(
          "input",
          {
            className: "input",
            type: "text",
            placeholder: TEXT.expoSeedPlaceholder,
            value: config.expoSeed || "",
            onChange: (event) => setConfig({ ...config, expoSeed: event.target.value })
          }
        )
      ] }),
      /* @__PURE__ */ jsx("div", { style: { display: "flex", alignItems: "flex-end" }, children: /* @__PURE__ */ jsxs(
        "button",
        {
          className: "btn btn--secondary",
          style: { width: "100%", padding: "0.625rem 1rem" },
          onClick: () => updateModeConfig(recommendedMaxWindowCount, activeWindowCapacity),
          children: [
            TEXT.applyRecommended,
            " (",
            recommendedMaxWindowCount,
            ")"
          ]
        }
      ) })
    ] }),
    /* @__PURE__ */ jsx("div", { style: { display: "flex", justifyContent: "flex-end" }, children: /* @__PURE__ */ jsx(
      "button",
      {
        className: "btn btn-ghost",
        style: { padding: "0.5rem 0.9rem" },
        onClick: () => saveModeRangeMap({}),
        children: TEXT.clearRanges
      }
    ) }),
    /* @__PURE__ */ jsxs("div", { style: { border: "1px solid var(--border)", borderRadius: 0, overflow: "hidden" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "grid", gridTemplateColumns: "1.05fr 0.72fr 0.82fr 1.18fr 0.75fr 0.8fr", background: "var(--bg-secondary)", fontSize: 12, fontWeight: 700 }, children: [
        /* @__PURE__ */ jsx("div", { style: { padding: "0.625rem 0.75rem" }, children: TEXT.event }),
        /* @__PURE__ */ jsx("div", { style: { padding: "0.625rem 0.75rem" }, children: TEXT.participants }),
        /* @__PURE__ */ jsx("div", { style: { padding: "0.625rem 0.75rem" }, children: TEXT.recommendedWindows }),
        /* @__PURE__ */ jsx("div", { style: { padding: "0.625rem 0.75rem" }, children: TEXT.windowRange }),
        /* @__PURE__ */ jsx("div", { style: { padding: "0.625rem 0.75rem" }, children: TEXT.effectiveWindows }),
        /* @__PURE__ */ jsx("div", { style: { padding: "0.625rem 0.75rem" }, children: TEXT.capacityGap })
      ] }),
      rows.map((row, index) => /* @__PURE__ */ jsxs(
        "div",
        {
          style: {
            display: "grid",
            gridTemplateColumns: "1.05fr 0.72fr 0.82fr 1.18fr 0.75fr 0.8fr",
            background: index % 2 === 0 ? "var(--surface)" : "var(--bg-secondary)",
            fontSize: 12,
            alignItems: "center"
          },
          children: [
            /* @__PURE__ */ jsx("div", { style: { padding: "0.625rem 0.75rem", fontWeight: 700 }, children: row.event }),
            /* @__PURE__ */ jsx("div", { style: { padding: "0.625rem 0.75rem" }, children: row.participants.toLocaleString() }),
            /* @__PURE__ */ jsx("div", { style: { padding: "0.625rem 0.75rem" }, children: row.recommended }),
            /* @__PURE__ */ jsx("div", { style: { padding: "0.5rem 0.75rem" }, children: /* @__PURE__ */ jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 16px 1fr", gap: 6, alignItems: "center" }, children: [
              /* @__PURE__ */ jsx(
                "input",
                {
                  className: "input",
                  type: "number",
                  min: 1,
                  value: row.range.start,
                  onChange: (event) => updateEventRange(row.eventKey, "start", event.target.value),
                  style: { minWidth: 0 }
                }
              ),
              /* @__PURE__ */ jsx("span", { style: { textAlign: "center", color: "var(--text-secondary)" }, children: "-" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  className: "input",
                  type: "number",
                  min: row.range.start,
                  value: row.range.end,
                  onChange: (event) => updateEventRange(row.eventKey, "end", event.target.value),
                  style: { minWidth: 0 }
                }
              )
            ] }) }),
            /* @__PURE__ */ jsx("div", { style: { padding: "0.625rem 0.75rem", fontWeight: 700 }, children: row.windowCount }),
            /* @__PURE__ */ jsx("div", { style: { padding: "0.625rem 0.75rem", color: row.gap < 0 ? "var(--danger)" : "var(--success)", fontWeight: 700 }, children: row.gap.toLocaleString() })
          ]
        },
        row.eventKey
      )),
      rows.length === 0 && /* @__PURE__ */ jsx("div", { style: { padding: "1rem", color: "var(--text-muted)", fontSize: 12 }, children: TEXT.empty })
    ] }),
    rows.length > 0 && /* @__PURE__ */ jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 10 }, children: rows.map((row) => /* @__PURE__ */ jsxs("div", { style: { border: "1px solid var(--border)", borderRadius: 0, padding: "0.875rem 1rem" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsxs("div", { style: { fontWeight: 700 }, children: [
          row.event,
          " ",
          TEXT.preview,
          " #",
          String(row.range.start).padStart(2, "0"),
          " - #",
          String(row.range.end).padStart(2, "0")
        ] }),
        /* @__PURE__ */ jsx("div", { style: { fontSize: 12, color: row.distribution.overflow > 0 ? "var(--danger)" : "var(--text-secondary)", fontWeight: 700 }, children: row.distribution.overflow > 0 ? `${TEXT.insufficientCapacity}\uFF1A${TEXT.remainingUnassigned} ${row.distribution.overflow} ${TEXT.peopleUnassigned}` : `${TEXT.fullyAssigned} ${row.participants} ${TEXT.people}` })
      ] }),
      /* @__PURE__ */ jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(34px, 1fr))", gap: 8 }, children: row.distribution.items.map((item, itemIndex) => /* @__PURE__ */ jsxs(
        "div",
        {
          style: {
            border: "1px solid var(--border)",
            borderRadius: 0,
            padding: "0.5rem",
            background: "var(--bg-secondary)"
          },
          children: [
            /* @__PURE__ */ jsxs("div", { style: { fontSize: 11, color: "var(--text-secondary)", marginBottom: 6 }, children: [
              "#",
              item.windowNo
            ] }),
            /* @__PURE__ */ jsx("div", { style: { height: 56, borderRadius: 6, background: "var(--bg-table-header)", position: "relative", overflow: "hidden" }, children: buildWindowBar(item, activeWindowCapacity, row.distribution.zoneBreakdown?.[itemIndex]) }),
            /* @__PURE__ */ jsx("div", { style: { marginTop: 6, fontSize: 12, fontWeight: 700, textAlign: "right" }, children: item.assigned })
          ]
        },
        `${row.eventKey}-${item.windowNo}`
      )) })
    ] }, `${row.eventKey}-${mode}`)) })
  ] });
}
function MiniStat({ label, value, color }) {
  return /* @__PURE__ */ jsxs("div", { style: { border: "1px solid var(--border)", borderRadius: 0, padding: "0.625rem 0.75rem", background: "var(--bg-secondary)" }, children: [
    /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }, children: label }),
    /* @__PURE__ */ jsx("div", { style: { fontSize: 18, fontWeight: 800, color }, children: value })
  ] });
}
export {
  WindowPlanner as default
};
