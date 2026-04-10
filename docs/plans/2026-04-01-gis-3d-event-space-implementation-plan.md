# GIS + 3D 赛事空间实施计划

## 目标

基于 `door` 现有 GIS 与 3D Studio，逐批交付一套可编辑、可发布、可验证的赛事空间系统：

- 地图完成语义化空间布置
- 重点区域可截取地形进入 3D 工作台
- 山地场景可处理高差、坡度、贴地与找平
- 发布时支持全局低模与重点区高模的分级渲染

## 批次拆分

### Batch 1: 基础数据层与 API

目标：

- 建立 `event spatial object` 数据模型
- 建立 `terrain work zone` 数据模型
- 打通后端路由与前端 API client

实施项：

- 新增数据库表：
  - `inventory_3d_event_spatial_objects`
  - `inventory_3d_terrain_work_zones`
- 新增仓储与服务层
- 新增 `app/3d-studio` 路由
- 前端 `studioProjectApi` 接入

验证：

- 前端构建通过
- 后端模块可正常加载
- 路由定义无语法错误

### Batch 2: GIS 语义化编辑 MVP

目标：

- 地图支持创建和修改：
  - 帐篷
  - 舞台
  - 拱门
  - 灯光塔
  - 补给站
  - 围栏段

实施项：

- GIS 工具栏增加对象类型与模板选择
- 地图绘制结果回写为 `spatial object`
- MapFeaturePanel 支持对象属性编辑

验证：

- 2D/3D 地图能看到对象
- 创建、修改、删除闭环可用

### Batch 3: Terrain Work Zone

目标：

- GIS 框选区域，生成地形工作区
- 自动计算工作区原点与局部坐标基准

实施项：

- GIS 创建 `terrain work zone`
- 保存 clip polygon、origin、ENU transform、included objects
- 提供“进入 3D 工作台”入口

验证：

- 工作区可创建、查询、更新、删除
- 工作区能关联对象集合

### Batch 4: 局部 3D 工作台接地形

目标：

- 3D Studio 不再只依赖平地 `y=0`
- 支持载入 terrain patch 作为底面

实施项：

- 工作台底面从固定 plane 升级为 terrain patch
- 局部 ENU 坐标与 WGS84 双向转换
- 重点区编辑结果回写 GIS

验证：

- 局部地形可视
- 坡地对象能正确落地

### Batch 5: 模板、变体与品牌系统

目标：

- 帐篷/拱门/舞台支持模板参数化
- 支持门楣、篷布、赞助商等差异化

实施项：

- 模板参数 schema
- 品牌包与材质变体
- 几何复用 + 材质变体表达

验证：

- 同模板不同变体可同时展示
- 不复制大量独立 GLB

### Batch 6: 发布与 LOD

目标：

- 全局浏览稳定
- 重点区高精，长距离低精

实施项：

- Hero / Focus / Corridor / Cluster 四级 LOD
- 贴地白模代理
- 发布产物组织与缓存策略

验证：

- 大量帐篷场景可运行
- 低精不退化为 icon

## 当前批次交付标准

当前批次完成以下内容后，进入下一批：

- 空间对象表结构已落库
- 地形工作区表结构已落库
- API 已接入前后端
- 代码通过最小构建与加载验证

## 执行原则

- 每批必须可验证
- 每批必须不破坏现有 GIS / 3D Studio 主流程
- 优先补底层能力，再补 UI
- 高差场景按“贴地 / 找平 / 保持垂直”三种放置策略推进
