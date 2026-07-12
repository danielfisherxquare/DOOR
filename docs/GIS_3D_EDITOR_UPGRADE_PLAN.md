# GIS 地图 + 3D Studio 提升方案对比（C vs A）

> 整理时间：2026-06-15
> 状态：**决策文档**——给出方案 C 与方案 A 的范围/改动文件/工作量/风险，供拍板。拍板后再出该方案的详细实施计划（遵循"先计划后写码"）。

---

## 0. 一句话结论

赛事现场本质是**一块固定 bbox**，不需要全球 3D 球。把"卫星影像 + 地形 + 真实/白模建筑"对这块区域**一次性烘焙成底图**，让已有的 Studio 实体编辑器直接在这张底图上搭——这条（方案 C）同时干掉根因 1/3/4 并绕开根因 2，且**后端管线大半已存在**，是性价比最高的一条。方案 A（在 Cesium 上加编辑）能浏览全世界，但自造编辑器成本高、且仍受 ion/外网可达性制约。

---

## 1. 背景：实测确认的问题（2026-06-15 全栈跑通后复现）

| 场景 | 实测结果 |
|---|---|
| 2D 平面 | ✅ 正常 |
| 3D 球 + Esri 卫星 + OSM 白模 | ✅ 白模真贴在卫星上（楼脚与影像有可见但不大的偏移） |
| 3D 球 + Google 真实 3D | ✅ 成都真出实景 mesh（`tile.googleapis.com` 650 请求全 200，仅黄昏光照偏暗） |
| 3D Studio 场地白模 | ✅ 完整 SketchUp 式建模，但**灰盒无卫星无地理** |

**功能大多能跑通，"达不到预期"来自四条根因：**

1. **全链路单点吊在一个个人 Cesium ion token**：白模=ion 资产 96188、地形=资产 1、Google 真实 3D 也经 ion，token 在请求 URL 和源码 `src/components/map/MapView3D.tsx:1675` 明文。配额/网络/GFW/过期任一发生即整体白屏——"总是有问题"的本质是**间歇性**。SPOF + 泄露。
2. **坐标系硬二选一**：`src/components/map/MapControls.tsx` 的 `filterSourcesByViewMode` 对 3D 球过滤掉所有非 WGS84 图源（注释"GCJ02会有坐标偏移"）。→ 白模视图只能用国内有偏移的 Esri，用不了高德；高德 GCJ 高清影像只在独立封闭的「高德三维」(AMap) 路里，那条路没有 Cesium 地形/编辑。**高德底图 + 3D 白模 + 可编辑三者结构性不可兼得**。（高德按独立封闭 track 处理，不在本方案合并范围内。）
3. **查看器 ≠ 编辑器**：地图上只能画 GeoJSON + 放预制 GLB，不能把帐篷/舞台/围挡当 3D 实体搭；真编辑要去灰盒 Studio。
4. **后端有代理却没复用**：Overpass 等仍浏览器直连 + 一堆退避；后端已有 `server/src/modules/inventory/inventory.spatial.osm.service.js` 等管线，实时地图没走。

---

## 2. 横切修复（两条方案都要做，先做）

无论选 C 还是 A，这两件是地基，单独立项最先做：

### 2.1 ion token → 服务端代理（解决根因 1：SPOF + 泄露）
- 新增后端路由 `server/src/modules/.../map-tiles.routes.js`：服务端持有 ion token（放 `server/.env`，不进前端包），代理 `assets.ion.cesium.com` / `api.cesium.com` / `tile.googleapis.com` 的瓦片与 endpoint 鉴权。
- 前端 `MapView3D.tsx` 把 `Cesium.Ion.defaultAccessToken` 改为走自有代理域，删除源码里硬编码 token（`:1675`）。
- 估时 **1–1.5 天**。

### 2.2 按赛事缓存底图/地形/建筑（解决根因 1 的间歇性 + 根因 4）
- 复用已有瓦片缓存层 `src/utils/map/tileCacheService.ts` + `serviceWorkerManager.ts`，把"赛事重点区"瓦片落盘；Overpass 改走后端 `inventory.spatial.osm.service.js`。
- 估时 **1.5–2 天**。

> 横切小计 **3–4 天**。下面 C/A 的工作量均不含这部分。

---

## 3. 方案 C：场地模式统一编辑器（推荐）

### 3.1 目标形态
选一块赛事 bbox → 后端把该区域**烘焙**成「正射卫星贴图 + 地形高程网格 + 建筑（白模/可选真实 mesh）」一个场景包 → Studio 加载这个包作**底图层**，用户用现有 Sketch/Push-Pull/Move/Rotate 把帐篷/舞台/围挡当 3D 实体直接在卫星地形上搭，导出/发布。

### 3.2 架构与复用（关键：后端大半已存在）
**可直接复用：**
- 后端：`inventory.spatial.terrain.service.js`（地形采样）、`inventory.spatial.osm.service.js`（建筑 footprint）、`inventory.spatial.generated-scene.service.js`（`buildGeneratedSceneStudioSnapshot` 已带 **geoAnchor**、`importGeneratedSceneToStudio`）、`inventory.spatial.scene-job.service.js`（异步导出任务队列）、`inventory.spatial.export.js`（GLB 构建）、`inventory.spatial.studio-export.js`。
- 前端：整套 `src/3d-studio/*` 编辑器、`src/utils/map/focusZoneStudioScene.js`（焦点区→场景，含地形 patch + OSM 白模→可编辑 mesh，已是雏形）、`focusZoneTerrainPatch.js`、`focusZoneOsmBuildings.js`、`model/editorDocument.js`、`PascalViewer.jsx`、`renderers/GeometryRenderer.jsx`。

**需新建/补齐（这是真正的工作量）：**
- **C-1 正射卫星贴图烘焙**（新）：后端按 bbox 拉卫星瓦片→拼接→（如用高德则 GCJ→WGS 或统一到本地 ENU）→输出一张正射底图 PNG + 地理对齐参数。落在 `inventory.spatial.terrain.service.js` 旁新增 `inventory.spatial.orthophoto.service.js`。**2–3 天**。
- **C-2 Studio 底图层渲染**（新）：在 `PascalViewer.jsx` / `GeometryRenderer.jsx` 增加"卫星贴图 drape 到地形网格 + 建筑 mesh 背景层"，让灰盒变成卫星+地形+建筑。**3–4 天**。
- **C-3 打通"地图选区→烘焙→Studio 打开"一键流**（连通）：现有 `importGeneratedSceneToStudio` + `focusZoneStudioScene` 串起来，去掉一次性 stale（场景包带版本号，源变化时提示重烘焙）。**2–3 天**。
- **C-4 大场景不再退化 2D**（修）：`src/3d-studio/App.jsx:489` 的 `solidCount>120||vertexCount>1500` 退化阈值——建筑背景层改用 instancing/LOD 渲染，把"可编辑实体"与"只读建筑背景"分开计数，背景多也不触发退化。**2–3 天**。
- **C-5 赛事资产落位**（增）：把地图侧已有的语义对象（帐篷/舞台/赛事拱门/围栏…见 MapFeaturePanel 模板）接到 Studio 资产库，支持拖入+吸附地形。**2–3 天**。

### 3.3 阶段与工作量
- P0 横切修复（§2）：3–4 天
- P1 烘焙管线 C-1 + C-3：4–6 天
- P2 Studio 底图层 C-2 + 退化修复 C-4：5–7 天
- P3 资产落位 C-5 + 打磨：3–4 天
- **合计约 4–5 周**（单人）。

### 3.4 风险
- 影像版权/ToS：缓存与 drape 卫星瓦片需确认 Esri/高德 授权范围（自有天地图 key 或商用授权最稳）。
- 地形与影像配准精度：bbox 烘焙时 datum 统一要做对，否则楼/影像/地形三者错层。
- 真实 3D mesh（Google）在场地模式下的离线化困难——P1 先只做白模，真实 mesh 作为"在线增强"可选项。

### 3.5 验收
固定一个赛事 bbox，断网情况下仍能打开"卫星+地形+白模"底图并在其上搭建至少 50 个实体不退化 2D；ion token 不出现在前端包与网络明文里。

---

## 4. 方案 A：Cesium 上加编辑能力

### 4.1 目标形态
保留全球 3D 球，在 `MapView3D.tsx` 上加"编辑模式"：屏幕绘制多边形→拉伸白模、放置/移动/旋转 georeferenced glTF 赛事资产、吸附。Studio 降级为"单资产精细建模器"，产出 GLB 回贴地图。

### 4.2 架构与复用
**可复用：** 现有 `MapView3D.tsx` 的 Cesium viewer、卫星/地形/白模加载、`ModelManager`/`ModelEditor`（GLB 放置）、`spatialObjects.ts`、`geojsonExchange.ts`。
**需新建：**
- **A-1 Cesium 编辑交互层**（新，最重）：基于 `ScreenSpaceEventHandler` 自造绘制、拉伸、3D 移动/旋转 gizmo、吸附——Cesium 无内置编辑器，georeferenced gizmo 与捕捉是硬骨头。**8–12 天**。
- **A-2 footprint→拉伸白模 primitive**（新）：绘制面→`GeometryInstance`/`ClassificationPrimitive` 拉伸。**3–4 天**。
- **A-3 Studio→单资产 GLB 导出→地图资产库**（连通）：复用 `studio-export`，加资产→地图回贴。**2–3 天**。
- **A-4 把 104KB 的 `MapView3D.tsx` 拆分**（重构，前置）：否则在其上加编辑层会失控。**3–5 天**。

### 4.3 阶段与工作量
- P0 横切修复（§2）：3–4 天
- P1 拆分 A-4：3–5 天
- P2 编辑交互 A-1 + A-2：11–16 天
- P3 资产回贴 A-3 + 打磨：3–4 天
- **合计约 5–7 周**（单人），且 A-1 技术不确定性最高。

### 4.4 风险
- 自造 Cesium 编辑器（gizmo/吸附/拉伸）工程量与坑都大，易做成"半成品编辑器"。
- 仍受 ion/外网可达性制约：场地在弱网/无 Google 可达时，真实 3D 仍可能空。
- `MapView3D.tsx` 已是 104KB 巨型单文件，承载编辑层前必须重构，牵一发动全身。

### 4.5 验收
3D 球任意城市进入编辑模式，绘制并拉伸白模、放置并旋转 3 类赛事资产、保存复现一致。

---

## 5. 对比矩阵

| 维度 | 方案 C（场地模式统一编辑器） | 方案 A（Cesium 加编辑） |
|---|---|---|
| 是否解决"在卫星地图上**编辑**" | ✅ 直接命中 | ✅ 命中 |
| 解决根因 1（ion SPOF） | ✅（横切 + 烘焙后可离线） | ◻️ 仅横切缓解，仍在线依赖 |
| 解决根因 2（坐标二选一） | ✅ 烘焙时统一坐标，可用高德影像 | ❌ 仍受 3D 球 WGS84 限制 |
| 解决根因 3（能编辑实体） | ✅ 复用现成 Studio 编辑器 | ⚠️ 需自造 Cesium 编辑器 |
| 解决根因 4（后端管线复用） | ✅ 大半已存在 | ◻️ 部分 |
| 弱网/现场可用性 | ✅ 烘焙后可离线 | ❌ 依赖外网 |
| 浏览全世界任意点 | ❌（按 bbox） | ✅ |
| 真实 3D 建筑（Google） | ⚠️ 在线增强、离线难 | ✅ 在线 |
| 自造工程量/不确定性 | 中（多为连通已有件） | 高（编辑器从零 + 拆巨型文件） |
| 估时（含横切） | ~4–5 周 | ~5–7 周 |

---

## 6. 推荐

**先做 §2 横切修复（3–4 天，立即见效、零架构风险），再走方案 C。** 理由：C 直接命中"赛事现场快速搭建"的真实场景（固定 bbox、要可离线、要能编辑实体），且后端管线大半已存在，是"连通 + 补两块渲染"而非"造新编辑器"。方案 A 的全球浏览能力对赛事搭建不是刚需，却要付自造 Cesium 编辑器的高成本。

若仍需"浏览全世界 + 真实 3D"作为展示型能力，可在 C 落地后，把现有 `MapView3D` 3D 球保留为**只读展示/选区入口**，不在其上自造编辑器——两者职责清晰。

---

## 7. 待确认

1. 选 **C** / **A** / **仅横切修复**？
2. 卫星影像来源与授权：天地图（需 key，国内合规）/ 高德 / Esri？影响 C-1 烘焙与缓存合规。
3. 真实 3D 建筑（Google）是"加分项"还是"必须项"？影响 C 是否要做在线增强。
