import { jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { normalizeZone } from "./bibUtils";
import { allocateZonesByEventAndScoreDetailed, parseClockToSeconds, secondsToClock } from "./zoneAllocator";
function toInt(v, fallback, min) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, n);
}
function inferPrefixByZone(zoneName) {
  const first = String(zoneName || "").trim().match(/[A-Za-z0-9]/)?.[0];
  return first ? first.toUpperCase() : "Z";
}
function normalizePrefixInput(v) {
  const first = String(v || "").trim().match(/[A-Za-z0-9]/)?.[0];
  return first ? first.toUpperCase() : "";
}
function isSpecialSZone(zoneName) {
  return normalizeZone(zoneName).toUpperCase() === "S";
}
function resolveZoneStartNo(v, fallback) {
  const parsed = Number(v);
  if (!Number.isFinite(parsed)) return Math.max(1, Math.floor(fallback));
  return Math.max(1, Math.floor(parsed));
}
function zoneKey(z) {
  return String(z.id ?? z.zoneName);
}
function normalizeHexColor(raw) {
  const v = String(raw || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const r = v.slice(1);
    return `#${r[0]}${r[0]}${r[1]}${r[1]}${r[2]}${r[2]}`;
  }
  return "#3B82F6";
}
function parseThresholdInput(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return { valid: true, seconds: null };
  const sec = parseClockToSeconds(trimmed);
  if (sec == null) return { valid: false, seconds: null };
  return { valid: true, seconds: sec };
}
function formatThresholdInput(secRaw) {
  const sec = Number(secRaw);
  if (!Number.isFinite(sec) || sec <= 0) return "";
  return secondsToClock(sec);
}
function BibRuleManager({
  config,
  setConfig,
  onReset,
  startZones,
  zonePreviewRecords,
  onUpdateStartZone
}) {
  const [zoneNameDraftMap, setZoneNameDraftMap] = useState({});
  const [zoneThresholdDraftMap, setZoneThresholdDraftMap] = useState({});
  const [savingZoneKey, setSavingZoneKey] = useState("");
  const [showSZoneGuide, setShowSZoneGuide] = useState(false);
  useEffect(() => {
    const names = {};
    const thresholds = {};
    for (const z of startZones) {
      const key = zoneKey(z);
      names[key] = z.zoneName;
      thresholds[key] = formatThresholdInput(z.scoreUpperSeconds);
    }
    setZoneNameDraftMap(names);
    setZoneThresholdDraftMap(thresholds);
  }, [startZones]);
  const zones = useMemo(() => {
    return [...startZones].map((z) => ({ ...z, zoneName: normalizeZone(z.zoneName), color: normalizeHexColor(z.color) })).filter((z) => z.zoneName !== "").sort((a, b) => {
      const ao = Number.isFinite(a.sortOrder) ? Number(a.sortOrder) : Number.MAX_SAFE_INTEGER;
      const bo = Number.isFinite(b.sortOrder) ? Number(b.sortOrder) : Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return a.zoneName.localeCompare(b.zoneName, "zh-CN");
    });
  }, [startZones]);
  useEffect(() => {
    if (!zones.some((z) => isSpecialSZone(z.zoneName))) setShowSZoneGuide(false);
  }, [zones]);
  const prefixMap = useMemo(() => config.zonePrefixMap || {}, [config.zonePrefixMap]);
  const updateNumber = (field, value, min = 1) => {
    setConfig({ ...config, [field]: toInt(value, Number(config[field]) || min, min) });
  };
  const updateBibMode = (mode) => setConfig({ ...config, bibNoMode: mode });
  const updateZonePrefix = (zoneName, nextPrefixRaw) => {
    const nextPrefix = normalizePrefixInput(nextPrefixRaw) || inferPrefixByZone(zoneName);
    setConfig({ ...config, zonePrefixMap: { ...prefixMap, [zoneName]: nextPrefix } });
  };
  const syncPrefixFromStartZones = () => {
    const nextMap = {};
    for (const zone of zones) nextMap[zone.zoneName] = inferPrefixByZone(zone.zoneName);
    setConfig({ ...config, zonePrefixMap: nextMap });
  };
  const syncZoneStartNoFromGlobal = () => {
    const nextMaleMap = {};
    const nextFemaleMap = {};
    for (const zone of zones) {
      if (isSpecialSZone(zone.zoneName)) continue;
      nextMaleMap[zone.zoneName] = resolveZoneStartNo(config.startNoMale, 1);
      nextFemaleMap[zone.zoneName] = resolveZoneStartNo(config.startNoFemale, 1);
    }
    setConfig({
      ...config,
      zoneStartNoMaleMap: nextMaleMap,
      zoneStartNoFemaleMap: nextFemaleMap
    });
  };
  const updateZoneGenderStartNo = (zoneName, gender, nextStartRaw) => {
    if (isSpecialSZone(zoneName)) return;
    const nextStart = resolveZoneStartNo(nextStartRaw, gender === "M" ? config.startNoMale : config.startNoFemale);
    if (gender === "M") {
      setConfig({ ...config, zoneStartNoMaleMap: { ...config.zoneStartNoMaleMap || {}, [zoneName]: nextStart } });
      return;
    }
    setConfig({ ...config, zoneStartNoFemaleMap: { ...config.zoneStartNoFemaleMap || {}, [zoneName]: nextStart } });
  };
  const thresholdDraftInfo = useMemo(() => {
    const invalidKeys = /* @__PURE__ */ new Set();
    const draftZones = zones.map((zone) => {
      const key = zoneKey(zone);
      const parsed = parseThresholdInput(zoneThresholdDraftMap[key] ?? "");
      if (!parsed.valid) invalidKeys.add(key);
      return { ...zone, scoreUpperSeconds: parsed.seconds };
    });
    return { invalidKeys, draftZones };
  }, [zoneThresholdDraftMap, zones]);
  const livePreview = useMemo(() => {
    if (zonePreviewRecords.length === 0) return { result: null, error: "" };
    if (thresholdDraftInfo.invalidKeys.size > 0) return { result: null, error: "\u5B58\u5728\u975E\u6CD5\u6210\u7EE9\u65F6\u95F4\u683C\u5F0F\uFF0C\u8BF7\u4F7F\u7528 HH:MM:SS" };
    try {
      return { result: allocateZonesByEventAndScoreDetailed(zonePreviewRecords, thresholdDraftInfo.draftZones), error: "" };
    } catch (err) {
      return { result: null, error: err instanceof Error ? err.message : "\u5B9E\u65F6\u9884\u89C8\u5931\u8D25" };
    }
  }, [thresholdDraftInfo, zonePreviewRecords]);
  const commitZoneName = async (zone, rawName) => {
    if (!onUpdateStartZone) return;
    const key = zoneKey(zone);
    const nextName = normalizeZone(rawName);
    if (!nextName || nextName === zone.zoneName) {
      setZoneNameDraftMap((prev) => ({ ...prev, [key]: zone.zoneName }));
      return;
    }
    setSavingZoneKey(key);
    try {
      await onUpdateStartZone(zone, { zoneName: nextName });
    } finally {
      setSavingZoneKey("");
    }
  };
  const commitZoneColor = async (zone, colorRaw) => {
    if (!onUpdateStartZone) return;
    const key = zoneKey(zone);
    setSavingZoneKey(key);
    try {
      await onUpdateStartZone(zone, { color: normalizeHexColor(colorRaw) });
    } finally {
      setSavingZoneKey("");
    }
  };
  const commitZoneThreshold = async (zone, raw) => {
    if (!onUpdateStartZone) return;
    const key = zoneKey(zone);
    const parsed = parseThresholdInput(raw);
    if (!parsed.valid) {
      setZoneThresholdDraftMap((prev2) => ({ ...prev2, [key]: formatThresholdInput(zone.scoreUpperSeconds) }));
      return;
    }
    const prev = zone.scoreUpperSeconds == null ? null : Number(zone.scoreUpperSeconds);
    const next = parsed.seconds == null ? null : Number(parsed.seconds);
    if (prev === next) return;
    setSavingZoneKey(key);
    try {
      await onUpdateStartZone(zone, { scoreUpperSeconds: next });
    } finally {
      setSavingZoneKey("");
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: "card bib-panel", style: { border: "1px solid var(--border)", gap: 14 }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h4", { style: { marginBottom: 6 }, children: "\u6392\u53F7\u53C2\u6570\u914D\u7F6E" }),
        /* @__PURE__ */ jsx("div", { style: { fontSize: 12, color: "var(--text-secondary)" }, children: "\u6210\u7EE9\u9608\u503C\u4EC5\u5F71\u54CD\u6392\u53F7\u5206\u533A\uFF0C\u4E0D\u5F71\u54CD\u62BD\u7B7E\u4E2D\u5956\u540D\u5355\u3002" })
      ] }),
      /* @__PURE__ */ jsx("button", { className: "btn btn--secondary", onClick: onReset, style: { padding: "0.5rem 1rem", fontSize: 12 }, children: "\u6062\u590D\u9ED8\u8BA4" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "bib-rule-top-grid", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("label", { style: { fontSize: 11, color: "var(--text-muted)" }, children: "\u7537\u5168\u5C40\u8D77\u59CB\u53F7" }),
        /* @__PURE__ */ jsx("input", { className: "input", type: "number", min: 1, value: config.startNoMale, onChange: (e) => updateNumber("startNoMale", e.target.value) })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("label", { style: { fontSize: 11, color: "var(--text-muted)" }, children: "\u5973\u5168\u5C40\u8D77\u59CB\u53F7" }),
        /* @__PURE__ */ jsx("input", { className: "input", type: "number", min: 1, value: config.startNoFemale, onChange: (e) => updateNumber("startNoFemale", e.target.value) })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("label", { style: { fontSize: 11, color: "var(--text-muted)" }, children: "\u53F7\u7801\u4F4D\u6570" }),
        /* @__PURE__ */ jsx("input", { className: "input", type: "number", min: 1, max: 8, value: config.bibDigits, onChange: (e) => updateNumber("bibDigits", e.target.value) })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("label", { style: { fontSize: 11, color: "var(--text-muted)" }, children: "\u7F16\u53F7\u6A21\u5F0F" }),
        /* @__PURE__ */ jsxs("select", { className: "input", value: config.bibNoMode, onChange: (e) => updateBibMode(e.target.value), children: [
          /* @__PURE__ */ jsx("option", { value: "perZone", children: "perZone" }),
          /* @__PURE__ */ jsx("option", { value: "global", children: "global" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "bib-zone-panel", children: [
      /* @__PURE__ */ jsxs("div", { className: "bib-zone-toolbar", children: [
        /* @__PURE__ */ jsxs("div", { className: "bib-zone-toolbar-left", children: [
          /* @__PURE__ */ jsx("label", { style: { fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }, children: "\u5206\u533A\u914D\u7F6E\u4E0E\u8BF4\u660E \xB7 Zone Config & Guide" }),
          /* @__PURE__ */ jsx("span", { style: { fontSize: 11, color: "var(--text-secondary)" }, children: "\u5B9E\u65F6\u9884\u89C8\u4E0E\u6392\u53F7\u6267\u884C\u5171\u7528\u540C\u4E00\u5206\u533A\u7B97\u6CD5" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "bib-zone-actions", children: [
          /* @__PURE__ */ jsx("button", { className: "btn btn-ghost bib-zone-action-btn", onClick: syncPrefixFromStartZones, children: "\u540C\u6B65\u5206\u533A\u524D\u7F00" }),
          /* @__PURE__ */ jsx("button", { className: "btn btn-ghost bib-zone-action-btn", onClick: syncZoneStartNoFromGlobal, children: "\u5168\u5C40\u53F7\u8986\u76D6\u5206\u533A" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "bib-zone-grid", children: [
        /* @__PURE__ */ jsxs("div", { className: "bib-zone-grid-head", children: [
          /* @__PURE__ */ jsx("span", { children: "\u5206\u533A" }),
          /* @__PURE__ */ jsx("span", { children: "\u524D\u7F00" }),
          /* @__PURE__ */ jsx("span", { children: "\u7537\u8D77\u59CB\u53F7" }),
          /* @__PURE__ */ jsx("span", { children: "\u5973\u8D77\u59CB\u53F7" }),
          /* @__PURE__ */ jsx("span", { children: "\u6210\u7EE9\u4E0A\u9650" }),
          /* @__PURE__ */ jsx("span", { children: "\u53F7\u7801\u793A\u4F8B" })
        ] }),
        zones.map((z) => {
          const key = zoneKey(z);
          const prefix = prefixMap[z.zoneName] || inferPrefixByZone(z.zoneName);
          const isSpecial = isSpecialSZone(z.zoneName);
          const maleStart = resolveZoneStartNo(config.zoneStartNoMaleMap?.[z.zoneName], config.startNoMale);
          const femaleStart = resolveZoneStartNo(config.zoneStartNoFemaleMap?.[z.zoneName], config.startNoFemale);
          const thresholdDraft = zoneThresholdDraftMap[key] ?? "";
          const thresholdParsed = parseThresholdInput(thresholdDraft);
          return /* @__PURE__ */ jsxs("div", { className: "bib-zone-row", children: [
            /* @__PURE__ */ jsxs("div", { className: "bib-zone-identity", children: [
              /* @__PURE__ */ jsx("div", { className: "bib-zone-chip", style: { background: normalizeHexColor(z.color) }, children: z.zoneName }),
              /* @__PURE__ */ jsxs("div", { className: "bib-zone-name-wrap", children: [
                /* @__PURE__ */ jsx("input", { className: "input bib-zone-name-input", value: zoneNameDraftMap[key] ?? z.zoneName, onChange: (e) => setZoneNameDraftMap((prev) => ({ ...prev, [key]: e.target.value })), onBlur: (e) => {
                  void commitZoneName(z, e.target.value);
                }, disabled: savingZoneKey === key }),
                /* @__PURE__ */ jsx("span", { className: "bib-zone-sub", children: "\u4E0E\u8D77\u70B9\u6C99\u76D8\u540C\u6B65" })
              ] }),
              /* @__PURE__ */ jsx("input", { type: "color", value: normalizeHexColor(z.color), onChange: (e) => {
                void commitZoneColor(z, e.target.value);
              }, className: "bib-zone-color-input", disabled: savingZoneKey === key })
            ] }),
            /* @__PURE__ */ jsx("input", { className: "input", value: prefix, maxLength: 1, onChange: (e) => updateZonePrefix(z.zoneName, e.target.value) }),
            isSpecial ? /* @__PURE__ */ jsx("div", { className: "input", children: "-" }) : /* @__PURE__ */ jsx("input", { className: "input", type: "number", min: 1, value: maleStart, onChange: (e) => updateZoneGenderStartNo(z.zoneName, "M", e.target.value) }),
            isSpecial ? /* @__PURE__ */ jsx("div", { className: "input", children: "-" }) : /* @__PURE__ */ jsx("input", { className: "input", type: "number", min: 1, value: femaleStart, onChange: (e) => updateZoneGenderStartNo(z.zoneName, "F", e.target.value) }),
            isSpecial ? /* @__PURE__ */ jsx("div", { className: "input", children: "S \u533A\u4E0D\u53C2\u4E0E" }) : /* @__PURE__ */ jsx(
              "input",
              {
                className: "input",
                value: thresholdDraft,
                onChange: (e) => setZoneThresholdDraftMap((prev) => ({ ...prev, [key]: e.target.value })),
                onBlur: (e) => {
                  void commitZoneThreshold(z, e.target.value);
                },
                onKeyDown: (e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") {
                    setZoneThresholdDraftMap((prev) => ({ ...prev, [key]: formatThresholdInput(z.scoreUpperSeconds) }));
                    e.currentTarget.blur();
                  }
                },
                placeholder: "HH:MM:SS",
                disabled: savingZoneKey === key,
                style: !thresholdParsed.valid ? { borderColor: "#EF4444" } : void 0
              }
            ),
            /* @__PURE__ */ jsx("div", { className: "bib-zone-preview", children: isSpecial ? "\u7279\u9080\u533A\u4E0D\u6392\u53F7" : `${prefix}${String(maleStart).padStart(config.bibDigits, "0")} / ${prefix}${String(femaleStart).padStart(config.bibDigits, "0")}` })
          ] }, key);
        })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "bib-execution-zone-guide", children: [
      /* @__PURE__ */ jsx("div", { className: "bib-execution-zone-guide-head", children: livePreview.result?.zoneGuide.hasSZone && /* @__PURE__ */ jsxs("label", { className: "bib-execution-zone-guide-toggle", children: [
        /* @__PURE__ */ jsx("input", { type: "checkbox", checked: showSZoneGuide, onChange: (e) => setShowSZoneGuide(e.target.checked) }),
        /* @__PURE__ */ jsx("span", { children: "\u663E\u793A S \u533A\u8BF4\u660E / Show S Zone" })
      ] }) }),
      livePreview.error && /* @__PURE__ */ jsx("div", { className: "bib-execution-zone-guide-empty", style: { color: "#B91C1C" }, children: livePreview.error }),
      !livePreview.error && !livePreview.result && /* @__PURE__ */ jsx("div", { className: "bib-execution-zone-guide-empty", children: "\u6682\u65E0\u53EF\u6392\u53F7\u9009\u624B" }),
      !livePreview.error && livePreview.result && /* @__PURE__ */ jsx("div", { className: "bib-execution-zone-guide-groups", children: livePreview.result.zoneGuide.groups.map((group) => /* @__PURE__ */ jsxs("section", { className: "bib-execution-zone-guide-group", children: [
        /* @__PURE__ */ jsxs("div", { className: "bib-execution-zone-guide-group-head", children: [
          /* @__PURE__ */ jsx("span", { children: group.titleCn }),
          /* @__PURE__ */ jsx("span", { children: group.titleEn })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "bib-execution-zone-guide-list", children: group.rows.map((row) => /* @__PURE__ */ jsxs("article", { className: `bib-execution-zone-guide-row${row.isEmpty ? " is-empty" : ""}`, children: [
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
            ] }),
            row.overflowCount > 0 && /* @__PURE__ */ jsxs("span", { className: "pill", children: [
              "\u6EA2\u51FA ",
              row.overflowCount
            ] })
          ] })
        ] }, `${group.eventKey}-${row.zone}`)) })
      ] }, group.eventKey)) }),
      livePreview.result?.zoneGuide.hasSZone && showSZoneGuide && /* @__PURE__ */ jsxs("div", { className: "bib-execution-zone-guide-s-note", children: [
        /* @__PURE__ */ jsx("div", { children: livePreview.result.zoneGuide.sZoneNoteCn }),
        /* @__PURE__ */ jsx("div", { children: livePreview.result.zoneGuide.sZoneNoteEn })
      ] })
    ] })
  ] });
}
export {
  BibRuleManager as default
};
