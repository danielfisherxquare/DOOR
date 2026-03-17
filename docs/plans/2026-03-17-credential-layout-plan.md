# 证件排版与生成系统实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标:** 实现一个完整的证件管理与排版生成系统，允许用户定义证件需求并可以在本地排版工具内交互式地获取地图区域进行批量 PDF 证件导出。

**整体架构:** DOOR 端负责业务逻辑（比如定义区域、岗位配置以及人员关联）。TOOL 端运行本地重负载的 PDF 图层合并、导出以及地图组件交互。

**技术栈:** React, PDF.js, maplibre-gl, 纯前端 canvas 渲染。

---

### 任务 1: 升级 TOOL 端现有的证件排版界面架构

**涉及文件:**
- 修改: `tool/src/components/credential/CredentialLayoutView.tsx`
- 修改: `tool/src/components/credential/CredentialGenerateView.tsx` 

**步骤 1: 升级排版视图**
修改现有的 `CredentialLayoutView.tsx` 页面组件框架。添加对 `mapImage` 的处理以及完善正反面布局切换的属性绑定。

**步骤 2: 整理数据结构**
完善 `tool/src/types/credentialLayout.ts` 中针对证件特有的定义（确保有区域、岗位、授权类别等专属字段）。

### 任务 2: TOOL 端的业务数据拉取 (接口对接)

**涉及文件:**
- 修改: `tool/src/services/phase6Api.ts` (或者新建 `credentialApi.ts`).
- 新增: `tool/src/types/credentialLayout.ts`

**步骤 1: 封装网络服务绑定**
实现获取 DOOR 端的 `CredentialRequirement` 列表以及 `CredentialRecord` 数据的网络调用，包含下载远端模板定义。用于提供批量生成的“套打”数据源。

### 任务 3: 交互式地图截图模块集成 (TOOL)

**涉及文件:**
- 新增: `tool/src/components/credential/MapSnapshotPicker.tsx`
- 修改: `tool/src/components/credential/CredentialLayoutView.tsx`
- 修改: `tool/src/components/credential/credentialLayoutPreview.ts`

**步骤 1: 编写地图取景器组件**
使用 Maplibre (或者复用项目里的 MapGl 底层) 开发一个可以由用户拖动、缩放的弹窗式取景器模块。提供 "保存此画面" 功能，能够将当前的 Map canvas 直接生成为一张 base64 / blob 静态高清图片返回给排版器。

**步骤 2: 合成到排版字段**
在 `CredentialLayoutView.tsx` 中增加 `mapImage` 这种字段类型，用户点击这类型图层时，可吊起上一步的弹窗截取当前证件所需的专用小地图贴图。

### 任务 4: 排版画布的底层渲染逻辑克隆 (TOOL)

**涉及文件:**
- 新增: `tool/src/components/credential/credentialLayoutPreview.ts`

**步骤 1: 文本、二维码与图片的渲染**
把 `bibLayoutPreview.ts` 中的预览绘图算法移植一套过来，并且加入解析 `mapImage` 的算法支持。支持通过坐标比例 `xRatio, yRatio, widthRatio, heightRatio` 精确还原在底图各个位置绘制名字、区域与地图贴图的能力。

### 任务 5: PDF 批量导出与组装 (TOOL)

**涉及文件:**
- 新增/修改: `tool/src/main/workers/credentialExportWorker.ts` (独立或者在现有 bibExportWorker.ts 中支持新类型)
- 修改: `tool/src/components/credential/CredentialExecution.tsx`

**步骤 1: 合并及分发**
对接 Electron 现有的工作池（Worker Thread），将前面从 DOOR 取来的数据流循环映射到用户设定好的布局。每一条数据分别生成“正面页”和“反面页”（或拼版），生成一整捆高清并适配印刷工厂要求的 PDF 原始文件（如每批次 50M 大小以防内存溢出）。

--- 

### 任务 6: DOOR 端的逻辑与取证页面补充 (DOOR)

**涉及文件:**
- 修改: `door/src/views/admin/credential/CredentialZonePage.jsx`
- 修改: `door/src/views/admin/credential/CredentialApplicationPage.jsx`
- 修改: `door/src/views/scan/ScanResult.jsx`

**步骤 1: 证件的核验链路**
修改 `ScanResult.jsx` 代码，如果扫码得到的是一个 credential token，需要与号段扫物逻辑分开，提示出 “证件发放成功” 或者 “该区域不被允许进入” 等扫描返回结果。

**步骤 2: 数据互联**
梳理好 DOOR 端的 `ApplicationPage` 和数据库，确保工具客户端获取模板配置等逻辑链路无懈可击。
