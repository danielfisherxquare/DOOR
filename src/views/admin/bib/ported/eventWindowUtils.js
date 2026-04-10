const UNSPECIFIED_EVENT_KEY = "__unspecified__";
function toIntAtLeast(v, fallback, min) {
  const parsed = Number(v);
  if (!Number.isFinite(parsed)) return Math.max(min, Math.floor(fallback));
  return Math.max(min, Math.floor(parsed));
}
function eventWindowMapKey(event) {
  const normalized = String(event || "").trim();
  const lowered = normalized.toLowerCase();
  if (!lowered) return UNSPECIFIED_EVENT_KEY;
  if (lowered === "unspecified_event" || lowered === "\u672A\u5206\u9879\u76EE" || lowered === "\u672A\u5206\u9805\u76EE") {
    return UNSPECIFIED_EVENT_KEY;
  }
  return lowered;
}
function defaultEventWindowRange(windowCount) {
  const count = toIntAtLeast(windowCount, 1, 1);
  return { start: 1, end: count };
}
function sanitizeEventWindowRange(raw, fallback) {
  const fallbackStart = toIntAtLeast(fallback.start, 1, 1);
  const fallbackEnd = Math.max(fallbackStart, toIntAtLeast(fallback.end, fallbackStart, fallbackStart));
  if (!raw || typeof raw !== "object") {
    return { start: fallbackStart, end: fallbackEnd };
  }
  const candidate = raw;
  const start = toIntAtLeast(candidate.start, fallbackStart, 1);
  const end = Math.max(start, toIntAtLeast(candidate.end, fallbackEnd, start));
  return { start, end };
}
function windowCountFromRange(range) {
  return Math.max(1, range.end - range.start + 1);
}
function calculateNextStartNumber(previousEnd) {
  const nextTen = Math.ceil((previousEnd + 1) / 10) * 10;
  return nextTen + 1;
}
export {
  UNSPECIFIED_EVENT_KEY,
  calculateNextStartNumber,
  defaultEventWindowRange,
  eventWindowMapKey,
  sanitizeEventWindowRange,
  toIntAtLeast,
  windowCountFromRange
};
