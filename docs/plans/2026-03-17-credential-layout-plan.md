# 证件排版与生成系统 - 实施计划（v3 · 职责分工版）

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 按照 DOOR=需求+领取+扫描、TOOL=排版+框选+批量生成 的分工，调整现有组件结构并补齐功能缺口。

**Tech Stack:** React, Canvas 2D, pdfjs-dist, qr-code-styling, Leaflet, html2canvas, Electron Worker

---

### Task 1: TOOL 端清理 — 删除 CredentialScanView

**Files:**
- 删除: `tool/src/components/credential/CredentialScanView.tsx`
- 修改: TOOL 端路由/侧边栏（移除扫码入口）

**变更内容:**
1. 删除 `CredentialScanView.tsx`（576 行）
2. 从路由配置和侧边栏菜单中移除"证件扫码"入口
3. 扫码功能完全由 DOOR 端 `ScanHome` → `ScanResult` 承担

**验证:** TOOL 端侧边栏不再出现"扫码"入口，其他证件功能正常。

---

### Task 2: DOOR 端扫描链路 — ScanResult 增加证件识别

**Files:**
- 修改: `door/src/views/scan/ScanResult.jsx`
- 修改: `door/src/api/credential.js`（已有 `resolveCredential`）

**变更内容:**
1. 在 `ScanResult.jsx` 中，扫码解析时增加逻辑：
   - 先尝试 `bibTrackingApi.resolveScan(token)` 解析号码布
   - 如果返回 not_found，再尝试 `credentialApi.resolveCredential(token)` 解析证件
2. 根据解析结果类型渲染不同的结果卡片：
   - 号码布：显示现有的号码布信息
   - 证件：显示证件编号、类别、姓名、可通行区域列表、状态

**验证:** 在 DOOR 端扫码页面扫描一个证件 QR 码 → 显示证件信息卡片。

---

### Task 3: DOOR 端领取管理 — 增加证件发放功能

**Files:**
- 修改: `door/src/views/admin/credential/CredentialApplicationPage.jsx`（或新建 `CredentialIssuePage.jsx`）

**变更内容:**
1. 在已有的证件管理页面中增加"领取登记"Tab 或独立页面
2. 功能：列出所有已生成证件（status=generated/printed）→ 支持搜索/筛选 → 点击或扫码标记为"已领取" → 记录领取人和时间
3. 调用现有 API：`credentialApi.issueCredential(raceId, credentialId, data)`

**验证:** 管理员可以在 DOOR 端查看所有证件列表，点击"发放"按钮后状态变为"已领取"。

---

### Task 4: DOOR 端模板管理 — StylePage 降级为只读查看器

**Files:**
- 修改: `door/src/views/admin/credential/CredentialStylePage.jsx`

**变更内容:**
1. 保留模板列表、基本 CRUD（创建/重命名/删除/状态切换）
2. 移除或简化排版画布编辑功能（这是 TOOL 端的职责）
3. 替换为只读的布局预览 + 提示"请使用 TOOL 客户端进行排版编辑"
4. 保留模板尺寸、状态等元数据的编辑

**验证:** DOOR 端模板页面可以新建/删除模板、修改名称和状态，但排版编辑引导至 TOOL。

---

### Task 5: TOOL 端排版器 — 底板导入

**Files:**
- 修改: `tool/src/components/credential/CredentialLayoutView.tsx`

**变更内容:**
1. 增加"导入底板"按钮（正面/背面各一张底图）
2. 支持导入 PDF（`pdfjs-dist` 渲染首页）或 PNG/JPG 图片
3. 底板作为画布第一层绘制，字段叠加在其上

**验证:** 导入底板后画布显示底图，字段框覆盖在底图之上。

---

### Task 6: TOOL 端排版器 — 真实渲染预览

**Files:**
- 修改: `tool/src/components/credential/CredentialLayoutView.tsx`（`renderCanvas()` 函数）

**变更内容:**
1. 替换当前只画边框的逻辑，按字段类型分别绘制：
   - `text/hotline/serialNo` → 使用样例数据绘制真实文字
   - `rect (categoryColor)` → 绘制填充色块
   - `qr` → 绘制 QR 占位图案
   - `mapImage` → 绘制地图占位或已截取的图片
   - `accessLegend` → 绘制色块+名称列表
2. 增加内置样例数据 `sampleRow` 用于预览

**验证:** 添加字段后画布显示真实文字、色块、QR 图案，而非空框。

---

### Task 7: TOOL 端排版器 — 地图取景截图弹窗

**Files:**
- 新增: `tool/src/components/credential/MapSnapshotPicker.tsx`
- 修改: `tool/src/components/credential/CredentialLayoutView.tsx`

**变更内容:**
1. 新增 `MapSnapshotPicker` Modal 组件：内嵌 Leaflet 地图 + 通行区域叠加 + "捕获当前视图" 按钮
2. 在 `CredentialLayoutView` 属性面板中，`mapImage` 字段增加"设置地图视图"按钮
3. 截图后的 base64 缓存并在画布中实时渲染

**验证:** 在排版器中添加地图字段 → 点击"设置地图视图" → 弹出地图 → 截图 → 画布显示真实地图。

---

## 执行优先级与依赖

```
Task 1 (清理 TOOL 扫码) ──────────── 无依赖，可立即执行
Task 2 (DOOR 扫描链路) ──────────── 无依赖，可立即执行
Task 3 (DOOR 领取管理) ──────────── 无依赖，可立即执行
Task 4 (DOOR 模板查看器) ─────────── 无依赖，可立即执行
Task 5 (TOOL 底板导入) ──────────── 无依赖
Task 6 (TOOL 真实渲染) ──────────── 依赖 Task 5
Task 7 (TOOL 地图截图) ──────────── 依赖 Task 6
```

Task 1–4 可并行执行（跨 DOOR/TOOL 两端无耦合），Task 5–7 需按顺序执行。
