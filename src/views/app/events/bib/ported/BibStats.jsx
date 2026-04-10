import { jsx, jsxs } from "react/jsx-runtime";
function BibStats({ stats }) {
  const unassigned = Math.max(0, stats.eligible - stats.assigned);
  const cards = [
    { label: "\u603B\u62A5\u540D\u4EBA\u6570", value: stats.total.toLocaleString(), icon: "\u{1F465}", color: "#6366F1" },
    { label: "\u53EF\u53C2\u4E0E\u6392\u53F7", value: stats.eligible.toLocaleString(), icon: "\u2714", color: "#10B981" },
    { label: "\u5DF2\u5206\u914D\u53F7\u7801", value: stats.assigned.toLocaleString(), icon: "\u{1F397}", color: "#0EA5E9" },
    { label: "\u5F85\u5206\u914D", value: unassigned.toLocaleString(), icon: "\u{1F9FE}", color: "#F59E0B" }
  ];
  if (stats.tracking) {
    cards.push(
      { label: "\u5DF2\u6253\u5370", value: stats.tracking.receiptPrinted.toLocaleString(), icon: "\u{1F5A8}\uFE0F", color: "#4F46E5" },
      { label: "\u5DF2\u9886\u53D6", value: stats.tracking.pickedUp.toLocaleString(), icon: "\u{1F4E6}", color: "#0891B2" },
      { label: "\u5DF2\u68C0\u5F55", value: stats.tracking.checkedIn.toLocaleString(), icon: "\u2705", color: "#0F766E" },
      { label: "\u5DF2\u5B8C\u8D5B", value: stats.tracking.finished.toLocaleString(), icon: "\u{1F3C1}", color: "#B45309" }
    );
  }
  return /* @__PURE__ */ jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.875rem" }, children: cards.map((card) => /* @__PURE__ */ jsxs(
    "div",
    {
      className: "card bib-panel",
      style: {
        padding: "1rem 1.125rem",
        border: "1px solid var(--border)",
        borderRadius: 0,
        background: "var(--surface)"
      },
      children: [
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }, children: [
          /* @__PURE__ */ jsx("span", { style: { fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }, children: card.label }),
          /* @__PURE__ */ jsx("span", { style: { fontSize: 16 }, children: card.icon })
        ] }),
        /* @__PURE__ */ jsx("div", { style: { fontSize: 30, lineHeight: 1.1, fontWeight: 800, color: card.color }, children: card.value })
      ]
    },
    card.label
  )) });
}
export {
  BibStats as default
};
