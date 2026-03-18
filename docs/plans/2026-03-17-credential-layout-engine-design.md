# Credential Template Design (Layout Engine) Refactoring

## 核心目标
将 TOOL 端 `BibLayoutView`（号码布排版）的最新排版引擎和高级交互逻辑，移植/适配到 `CredentialLayoutView`（证件模板设计）中，同时完美兼容证件特有的业务逻辑（通行区域、证件类别颜色块、地图快照等）。

## 架构设计方案

目前的 `CredentialLayoutView.tsx` 已经包含了底板导入、坐标比例换算、基础字段渲染。但缺乏吸附对齐、多选、高级命令和高级 QR 组件。

我们将采用 **"模块化适配"** 的策略：

### 1. 复用基础交互机制 (Snap & Commands)
直接引入 `bibLayoutSnap.ts` 和 `bibLayoutCommands.ts`：
- 事件监听 `pointerdown`, `pointermove`, `pointerup` 全面对齐 `BibLayoutView`，支持 Shift/Ctrl/Cmd 多选。
- 在 `CredentialLayoutView` 内部集成 `<div className="toolbarLeft">` 排版命令按钮（左对齐、居中、等距分布等）。
- 引入 `applySnap` 函数，在拖拽和缩放时提供对齐辅助线，并更新状态 `snapGuides`。

### 2. 同步 DOOR 端数据 (Roles & Zones)
证件模板需要与业务数据强绑定。在 TOOL 端打开某个赛事的证件排版时，需要：
- 从后端拉取该赛事的 **证件类别 (Roles)**（包含类别名称、背景色 `bgColor` 等）。
- 从后端拉取该赛事的 **通行区域 (Zones)**（包含区域代码、名称、颜色等）。
- **样例数据生成**：在排版器中切换“样例数据”时，使用拉取到的真实类别和区域数据组合，生成具有真实感（包括正确的 `categoryColor` 和多行 `accessLegend`）的预览数据。

### 3. Canvas 渲染层重构 (`renderPage` / `renderCanvas`)
由于目前采用的底板可能是 PDF 或图片，我们将沿用 Canvas `renderPage` (处理 PDF) 和 `renderCanvas` (处理通用图/颜色层) 的混合模式。
关键是要重构 `CredentialLayoutView` 的字段绘制（`ctx.fillText`等）逻辑：
- 引入与导出 Worker 完全一致的文字排版算法（按比例换算、字体自适应 `autoFit`、绝对粗体判断、多行支持、垂直对齐计算 `verticalAlign`）。
- **特有字段渲染**：
  - `rect` (类别色块): 按照 `categoryColor` 画纯色矩形。
  - `accessLegend` (通行区域): 渲染多行带颜色的区块。
  - `mapImage` (地图快照): 渲染 Base64 图片，并维持原有的快照功能。
- **二维码组件**：引入 `qrCacheRef` 和 `QRCodeStyling` 的即时生成逻辑，应用在证件排版中。

### 4. 属性面板增强 (Field Props Panel)
- 为文字字段提供：对齐（水平、垂直）、边距 (paddingX, paddingY)、自适应缩放 (autoFit)。
- 若当前选中的是 `qrCode`，展示 `QrCodeSettingsPanel` 重用其高级配置项。
- 维持 `mapImage` 的特殊操作按钮。

## 执行阶段计划

执行阶段我们将通过以下步骤实施：

1. **核心交互重构**：更新 `CredentialLayoutView.tsx` 的 state (加入 `snapGuides`, `interactionMode`, 等)、将 `pointerMove` 等事件处理器升级为支持多选和 Snap 的版本。
2. **工具栏补充**：复制排版指令（Commands）工具栏到证件设计的顶部工具区。
3. **特有渲染适配与 QR 更新**：升级 `renderCanvas` 使得通用文字使用更精确的 layout 算法，且加入真实的二维码可视化预览，并在属性面板增加二维码设。
4. **清理沉余**：如果原逻辑有不再需要的依赖（简陋版拖动等），进行删除。

---
> 待确认：请查看本设计方案是否符合你的期望？如果通过，我们将基于该方案调用 `superpowers:writing-plans` 生成最终的任务拆解计划。
