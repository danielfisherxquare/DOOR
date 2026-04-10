# DOOR WMS 3D 数字孪生实施设计

## 1. 文档目标

本文档用于替代此前偏概念化的 3D 仓储升级草案，改为面向实施的二阶段方案。

目标是让 DOOR 仓储模块在不打断现有批量入库、二维码打印、报表、盘点流程的前提下，逐步升级为可落地的 3D 仓储数字孪生系统。

配套实施计划见：

`door/docs/plans/2026-03-21-wms-digital-twin-phase1-implementation-plan.md`

阶段一回归清单见：

`door/docs/plans/wms-digital-twin-phase1-regression-checklist.md`

仓库设计器交互升级执行方案见：

`door/docs/plans/2026-03-23-wms-sims-style-warehouse-designer-plan.md`

---

## 2. 总体阶段划分

### 阶段一：3D 仓储基础版

阶段一只做能直接上线、直接支撑仓库日常作业的能力：

1. 多仓库 3D 参数化建模
2. 货架模板与货架实例管理
3. 货物 3D 规格管理
4. 库位二维码管理
5. 货物扫码绑定库位
6. 3D 仓库查看与基础占用可视化
7. 与现有 WMS 数据和页面兼容

阶段一不做：

1. A* 路径规划
2. ABC 智能上架推荐
3. 复杂空间仿真
4. CAD/BIM 导入
5. 独立 PDA App
6. 高精度不规则 3D 模型上传

### 阶段二：数字孪生增强版

阶段二在阶段一稳定后补齐增强能力：

1. 拣货路径规划
2. 智能库位推荐
3. 热区分析
4. 作业路径与事件联动
5. 仓库容量模拟与预警联动
6. 移动终端联动

---

## 3. 阶段一成功标准

阶段一验收时必须满足以下要求：

1. 能定义多个仓库，并维护每个仓库的长、宽、高。
2. 能定义多种货架模板，并在仓库中摆放多个货架实例。
3. 能定义货物的 3D 尺寸和形状，首版至少支持箱体、料箱、圆桶三种。
4. 能为库位生成二维码，并通过二维码识别库位。
5. 能通过扫描货物二维码和库位二维码完成绑定。
6. 绑定完成后，现有库存页面、打印页面、查询页面、报表页面仍可继续工作。
7. 能在 Web 后台用 3D 方式查看仓库、货架、库位和占用情况。

---

## 4. 阶段一业务范围

### 4.1 用户角色

阶段一面向以下用户：

1. 仓库管理员
2. 入库操作员
3. 库位维护人员
4. 超级管理员或机构管理员

### 4.2 核心使用场景

#### 场景 A：创建 3D 仓库

1. 创建仓库基础信息
2. 配置仓库长宽高
3. 配置区域、通道、出入口
4. 进入 3D 设计页查看仓库空间

#### 场景 B：搭建货架和库位

1. 创建货架模板
2. 在仓库中新增货架实例
3. 按模板批量生成库位
4. 为库位生成二维码并打印

#### 场景 C：配置货物规格

1. 定义货物形状模板
2. 配置默认尺寸、重量、堆叠规则
3. 入库时为货物实例关联规格

#### 场景 D：扫码绑定

1. 操作员先扫描库位二维码
2. 再扫描货物二维码
3. 系统校验能否放入该库位
4. 成功后更新绑定关系和库存位置
5. 3D 场景中高亮显示货物所在位置

#### 场景 E：移位

1. 扫描货物二维码
2. 扫描新库位二维码
3. 系统关闭旧绑定并创建新绑定
4. 记录事件日志

---

## 5. 技术原则

### 5.1 总体原则

1. 第一阶段必须兼容现有 `warehouses`、`warehouse_locations`、`org_inventory_units`。
2. 第一阶段必须采用参数化建模，不引入自由建模器。
3. 第一阶段必须优先保证数据一致性，再追求 3D 表现效果。
4. 第一阶段所有关键绑定动作都必须走服务端事务。
5. 第一阶段必须保留旧页面可回退能力。

### 5.2 前端技术选型

新增依赖：

1. `three`
2. `@react-three/fiber`
3. `@react-three/drei`

说明：

1. 只用于参数化 3D 场景渲染。
2. 不依赖 CAD、BIM 或 glTF 导入。
3. 保持现有 React + Vite 架构不变。

### 5.3 后端技术选型

保持现有：

1. Node.js
2. Express
3. Knex
4. PostgreSQL

阶段一不引入单独微服务，不拆分 inventory 模块。

---

## 6. 阶段一数据模型设计

阶段一采用“保留旧表 + 新增孪生表 + 双写兼容”的方式。

### 6.1 保留并继续使用的旧表

1. `warehouses`
2. `warehouse_locations`
3. `org_inventory_units`
4. `org_inventory_batches`
5. `inventory_transactions`

### 6.2 旧表扩展字段

#### `warehouses`

新增字段：

1. `dimensions_mm` JSONB
2. `origin` JSONB
3. `floor_count` integer default 1
4. `scene_version` integer default 1
5. `layout_json` JSONB nullable

字段约定：

```json
{
  "widthMm": 30000,
  "depthMm": 18000,
  "heightMm": 8000
}
```

#### `warehouse_locations`

新增字段：

1. `transform` JSONB
2. `dimensions_mm` JSONB
3. `max_weight_kg` numeric
4. `occupancy_mode` string
5. `rack_instance_code` string nullable
6. `slot_path` string nullable

兼容要求：

1. 继续保留 `code`、`zone`、`aisle`、`shelf`、`position`。
2. 旧页面仍使用这些字段读取。

#### `org_inventory_units`

新增字段：

1. `shape_template_code` string nullable
2. `dimensions_mm` JSONB nullable
3. `weight_kg` numeric nullable
4. `parent_unit_id` bigint nullable
5. `object_level` string default `unit`

说明：

1. 阶段一不直接废弃 `org_inventory_units`。
2. 单件级货物仍以它作为旧流程主表。
3. 新增字段只为兼容新孪生能力。

### 6.3 新增孪生表

#### `warehouse_zones`

用于表达仓库中的区域信息。

核心字段：

1. `id`
2. `org_id`
3. `warehouse_id`
4. `code`
5. `name`
6. `zone_type`，取值：`storage` `aisle` `buffer` `entry` `exit` `safety`
7. `transform`
8. `dimensions_mm`
9. `metadata`

#### `rack_templates`

用于定义货架模板。

核心字段：

1. `id`
2. `org_id`
3. `code`
4. `name`
5. `shape_type`
6. `outer_dimensions_mm`
7. `levels`
8. `bays`
9. `slots_per_level`
10. `max_load_kg`
11. `allowed_shape_types`
12. `slot_rule`

#### `rack_instances`

用于表达具体摆放在仓库中的货架。

核心字段：

1. `id`
2. `org_id`
3. `warehouse_id`
4. `template_id`
5. `code`
6. `name`
7. `transform`
8. `status`
9. `metadata`

#### `item_shape_templates`

用于定义货物形状模板。

核心字段：

1. `id`
2. `org_id`
3. `code`
4. `name`
5. `shape_type`，取值：`box` `bin` `drum` `custom_bbox`
6. `dimensions_mm`
7. `default_weight_kg`
8. `stackable`
9. `orientation_rules`

#### `inventory_objects`

用于表达新孪生模型中的货物对象。

核心字段：

1. `id`
2. `org_id`
3. `source_unit_id` nullable
4. `batch_id`
5. `object_code`
6. `object_level`，取值：`unit` `box` `pallet` `batch`
7. `shape_template_id`
8. `dimensions_mm`
9. `weight_kg`
10. `parent_object_id`
11. `current_warehouse_id`
12. `current_location_id`
13. `status`
14. `metadata`

兼容要求：

1. 单件对象必须和 `org_inventory_units` 一一映射。
2. 箱、托盘、批次对象可作为新能力存在，不影响旧流程。

#### `qr_entities`

统一二维码索引表。

核心字段：

1. `id`
2. `org_id`
3. `entity_type`，取值：`location` `inventory_object` `batch`
4. `entity_id`
5. `qr_code`
6. `status`
7. `payload_version`
8. `metadata`

约束：

1. `qr_code` 全局唯一。
2. 同一实体只能存在一个启用中的二维码。

#### `location_bindings`

记录货物与库位的绑定关系和历史。

核心字段：

1. `id`
2. `org_id`
3. `object_id`
4. `location_id`
5. `bound_at`
6. `unbound_at`
7. `operator_id`
8. `binding_mode`，取值：`scan` `manual` `system`
9. `remarks`

约束：

1. 同一对象同一时间只能有一个 `unbound_at is null` 的有效绑定。

#### `twin_events`

记录孪生事件流。

核心字段：

1. `id`
2. `org_id`
3. `warehouse_id`
4. `event_type`
5. `entity_type`
6. `entity_id`
7. `payload`
8. `operator_id`
9. `created_at`

---

## 7. 阶段一兼容策略

这是第一阶段最关键的设计点。

### 7.1 总体策略

采用“双写 + 读兼容”：

1. 新页面读取孪生模型。
2. 旧页面继续读取现有库存表。
3. 核心作业动作同时写入新旧模型。

### 7.2 双写规则

#### 扫码绑定成功后必须同时更新

1. `location_bindings`
2. `inventory_objects.current_location_id`
3. `inventory_objects.current_warehouse_id`
4. `org_inventory_units.location_id`
5. `org_inventory_units.warehouse_id`
6. `warehouse_locations.used_capacity`
7. `warehouse_locations.status`
8. `twin_events`
9. 如有对应 `storage_locations` 视图或扩展表，也必须同步状态

### 7.3 读兼容要求

1. `InventoryHome` 仍以 `org_inventory_units` 为统计源。
2. `Reports` 仍以 `org_inventory_units` 和 `inventory_transactions` 为报表源。
3. `StocktakingManager` 第一阶段仍以 `org_inventory_units` 为盘点对象。
4. `WarehouseManager` 在旧库位管理页增加进入 3D 设计页和查看页入口。

### 7.4 回退策略

如果阶段一上线后出现问题：

1. 旧的批量入库、扫码领取、报表、盘点页面仍然保留。
2. 新 3D 页面可通过菜单隐藏。
3. 双写链路保留审计日志，可进行对账修复。

---

## 8. 阶段一接口设计

所有新接口统一挂在：

`/api/inventory/twin`

### 8.1 仓库与布局

1. `GET /api/inventory/twin/warehouses`
2. `POST /api/inventory/twin/warehouses`
3. `PUT /api/inventory/twin/warehouses/:id`
4. `GET /api/inventory/twin/warehouses/:id/layout`
5. `PUT /api/inventory/twin/warehouses/:id/layout`

说明：

1. 仓库基础信息仍落在 `warehouses`。
2. 布局信息和 3D 结构信息落在扩展字段和孪生表。

### 8.2 货架模板与实例

1. `GET /api/inventory/twin/rack-templates`
2. `POST /api/inventory/twin/rack-templates`
3. `PUT /api/inventory/twin/rack-templates/:id`
4. `GET /api/inventory/twin/rack-instances`
5. `POST /api/inventory/twin/rack-instances`
6. `PUT /api/inventory/twin/rack-instances/:id`

### 8.3 库位

1. `GET /api/inventory/twin/locations`
2. `POST /api/inventory/twin/locations`
3. `PUT /api/inventory/twin/locations/:id`
4. `POST /api/inventory/twin/locations/batch-generate`
5. `POST /api/inventory/twin/locations/batch-generate-qr`

### 8.4 货物规格与对象

1. `GET /api/inventory/twin/item-shapes`
2. `POST /api/inventory/twin/item-shapes`
3. `PUT /api/inventory/twin/item-shapes/:id`
4. `GET /api/inventory/twin/objects`
5. `POST /api/inventory/twin/objects`
6. `PUT /api/inventory/twin/objects/:id`

### 8.5 绑定与移位

1. `POST /api/inventory/twin/bindings/scan`
2. `POST /api/inventory/twin/bindings/move`
3. `POST /api/inventory/twin/bindings/unbind`

#### `bindings/scan` 请求体

```json
{
  "objectQr": "OBJ-XQ-000001",
  "locationQr": "LOC-WH01-A-01-03-02",
  "bindingMode": "scan",
  "operatorContext": {
    "source": "web",
    "page": "twin-scan-binding"
  }
}
```

#### `bindings/scan` 服务端必做校验

1. 两个二维码都存在
2. 二维码类型正确
3. 二维码状态有效
4. 货物和库位属于同一机构
5. 库位未锁定
6. 尺寸可放入
7. 重量未超限
8. 货物类型允许
9. 对象当前不存在其他有效绑定

### 8.6 场景与事件

1. `GET /api/inventory/twin/scene/:warehouseId`
2. `GET /api/inventory/twin/events`

`scene` 接口返回：

1. 仓库信息
2. 区域信息
3. 货架实例
4. 库位信息
5. 货物对象
6. 占用状态
7. 告警占位信息
8. `sceneVersion`

---

## 9. 阶段一事务设计

### 9.1 扫码绑定事务

`POST /twin/bindings/scan` 必须单事务完成：

1. 查库位二维码
2. 查货物二维码
3. 锁定目标货物对象
4. 查找并关闭旧绑定
5. 创建新绑定
6. 更新 `inventory_objects`
7. 双写 `org_inventory_units`
8. 更新库位占用状态
9. 写 `inventory_transactions`
10. 写 `twin_events`

事务失败时全部回滚。

### 9.2 并发约束

必须使用数据库唯一约束或条件索引保证：

1. 同一对象只有一个有效绑定
2. 同一个二维码不可重复使用为不同实体
3. 并发扫码时不会把同一货物绑定到多个库位

### 9.3 占用计算规则

阶段一占用计算采用简化规则：

1. 默认以“件数占用”为主，保留 `used_capacity / capacity`
2. 同时写入尺寸和重量，为第二阶段仿真做准备
3. 3D 校验优先校验单件尺寸和库位最大重量

---

## 10. 阶段一前端设计

### 10.1 新增页面

#### `TwinWarehouseDesigner`

作用：

1. 编辑仓库尺寸
2. 配置区域和通道
3. 选择货架模板并摆放货架实例
4. 批量生成库位
5. 保存布局

操作方式：

1. 左侧对象列表
2. 中间 3D 视图
3. 右侧属性面板
4. 顶视图、侧视图、透视图切换

#### `TwinWarehouseViewer`

作用：

1. 查看 3D 仓库
2. 查看库位占用
3. 按区域、货架、状态筛选
4. 点击库位查看物资信息
5. 显示扫码高亮结果

#### `TwinScanBindingPanel`

作用：

1. 扫描库位码
2. 扫描货物码
3. 展示绑定结果
4. 展示失败原因
5. 触发 3D 高亮

### 10.2 与现有页面衔接

#### `WarehouseManager`

新增：

1. “进入 3D 设计”按钮
2. “进入 3D 查看”按钮
3. 库位列表与 3D 库位数据的对应入口

#### `BatchInbound`

新增：

1. 支持选择目标仓库
2. 支持选择目标 3D 库位
3. 入库后自动创建对应 `inventory_objects`

#### `QRCodePrinter`

新增：

1. 支持打印库位二维码
2. 支持打印货物二维码
3. 支持按仓库、区域、货架筛选库位码

#### `ScanPickup`

不改为孪生页面，继续用于领取。

说明：

1. 领取流程和库位绑定流程是两套业务动作。
2. 第一阶段单独新增绑定页面，避免混用。

### 10.3 3D 表现要求

1. 仓库用半透明盒体或地面边界表达。
2. 区域用不同颜色块表达。
3. 货架用参数化立方体结构表达。
4. 库位用格位或小方盒表达。
5. 货物用参数化形状表达。
6. 空位、占用、锁定、异常使用不同颜色。

### 10.4 性能要求

1. 首次只按单仓加载，不做跨仓全量展示。
2. 货架、库位、货物分层加载。
3. 远距离隐藏货物细节。
4. 单仓视图首屏目标控制在可接受范围内，不允许因一次性渲染全部对象导致页面不可用。

---

## 11. 阶段一作业流程

### 11.1 仓库初始化流程

1. 在旧仓库管理页创建仓库
2. 进入 3D 设计页填写仓库尺寸
3. 新建区域
4. 新建货架模板
5. 摆放货架实例
6. 批量生成库位
7. 生成库位二维码

### 11.2 货物入库流程

1. 在 `BatchInbound` 中选择批次
2. 填写物资规格
3. 指定目标仓库
4. 创建 `org_inventory_units`
5. 同步创建单件级 `inventory_objects`
6. 打印货物二维码

### 11.3 扫码绑定流程

1. 打开 `TwinScanBindingPanel`
2. 扫描库位码
3. 扫描货物码
4. 服务端校验
5. 成功后写新旧模型
6. 3D 场景高亮显示位置

### 11.4 移位流程

1. 扫描货物码
2. 扫描目标库位码
3. 关闭旧绑定
4. 新建目标绑定
5. 更新旧表位置
6. 写操作日志

---

## 12. 阶段一测试方案

### 12.1 数据层测试

1. 新增字段迁移成功
2. 新增表建表成功
3. 唯一约束正确生效
4. 多租户隔离正确

### 12.2 接口测试

1. 新建仓库 3D 配置
2. 新建货架模板
3. 新建货架实例
4. 批量生成库位
5. 生成二维码
6. 创建货物对象
7. 扫码绑定成功
8. 扫码移位成功

### 12.3 失败场景测试

1. 扫描无效二维码
2. 扫描错误类型二维码
3. 货物与库位跨机构
4. 货物与库位跨仓库
5. 库位锁定
6. 货物尺寸超限
7. 重量超限
8. 重复绑定
9. 并发绑定同一货物

### 12.4 回归测试

1. 旧库存总览仍能查询
2. 旧二维码打印仍能使用
3. 旧扫码领取仍能使用
4. 旧报表仍能统计
5. 旧盘点仍能运行

### 12.5 前端测试

1. 3D 页面能加载
2. 场景切换正常
3. 仓库筛选正常
4. 库位点击与详情联动正常
5. 扫码绑定结果能回放到 3D 场景

---

## 13. 阶段一实施顺序

### 任务包 1：数据库与兼容基础

1. 扩展 `warehouses`
2. 扩展 `warehouse_locations`
3. 扩展 `org_inventory_units`
4. 新建孪生表
5. 新建唯一约束和索引

### 任务包 2：后端 twin 接口

1. 仓库布局接口
2. 货架模板接口
3. 货架实例接口
4. 库位接口
5. 货物规格接口
6. 货物对象接口

### 任务包 3：扫码绑定链路

1. 二维码统一解析
2. 绑定事务
3. 移位事务
4. 审计日志
5. 旧表双写

### 任务包 4：前端 3D 页面

1. 3D 查看页
2. 3D 设计页
3. 扫码绑定页
4. 与 `WarehouseManager` 集成

### 任务包 5：旧流程接入

1. `BatchInbound` 接入货物对象
2. `QRCodePrinter` 接入库位码打印
3. `InventoryHome` 保持兼容
4. `Reports` 保持兼容

### 任务包 6：测试与灰度

1. 接口测试
2. 并发测试
3. 回归测试
4. 数据对账脚本
5. 试点机构灰度

---

## 14. 阶段一风险与控制措施

### 风险 1：新旧模型双写不一致

控制措施：

1. 绑定动作统一走事务
2. 所有绑定动作写 `twin_events`
3. 上线前补对账脚本

### 风险 2：并发扫码导致重复绑定

控制措施：

1. 关键表加唯一约束
2. 事务中锁定对象
3. 所有绑定操作服务端串行化处理

### 风险 3：3D 页面性能不足

控制措施：

1. 按仓库分开加载
2. 只做参数化模型
3. 分层渲染货架、库位、货物

### 风险 4：影响旧 WMS 页面

控制措施：

1. 不替换旧页面
2. 保留旧数据结构
3. 先接入新入口，后逐步迁移

---

## 15. 阶段二预告

第二阶段再补以下能力：

1. A* 拣货路径
2. 智能库位推荐
3. 热区与流转分析
4. 容量模拟
5. 预警联动
6. 移动端联动

阶段二以阶段一稳定后的真实作业数据为基础设计，不在本阶段提前实现。

---

## 16. 当前结论

阶段一是一个可实施、可灰度、可回退的 3D 仓储基础版。

它优先解决你的 5 个核心要求：

1. 多仓库 3D 定义
2. 多货架 3D 定义
3. 货物 3D 尺寸定义
4. 库位二维码
5. 扫码绑定库位

同时避免一开始就把系统推入高风险的完整数字孪生实施。

文档状态：阶段一实施稿  
更新时间：2026-03-21
