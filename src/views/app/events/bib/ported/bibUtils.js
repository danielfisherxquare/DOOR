function normalizeZone(raw) {
  return String(raw ?? "").trim().toUpperCase() || "\u672A\u5206\u533A";
}
export {
  normalizeZone
};
