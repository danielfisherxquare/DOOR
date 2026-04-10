k哦那估计
# 基于二维码的仓储管理系统执行方案

## 一、项目概述

### 1.1 背景
- 项目挂载在DOOR系统下
- 以机构为中心管理物资，而非以赛事为中心
- 支持赛事向机构申请物资
- 需要批量生成和打印二维码

### 1.2 核心功能
**基础功能：**
1. 物资入库 & 二维码批量生成
2. 二维码标签批量打印
3. 赛事物资申请 & 审批
4. 扫码出库/领取
5. 库存实时统计

**增强功能（在线库存管理）：**
6. 多仓库/多库位管理
7. 可视化库位地图
8. 库存预警系统（低库存/过期/滞销）
9. 盘点管理（全盘/抽盘/动态盘点）
10. 实时同步（WebSocket推送）
11. 库存报表与分析
12. 批次追溯（正向/反向）

### 1.3 技术架构
- 前端：React + Vite（现有）
- 后端：Node.js + Express + Knex（现有）
- 数据库：PostgreSQL（现有）
- 新增依赖：qrcode.react（二维码生成）、react-to-print（打印功能）

---

## 二、数据模型设计

### 2.1 机构物资批次表 (org_inventory_batches)

PostgreSQL表结构：
```javascript
await knex.schema.createTable('org_inventory_batches', (t) => {
    t.increments('id').primary();
    t.uuid('org_id').notNullable().references('id').inTable('organizations');
    t.string('batch_name', 100).notNullable();
    t.string('batch_type', 50).notNullable();  // clothing/medal/bag/other
    t.string('supplier', 200).nullable();
    t.date('purchase_date').nullable();
    t.integer('total_quantity').notNullable().defaultTo(0);
    t.string('status', 20).notNullable().defaultTo('draft');  // draft/active/archived
    t.uuid('created_by').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    
    t.index(['org_id', 'batch_type']);
});
```

### 2.2 机构物资单元表 (org_inventory_units)

PostgreSQL表结构：
```javascript
await knex.schema.createTable('org_inventory_units', (t) => {
    t.bigIncrements('id').primary();
    t.uuid('org_id').notNullable().references('id').inTable('organizations');
    t.integer('batch_id').notNullable().references('id').inTable('org_inventory_batches');
    t.string('qr_code', 100).notNullable().unique();
    t.string('item_type', 50).notNullable();  // clothing/medal/bag
    t.string('item_category', 50).nullable();  // tshirt/jacket/medal_finisher
    t.jsonb('item_spec').nullable();  // {"size":"L","gender":"M","color":"blue"}
    t.string('status', 20).notNullable().defaultTo('in_stock');
    t.string('current_holder_type', 20).notNullable().defaultTo('org');  // org/race/runner
    t.string('current_holder_id', 36).nullable();
    t.integer('warehouse_id').nullable().references('id').inTable('warehouses');
    t.integer('location_id').nullable().references('id').inTable('warehouse_locations');
    t.timestamp('allocated_at', { useTz: true }).nullable();
    t.timestamp('picked_at', { useTz: true }).nullable();
    t.string('picked_by', 100).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    
    t.index(['org_id', 'batch_id']);
    t.index(['org_id', 'status']);
    t.index(['qr_code']);
});
```

### 2.3 赛事物资申请表 (race_material_requests)

字段说明：
- id: 主键
- org_id: 机构ID
- race_id: 赛事ID
- item_type: 物资类型
- item_spec: 规格JSON
- requested_quantity: 申请数量
- approved_quantity: 审批数量
- allocated_quantity: 已分配数量
- status: 状态（pending/approved/rejected/fulfilled）
- approved_by/approved_at: 审批信息
- remarks: 备注

### 2.4 物资流转记录表 (inventory_transactions)

字段说明：
- id: 主键
- org_id: 机构ID
- unit_id: 物资单元ID
- transaction_type: 流转类型（inbound/allocate/pickup/return/damage/transfer）
- from_holder_type/from_holder_id: 来源
- to_holder_type/to_holder_id: 去向
- operator_id/operator_name: 操作人
- remarks: 备注

### 2.5 仓库表 (warehouses) - 新增

字段说明：
- id: 主键
- org_id: 机构ID
- code: 仓库编码（唯一）
- name: 仓库名称
- address: 地址
- contact: 联系人
- is_default: 是否默认仓库
- status: 状态（active/inactive）

### 2.6 库位表 (warehouse_locations) - 新增

字段说明：
- id: 主键
- warehouse_id: 仓库ID
- org_id: 机构ID
- code: 库位编码（如：A-01-03-02）
- zone: 区域（A区）
- aisle: 货架（01货架）
- shelf: 层（03层）
- position: 位（02位）
- qr_code: 库位二维码
- capacity: 容量
- used_capacity: 已用容量
- item_types: 允许存放的物资类型JSON
- status: 状态（empty/partial/full/locked）

### 2.7 库存预警规则表 (inventory_alert_rules) - 新增

字段说明：
- id: 主键
- org_id: 机构ID
- rule_type: 规则类型（low_stock/expiring/slow_moving/abnormal_loss）
- item_type: 物资类型
- item_category: 物资类别
- threshold_value: 阈值
- threshold_type: 阈值类型（quantity/percentage/days）
- notify_channels: 通知渠道JSON（["in_app","email","sms"]）
- notify_users: 通知用户JSON
- is_enabled: 是否启用

### 2.8 库存预警记录表 (inventory_alerts) - 新增

字段说明：
- id: 主键
- org_id: 机构ID
- rule_id: 规则ID
- alert_type: 预警类型
- severity: 严重程度（info/warning/critical）
- title: 标题
- content: 内容
- is_read: 是否已读
- is_resolved: 是否已解决
- resolved_by/resolved_at: 解决信息

### 2.9 盘点计划表 (stocktaking_plans) - 新增

字段说明：
- id: 主键
- org_id: 机构ID
- warehouse_id: 仓库ID
- plan_name: 计划名称
- plan_type: 盘点类型（full/partial/dynamic）
- scope: 盘点范围JSON
- status: 状态（draft/in_progress/completed/cancelled）
- total_items: 总数量
- counted_items: 已盘数量
- diff_items: 差异数量
- started_at/completed_at: 时间

### 2.10 盘点记录表 (stocktaking_records) - 新增

字段说明：
- id: 主键
- plan_id: 盘点计划ID
- org_id: 机构ID
- unit_id: 物资单元ID
- qr_code: 二维码
- expected_location: 预期位置
- actual_location: 实际位置
- expected_status: 预期状态
- actual_status: 实际状态
- is_matched: 是否匹配
- diff_reason: 差异原因
- counted_by/counted_at: 盘点人/时间

---

## 三、业务流程设计

### 3.1 物资生命周期

采购 -> 入库(生成二维码) -> 打印标签 -> 贴标 -> 存储
                                          ↓
赛事申请 -> 审批 -> 分配 -> 扫码领取 -> 选手持有
                                          ↓
                                  归还/损坏/丢失

### 3.2 二维码格式规范

格式：{组织码}-{物资类型}-{批次号}-{序列号}

示例：XQ-CLOTH-0001-000001

组成：
- XQ: 组织码（2-4位大写字母）
- CLOTH: 物资类型（CLOTH/MEDAL/BAG）
- 0001: 批次号（4位补零）
- 000001: 序列号（6位补零）

---

## 四、前端UI设计规范

### 4.1 设计系统概述

DOOR系统采用Bento Modern设计系统，定义在 `door/src/styles/soft-design.css` 中。

### 4.2 颜色系统

```css
/* 主色 - 深灰 */
--color-primary: #27272A;
--color-primary-hover: #18181B;

/* 强调色 - 霓虹绿 */
--color-accent: #E2FF66;
--color-accent-hover: #D4F240;
--color-accent-text: #27272A;

/* 辅色 - 紫色 */
--color-purple: #6366f1;

/* 语义色 */
--color-success: #10b981;
--color-warning: #f59e0b;
--color-danger: #ef4444;

/* 背景色 */
--color-bg-primary: #F5F7FA;
--color-bg-secondary: #F3F4F6;
--color-bg-card: #FFFFFF;

/* 文字色 */
--color-text-primary: #27272A;
--color-text-secondary: #6B7280;
--color-text-muted: #71717A;
```

### 4.3 组件样式类

**卡片组件：**
```jsx
<div className="card">
  {/* 内容 */}
</div>
```

**按钮组件：**
```jsx
<button className="btn btn--primary">主按钮</button>
<button className="btn btn--accent">强调按钮</button>
<button className="btn btn--secondary">次要按钮</button>
<button className="btn btn--ghost">幽灵按钮</button>
<button className="btn btn--sm">小按钮</button>
<button className="btn btn--large">大按钮</button>
```

**表单输入：**
```jsx
<input className="input" placeholder="请输入" />
<select className="input">
  <option>选项1</option>
</select>
```

**表格组件：**
```jsx
<div className="table-wrap">
  <table>
    <thead>
      <tr>
        <th>列1</th>
        <th>列2</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>数据1</td>
        <td>数据2</td>
      </tr>
    </tbody>
  </table>
</div>
```

**标签/Pill：**
```jsx
<span className="pill pill--green">成功</span>
<span className="pill pill--blue">信息</span>
<span className="pill pill--yellow">警告</span>
<span className="pill pill--purple">高亮</span>
<span className="pill pill--accent">强调</span>
```

**管理后台卡片：**
```jsx
<div className="admin-card">
  <div className="admin-card__header">标题</div>
  <div className="admin-card__body">内容</div>
</div>
```

**统计卡片：**
```jsx
<div className="admin-stat-card">
  <div className="admin-stat-num">1,234</div>
  <div className="admin-stat-label">库存总量</div>
</div>
```

**快捷操作：**
```jsx
<div className="quick-actions">
  <button className="quick-action-btn">
    <div className="quick-action-btn__icon">📦</div>
    <span>入库</span>
  </button>
</div>
```

### 4.4 布局规范

**页面主内容：**
```jsx
<div className="main-content">
  {/* 页面内容 */}
</div>
```

**网格布局：**
```jsx
<div className="grid grid--tools">
  {/* 自适应网格 */}
</div>
```

### 4.5 响应式断点

| 断点 | 宽度 | 适配设备 |
|------|------|----------|
| 大屏 | >1024px | 桌面端 |
| 平板 | 768px-1024px | iPad |
| 小平板 | <768px | iPad Mini |
| 手机 | <480px | iPhone |
| 超小屏 | <360px | 小屏手机 |

**移动端优化：**
- 按钮最小触摸区域：44px
- 输入框字体大小：≥16px（防止iOS自动缩放）
- 底部导航栏（管理后台）

### 4.6 库存模块UI设计示例

**库存总览页面：**
```jsx
function InventoryHome() {
  return (
    <div className="main-content">
      {/* 页面标题 */}
      <h1 className="page-title">库存管理</h1>
      <p className="page-subtitle">管理机构物资库存</p>

      {/* 统计卡片 */}
      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-num">1,234</div>
          <div className="admin-stat-label">总库存</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-num">567</div>
          <div className="admin-stat-label">已分配</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-num">89</div>
          <div className="admin-stat-label">待入库</div>
        </div>
      </div>

      {/* 快捷操作 */}
      <div className="quick-actions">
        <button className="quick-action-btn">
          <div className="quick-action-btn__icon">📥</div>
          <span>入库</span>
        </button>
        <button className="quick-action-btn">
          <div className="quick-action-btn__icon">🖨️</div>
          <span>打印</span>
        </button>
        <button className="quick-action-btn">
          <div className="quick-action-btn__icon">📊</div>
          <span>报表</span>
        </button>
      </div>

      {/* 库存列表 */}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>二维码</th>
                <th>物资类型</th>
                <th>规格</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>XQ-CLOTH-0001-000001</td>
                <td>服装</td>
                <td>L码 男款</td>
                <td><span className="pill pill--green">在库</span></td>
                <td>
                  <button className="btn btn--ghost btn--sm">详情</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

---

## 五、文件清单

### 4.1 后端文件

| 文件路径 | 说明 |
|---------|------|
| door/server/src/db/migrations/xxxx_create_inventory_tables.js | 数据库迁移（10张表） |
| door/server/src/middleware/require-org-access.js | 机构权限中间件（新增） |
| door/server/src/modules/inventory/inventory.repository.js | 数据访问层 |
| door/server/src/modules/inventory/inventory.routes.js | API路由 |
| door/server/src/modules/inventory/inventory.service.js | 业务逻辑层 |
| door/server/src/modules/inventory/inventory.sync.js | WebSocket实时同步服务 |
| door/server/src/modules/inventory/inventory.alert.js | 预警服务 |
| door/server/src/modules/inventory/inventory.stocktaking.js | 盘点服务 |
| door/server/src/modules/inventory/inventory.report.js | 报表服务 |

### 4.3 需要修改的现有文件

| 文件路径 | 修改内容 |
|---------|------|
| door/server/src/app.js | 添加 inventory 路由 |
| door/server/package.json | 添加 ws 依赖 |

### 4.2 前端文件

| 文件路径 | 说明 |
|---------|------|
| door/src/views/inventory/InventoryHome.jsx | 库存总览仪表盘 |
| door/src/views/inventory/BatchManager.jsx | 批次管理 |
| door/src/views/inventory/WarehouseManager.jsx | 仓库管理 |
| door/src/views/inventory/LocationMap.jsx | 可视化库位地图 |
| door/src/views/inventory/QRCodePrinter.jsx | 批量打印页面 |
| door/src/views/inventory/AllocationManager.jsx | 分配管理 |
| door/src/views/inventory/StocktakingManager.jsx | 盘点管理 |
| door/src/views/inventory/MobileStocktaking.jsx | 移动端盘点 |
| door/src/views/inventory/AlertCenter.jsx | 预警中心 |
| door/src/views/inventory/Reports.jsx | 报表中心 |
| door/src/views/inventory/ScanPickup.jsx | 扫码领取 |
| door/src/components/inventory/WarehouseMap.jsx | 库位图组件 |
| door/src/components/inventory/AlertNotification.jsx | 预警通知组件 |
| door/src/components/inventory/StockChart.jsx | 库存图表组件 |
| door/src/services/inventoryApi.js | API服务 |

---

## 五、技术实现细节

### 5.1 机构权限中间件 (require-org-access.js)

```javascript
/**
 * Require Org Access 中间件 — 机构粒度权限守卫
 */
export function requireOrgAccess(resolveOrgId) {
    return async (req, res, next) => {
        try {
            const { userId, role, orgId: userOrgId } = req.authContext || {};

            if (!userId || !role) {
                return res.status(401).json({ success: false, message: '未授权' });
            }

            // 解析目标 orgId
            let orgId;
            if (typeof resolveOrgId === 'function') {
                orgId = await resolveOrgId(req);
            } else if (typeof resolveOrgId === 'string') {
                orgId = req.params[resolveOrgId] || req.body[resolveOrgId] || req.query[resolveOrgId];
            }

            // 默认使用当前用户的orgId
            if (!orgId) {
                orgId = userOrgId;
            }

            // 验证用户是否有权限访问该机构
            if (orgId !== userOrgId && role !== 'admin') {
                return res.status(403).json({ success: false, message: '无权访问该机构资源' });
            }

            req.orgAccess = { orgId, userId, role };
            next();

        } catch (err) {
            console.error('[AUTH ERROR] requireOrgAccess:', err);
            return res.status(500).json({ success: false, message: '权限校验服务出错' });
        }
    };
}
```

### 5.2 app.js 路由注册

在 `door/server/src/app.js` 中添加：

```javascript
import inventoryRoutes from './modules/inventory/inventory.routes.js';

// 在 requireAuth 之后添加
app.use('/api/inventory', inventoryRoutes);
```

### 5.3 WebSocket配置

**安装依赖：**
```bash
cd door/server && npm install ws
```

**在 inventory.sync.js 中实现：**
```javascript
import { WebSocketServer } from 'ws';

let wss = null;
const clients = new Map(); // orgId -> Set<ws>

export function initWebSocket(server) {
    wss = new WebSocketServer({ server, path: '/ws/inventory' });
    
    wss.on('connection', (ws, req) => {
        const url = new URL(req.url, 'http://localhost');
        const orgId = url.searchParams.get('orgId');
        
        if (!orgId) {
            ws.close(1008, 'Missing orgId');
            return;
        }
        
        if (!clients.has(orgId)) {
            clients.set(orgId, new Set());
        }
        clients.get(orgId).add(ws);
        
        ws.on('close', () => {
            clients.get(orgId)?.delete(ws);
        });
    });
}

export function broadcastToOrg(orgId, event) {
    const orgClients = clients.get(orgId);
    if (!orgClients) return;
    
    const message = JSON.stringify(event);
    orgClients.forEach(ws => {
        if (ws.readyState === ws.OPEN) {
            ws.send(message);
        }
    });
}
```

---

## 六、API端点设计

### 5.1 批次管理

- GET /api/inventory/batches - 获取批次列表
- POST /api/inventory/batches - 创建批次
- GET /api/inventory/batches/:id - 获取批次详情
- PUT /api/inventory/batches/:id - 更新批次
- DELETE /api/inventory/batches/:id - 删除批次

### 5.2 物资管理

- POST /api/inventory/units/batch - 批量入库
- GET /api/inventory/units - 查询物资列表
- GET /api/inventory/units/:qr - 根据二维码查询
- POST /api/inventory/units/scan - 扫码处理
- PUT /api/inventory/units/:id/status - 更新状态

### 5.3 申请管理

- GET /api/inventory/requests - 获取申请列表
- POST /api/inventory/requests - 创建申请
- PUT /api/inventory/requests/:id/approve - 审批申请
- POST /api/inventory/requests/:id/allocate - 分配物资

### 5.4 仓库管理（新增）

- GET /api/inventory/warehouses - 获取仓库列表
- POST /api/inventory/warehouses - 创建仓库
- GET /api/inventory/warehouses/:id - 获取仓库详情
- PUT /api/inventory/warehouses/:id - 更新仓库
- DELETE /api/inventory/warehouses/:id - 删除仓库

### 5.5 库位管理（新增）

- GET /api/inventory/locations - 获取库位列表
- POST /api/inventory/locations - 创建库位
- GET /api/inventory/locations/:id - 获取库位详情
- PUT /api/inventory/locations/:id - 更新库位
- POST /api/inventory/locations/recommend - 智能推荐库位
- GET /api/inventory/locations/map/:warehouseId - 获取库位地图数据

### 5.6 预警管理（新增）

- GET /api/inventory/alerts - 获取预警列表
- GET /api/inventory/alerts/unread - 获取未读预警数
- PUT /api/inventory/alerts/:id/read - 标记已读
- PUT /api/inventory/alerts/:id/resolve - 标记已解决
- GET /api/inventory/alert-rules - 获取预警规则
- POST /api/inventory/alert-rules - 创建预警规则
- PUT /api/inventory/alert-rules/:id - 更新预警规则

### 5.7 盘点管理（新增）

- GET /api/inventory/stocktaking/plans - 获取盘点计划列表
- POST /api/inventory/stocktaking/plans - 创建盘点计划
- GET /api/inventory/stocktaking/plans/:id - 获取盘点计划详情
- POST /api/inventory/stocktaking/plans/:id/start - 开始盘点
- POST /api/inventory/stocktaking/plans/:id/complete - 完成盘点
- POST /api/inventory/stocktaking/scan - 扫码盘点
- GET /api/inventory/stocktaking/records/:planId - 获取盘点记录

### 5.8 报表查询（新增）

- GET /api/inventory/statistics - 库存统计
- GET /api/inventory/statistics/org - 机构级统计
- GET /api/inventory/reports/turnover - 库存周转率报表
- GET /api/inventory/reports/snapshot/:date - 库存快照
- GET /api/inventory/reports/trace/:unitId - 物资追溯

### 5.9 WebSocket连接（新增）

- WS /ws/inventory?orgId={orgId} - 实时库存变动订阅

---

## 六、实施计划

### 6.1 阶段划分（增强版）

| 阶段 | 任务 | 预计时间 | 依赖 |
|------|------|----------|------|
| **Phase 1: 基础功能** | | | |
| P1 | 数据库迁移（10张表） + 后端基础CRUD | 2小时 | 无 |
| P2 | 批量入库 + 二维码生成 | 2小时 | P1 |
| P3 | 打印页面开发 | 2小时 | P2 |
| P4 | 赛事申请流程 | 2小时 | P1 |
| P5 | 扫码领取功能 | 1.5小时 | P2 |
| **Phase 2: 仓库管理** | | | |
| P6 | 仓库/库位管理CRUD | 2小时 | P1 |
| P7 | 可视化库位地图 | 2小时 | P6 |
| P8 | 智能库位推荐 | 1小时 | P6 |
| **Phase 3: 预警系统** | | | |
| P9 | 预警规则管理 | 1.5小时 | P1 |
| P10 | 预警触发与通知 | 1.5小时 | P9 |
| P11 | 预警中心UI | 1小时 | P10 |
| **Phase 4: 盘点功能** | | | |
| P12 | 盘点计划管理 | 2小时 | P1 |
| P13 | 扫码盘点功能 | 2小时 | P12 |
| P14 | 移动端盘点 | 1.5小时 | P13 |
| **Phase 5: 报表与同步** | | | |
| P15 | 库存报表 | 2小时 | P1 |
| P16 | 物资追溯 | 1小时 | P1 |
| P17 | WebSocket实时同步 | 2小时 | P1 |
| **Phase 6: 集成** | | | |
| P18 | 导航集成 + 权限配置 | 1小时 | P3,P4,P5 |
| P19 | 全功能测试 | 1.5小时 | 全部 |

**总计：约28小时**

### 6.2 推荐执行顺序

**第一周（核心功能）：**
- Day 1: P1 + P2（数据库 + 批量入库）
- Day 2: P3（打印功能）
- Day 3: P4 + P5（申请流程 + 扫码领取）
- Day 4: P6 + P7（仓库管理 + 库位地图）
- Day 5: P18 + P19（集成测试）

**第二周（增强功能）：**
- Day 1: P8 + P9 + P10（智能推荐 + 预警系统）
- Day 2: P11 + P12（预警UI + 盘点计划）
- Day 3: P13 + P14（扫码盘点 + 移动端）
- Day 4: P15 + P16（报表 + 追溯）
- Day 5: P17（WebSocket同步）

---

## 七、风险与注意事项

### 7.1 技术风险
- 批量插入性能：单次最多500条，超出需分批处理
- 并发扫码：使用数据库锁避免重复领取
- 离线场景：可选支持PWA离线缓存

### 7.2 业务风险
- 二维码防伪：使用hash校验防止伪造
- 库存准确性：定期盘点核对
- 操作审计：所有操作记录流转日志

### 7.3 与现有系统集成
- 不影响现有clothing_limits表：新系统独立运行
- 可选同步：如需与抽签系统联动，可后续开发同步接口

---

## 八、后续扩展

1. 移动端APP：原生扫码体验更佳
2. 批量导入：支持Excel导入物资清单
3. 库存预警：低库存自动通知
4. 多仓库：支持多仓库管理
5. 报表导出：库存报表、流转报表导出

---

文档版本：v1.0
创建时间：2024-03-20