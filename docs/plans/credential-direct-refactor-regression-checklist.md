# Credential Direct Refactor Regression Checklist

- 创建数字通行区域，验证非数字编码会被拒绝。
- 创建证件类别，并绑定多个默认通行区域。
- 通过自助申请提交一个请求，确认进入审核或自动通过流程。
- 通过管理员直建提交一个请求，确认可直接指定职务和通行编码列表。
- 审核请求时整体替换 `accessCodes` 列表，而不是做加减覆盖。
- 核对证件详情、发放、扫码、补发、作废和历史记录返回的新字段：`categoryName`、`categoryColor`、`jobTitle`、`accessAreas`。
- 验证 DOOR 管理端菜单和子页面都走 `/access-areas`、`/categories`、`/requests`、`/review`、`/styles`。
- 验证 TOOL 默认模板尺寸为 10cm x 14cm 纵向，并确认导出使用类别颜色和通行编码列表。
