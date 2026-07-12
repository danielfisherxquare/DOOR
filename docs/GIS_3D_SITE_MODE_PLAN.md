# 场地模式统一编辑器 — 执行计划（方案 C）

> 整理时间：2026-06-15
> 状态：**核心链路已实施，剩余生产化验收项待完成**。对比与选型见 `docs/GIS_3D_EDITOR_UPGRADE_PLAN.md`。
> 决策约束：保留 ion token；不做 Google 真实建筑（只做 Cesium OSM 白模）；独立 3D 工作室不删不改，以 opt-in 方式复用其编辑引擎。

## 当前实现快照（2026-07-12）

- 后端入口：`POST /api/app/3d-studio/site-bake`，校验 WGS84 bbox 后同步组装地形、OSM 白模和 Esri 正射瓦片。
- 前端入口：地图选区点击“生成卫星场地”，跳转 `/app/3d-studio/site?bbox=...`。
- 离线缓存：`src/utils/map/siteBakeCache.js` 按 bbox 和图源缓存烘焙结果。
- 渲染层：`SiteBackdrop.jsx` 把卫星影像铺到地形网格，并把 OSM 建筑作为只读背景层。
- 自动验证：`npm test` 覆盖 bbox、缓存键、场地底图和标准 Studio 回归；后端纯逻辑测试位于 `server/tests/spatial-*.test.js`。

尚未完成：异步任务队列、场景源版本/哈希、50 实体浏览器 E2E、影像授权确认，以及带测试 PostgreSQL 的后端全量集成测试。

---

## 1. 概述

**问题**：地图能看不能编、Studio 能编看不到卫星——两个割裂世界，凑不出"在卫星地图上搭赛事现场"。

**目标**：在 GIS 地图选一块赛事 bbox →（后端烘焙卫星+地形+白模）→ 进入**场地模式编辑器**，在卫星地形底图上用现成的 Sketch/Push-Pull/Move/Rotate 把帐篷/舞台/围挡当 3D 实体直接搭建、保存、导出。

**非目标**：
- 不做全球 3D 球编辑（保留现 `MapView3D` 作只读浏览/选区入口）。
- 不做 Google 真实 3D 建筑。
- 不改动独立 3D 工作室 `/app/3d-studio` 的现有项目流程（warehouse/asset/venue/site）。
- 不替换 ion token，不做 ion 服务端代理。

**成功标准**：
1. 从 GIS 地图框选 bbox，一键生成"卫星正射底图 + 地形 + 白模"场景包并进入编辑器。
2. 编辑器底图是真实卫星+地形+白模（不再是灰盒），白模/影像/地形三者坐标一致、无错层。
3. 在其上搭建 ≥50 个实体不退化为静态 2D。
4. 标准 studio `/app/3d-studio` 行为完全不受影响（回归通过）。

---

## 2. 架构

```
GIS 地图(选区) ──bbox──▶ 后端烘焙服务 ──场景包──▶ 场地模式编辑器(复用 Studio 引擎)
  MapView2D/3D            orthophoto+terrain+osm        Studio3DApp(siteBackdrop)
  (已有选区/focusZone)     (terrain/osm service 已有     (PascalViewer 加底图层,
                          + 新增 orthophoto 烘焙)        GeometryRenderer 渲建筑只读层)
```

**复用（已存在）**
- 后端：`inventory.spatial.terrain.service.js`（地形）、`inventory.spatial.osm.service.js`（白模 footprint）、`inventory.spatial.generated-scene.service.js`（`buildGeneratedSceneStudioSnapshot` 带 geoAnchor、`importGeneratedSceneToStudio`）、`inventory.spatial.scene-job.service.js`（异步任务队列）、`inventory.spatial.export.js`（GLB）。
- 前端：`src/3d-studio/*`（编辑引擎 `Studio3DApp`/`PascalViewer`/`GeometryRenderer`/`editorDocument`）、`src/utils/map/focusZoneStudioScene.js`、`focusZoneTerrainPatch.js`、`focusZoneOsmBuildings.js`。

**新建/改造**
- 后端：`inventory.spatial.orthophoto.service.js`（新，bbox→正射卫星底图 PNG + 对齐参数）。
- 前端：`PascalViewer.jsx` 加 `siteBackdrop` 渲染（地形贴正射纹理 + 建筑只读层）；`Studio3DApp` 加 `siteBackdrop` prop（缺省不变）；GIS 地图加"框选→烘焙→打开场地模式"入口。

**坐标策略**：影像用 Esri/ion 的 WGS84 影像，与 Cesium 白模(WGS84)、Cesium 地形(WGS84)同坐标系，bbox 内统一转本地 ENU 米制（沿用 `focusZoneStudioScene` 现有 origin 逻辑）→ 三者天然对齐，避开 GCJ。

---

## 3. 阶段与任务（每个任务 2–8h）

### P1：后端烘焙管线（约 5–7 天）
- [ ] T1.1 新建 `inventory.spatial.orthophoto.service.js`：给定 bbox + zoom，拉 Esri/ion 卫星瓦片→拼接为单张正射 PNG，输出图片 + bbox 对齐参数。(6h)
- [ ] T1.2 复用 `terrain.service` 为 bbox 采样地形高程网格，与正射图同 bbox 对齐。(4h)
- [ ] T1.3 复用 `osm.service` 取 bbox 内建筑 footprint→高度，产出白模 solids（沿用 `focusZoneOsmBuildings` 过滤规则）。(4h)
- [ ] T1.4 在 `generated-scene.service` 增 `buildSiteScenePackage(bbox)`：组装 {orthophoto, terrain, buildings, geoAnchor} 一个场景包，挂到 `scene-job` 异步队列。(6h)
- [ ] T1.5 路由 + 鉴权：`POST /api/app/spatial/site-bake`（建任务）、`GET .../site-bake/:jobId`（查状态/取包），走现有 `requirePermission('app','3d_studio')`。(4h)
- [ ] T1.6 后端单测：bbox→包结构、坐标对齐、空覆盖兜底。(4h)

### P2：场地模式编辑器底图层（约 5–7 天）
- [ ] T2.1 `Studio3DApp` 加 `siteBackdrop` prop（{orthophotoUrl, terrain, buildings, geoAnchor}）；缺省 null 时行为与今天完全一致。(3h)
- [ ] T2.2 `PascalViewer.jsx` 在 siteBackdrop 下，把地形 mesh 材质换成正射纹理（UV 映射到 bbox），替代灰底网格。(6h)
- [ ] T2.3 `GeometryRenderer.jsx` 增"建筑只读层"：白模用 InstancedMesh 渲染，与可编辑实体分离、不计入选择。(6h)
- [ ] T2.4 修退化阈值（`App.jsx:489`）：`useLightweightViewer` 只数**可编辑实体**，建筑背景走 instancing 不触发静态 2D 退化。(4h)
- [ ] T2.5 相机/光照：进入时 fit 到 bbox，日间光照（修掉黄昏偏暗）。(3h)
- [ ] T2.6 前端测试：siteBackdrop 缺省回归 + 加载场景包渲染快照。(4h)

### P3：打通入口与赛事资产（约 3–5 天）
- [ ] T3.1 GIS 地图加"框选区域→生成场地模型"按钮（复用现有矩形绘制 + bbox），调用 site-bake，轮询完成后跳场地模式。(6h)
- [ ] T3.2 场景包带版本号/源哈希；源数据变化时在编辑器提示"可重新烘焙"（替代当前一次性 stale）。(4h)
- [ ] T3.3 赛事资产：把地图侧语义对象（帐篷/舞台/赛事拱门/围栏…）接入 Studio 资产库，支持拖入 + 吸附地形。(6h)
- [ ] T3.4 保存/导出：复用 `studio-export`/`export.js` 输出场景（含底图引用）。(4h)

### P4（可选，按需）：现场离线与影像升级
- [ ] T4.1 场景包随赛事缓存（`tileCacheService`），弱网/无网可打开。(1–2 天)
- [ ] T4.2 接天地图影像源（需用户给 key），GCJ→WGS 烘焙，提升国内影像质量。(1 天)

**主线合计约 3–4 周（P1–P3）。** P4 视现场需求再排。

---

## 4. 风险与应对
| 风险 | 应对 |
|---|---|
| 卫星瓦片缓存/拼接的版权与 ToS | 默认仅运行时烘焙不长期存储；长期缓存前确认 Esri/ion 或天地图授权 |
| 影像/地形/白模配准错层 | bbox 内统一本地 ENU，三者同源 WGS84；T1.6 加配准断言 |
| 改 PascalViewer 影响标准 studio | siteBackdrop 缺省关闭；P2 每步带"缺省回归"测试 |
| 白模在小场地无 OSM 覆盖 | 兜底：允许手绘 footprint→拉伸补白模；空覆盖给明确提示 |
| ion 配额/网络抖动 | 用户接受现状；P4.1 缓存可进一步缓解 |

## 5. 测试策略
- 后端：单测烘焙包结构与坐标对齐；集成测 site-bake 任务全流程。
- 前端：siteBackdrop 缺省回归（保护标准 studio）+ 场景包渲染快照 + 50 实体不退化。
- E2E：地图框选→烘焙→编辑器底图正确→搭建→保存→重开一致。

## 6. 验收门槛
§1 成功标准 1–4 全过，且标准 studio 回归无差异。

---

## 7. 待审批
确认本计划即开始 **P1-T1.1**。如对影像源（Esri/ion vs 天地图）、bbox 上限、资产清单有偏好，请在批准时一并指出。
