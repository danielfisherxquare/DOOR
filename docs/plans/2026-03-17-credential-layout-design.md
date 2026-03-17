# 证件模块 - 升级方案（v3 · 职责分工版）

## 一、用户明确的分工原则

| 端 | 职责范围 | 关键词 |
|---|---------|--------|
| **DOOR (Web)** | 需求定义 → 领取管理 → 扫描核验 | 多少区域、多少岗位、多少证件；领取登记；扫码验证 |
| **TOOL (Electron)** | 排版编辑 → 地图框选 → 批量生成 | 类似号码布排版；地图截图嵌入；PDF 批量导出 |

## 二、现有组件归属审计

### DOOR 端现有 (6 页面 + API) — ✅ 基本正确

| 文件 | 归属 | 状态 |
|------|------|------|
| `CredentialZonePage.jsx` | ✅ DOOR (需求定义) | 通行区域 CRUD |
| `CredentialRolePage.jsx` | ✅ DOOR (需求定义) | 证件类别/岗位 CRUD |
| `CredentialApplicationPage.jsx` | ✅ DOOR (需求定义) | 证件申请管理 |
| `CredentialReviewPage.jsx` | ✅ DOOR (需求定义) | 审核流程 |
| `CredentialStylePage.jsx` | ⚠️ 职责重叠 | 模板管理 — 与 TOOL 端排版器功能重叠 |
| `ScanHome/ScanResult.jsx` | ✅ DOOR (扫描) | 已有扫码入口 |
| `credential.js` (API) | ✅ DOOR | 后端 API 封装 |

### TOOL 端现有 (6 文件 + Worker) — 需调整

| 文件 | 归属 | 状态 |
|------|------|------|
| `CredentialLayoutView.tsx` | ✅ TOOL (排版编辑) | 排版器，需增强渲染 |
| `CredentialGenerateView.tsx` | ✅ TOOL (批量生成) | 批量导出，需对接 Worker |
| `CredentialZoneMap.tsx` | ✅ TOOL (地图框选) | Leaflet 地图，需改造为取景器 |
| `CredentialScanView.tsx` | ❌ **放错端** | 扫码应留在 DOOR 端进行，TOOL 端不需要 |
| `credentialExportWorker.cjs` | ✅ TOOL (批量生成) | Worker 已完整实现 |
| `credentialLayoutService.cjs` | ✅ TOOL (Electron) | IPC 服务已完整实现 |

## 三、需要做的结构调整

### 调整 1: TOOL 端删除 `CredentialScanView.tsx`

扫码核验是 DOOR 端的职责。DOOR 端已有完整的 `ScanHome.jsx` → `ScanResult.jsx` 扫码链路。TOOL 端的 `CredentialScanView.tsx` 是多余的重复实现，应删除，并从路由/侧边栏中移除入口。

### 调整 2: DOOR 端 `CredentialStylePage.jsx` 降级为"查看器"

模板的**详细排版编辑**是 TOOL 端的职责。DOOR 端的 `CredentialStylePage` 应保留模板的基本 CRUD（名称、编码、尺寸、状态），但不需要自带排版画布预览。可以保留只读预览，让用户知道模板长什么样，但编辑操作引导到 TOOL 端。

### 调整 3: DOOR 端 `ScanResult.jsx` 增加证件类型支持

现有的 `ScanResult.jsx` 只处理号码布扫码（`bibTrackingApi.resolveScan`）。需要增加对证件 QR Token 的识别和验证逻辑（调用 `credentialApi.resolveCredential`），实现"扫一个码 → 自动分辨是号码布还是证件 → 显示对应结果"。

### 调整 4: DOOR 端增加"领取管理"功能

在 `CredentialApplicationPage.jsx` 或新建 `CredentialIssuePage.jsx` 中增加证件领取登记功能：
- 列出所有已生成的证件
- 扫码或手动输入标记为"已领取"
- 记录领取人、领取时间

### 调整 5: TOOL 端排版器增强（原有的 3 个缺口）

保持不变：底板导入 + 真实渲染预览 + 地图取景截图。

## 四、最终组件架构

```
DOOR (Web 管理端)
├── 需求定义
│   ├── CredentialZonePage     — 通行区域管理
│   ├── CredentialRolePage     — 证件类别/岗位管理  
│   ├── CredentialApplicationPage — 证件申请 + 审核
│   └── CredentialReviewPage   — 审核详情
├── 领取管理
│   ├── CredentialStylePage    — 模板查看（只读预览）
│   └── CredentialIssuePage    — 领取登记（新增或合并）
└── 扫描核验
    ├── ScanHome               — 扫码入口（增加证件类型支持）
    └── ScanResult             — 核验结果（增加证件类型支持）

TOOL (Electron 客户端)
├── 排版编辑
│   └── CredentialLayoutView   — 排版器（增强：底板+渲染+地图）
├── 地图框选
│   ├── CredentialZoneMap      — 改造为取景器
│   └── MapSnapshotPicker      — 新增弹窗组件
├── 批量生成
│   ├── CredentialGenerateView — 批量导出 UI
│   ├── credentialExportWorker — PDF 渲染 Worker（已完成）
│   └── credentialLayoutService — Electron IPC 服务（已完成）
└── [删除] CredentialScanView  — 扫码不属于 TOOL
```
