function isHalfEvent(event) {
  const v = String(event || "").trim().toLowerCase();
  return v.includes("\u534A") || v.includes("half");
}
function isFullEvent(event) {
  if (isHalfEvent(event)) return false;
  const v = String(event || "").trim().toLowerCase();
  return !v || v.includes("\u9A6C\u62C9\u677E") || v.includes("marathon") || v.includes("full") || v.includes("\u5168");
}
function toEventKey(event) {
  return isHalfEvent(event) ? "Half" : "Full";
}
function resolveEventDisplay(event) {
  const label = String(event || "").trim();
  if (!label) return { eventKey: "__unspecified__", titleCn: "\u672A\u6307\u5B9A", titleEn: "Unspecified" };
  if (isHalfEvent(label)) return { eventKey: "Half", titleCn: "\u534A\u7A0B\u9A6C\u62C9\u677E", titleEn: "Half Marathon" };
  if (isFullEvent(label)) return { eventKey: "Full", titleCn: "\u9A6C\u62C9\u677E", titleEn: "Marathon" };
  return { eventKey: label.toLowerCase(), titleCn: label, titleEn: label };
}
export {
  isFullEvent,
  isHalfEvent,
  resolveEventDisplay,
  toEventKey
};
