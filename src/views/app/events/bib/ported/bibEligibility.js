const BIB_ELIGIBLE_STATUS_LIST = ["\u4E2D\u7B7E", "\u5DF2\u4E2D\u7B7E", "\u76F4\u901A\u540D\u989D", "\u76F4\u901A"];
const BIB_ELIGIBLE_STATUSES = new Set(BIB_ELIGIBLE_STATUS_LIST);
function isBibEligibleStatus(statusRaw) {
  const status = String(statusRaw || "").trim();
  return BIB_ELIGIBLE_STATUSES.has(status);
}
export {
  BIB_ELIGIBLE_STATUSES,
  isBibEligibleStatus
};
