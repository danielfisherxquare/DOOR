# 模块权限配置实施指南

## 场景描述

创建一个机构，拥有一个赛事，多个用户。演示如何通过权限矩阵管理模块访问权限。

---

## Step 1: 创建机构

### API 调用
```bash
POST /api/auth/register
Content-Type: application/json

{
  "username": "org_admin",
  "email": "admin@example.org",
  "password": "SecurePass123!",
  "orgName": "示例体育俱乐部"
}
```

### 返回结果
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "username": "org_admin",
      "role": "org_admin",
      "org": { "id": 1, "name": "示例体育俱乐部" }
    },
    "accessToken": "...",
    "refreshToken": "..."
  }
}
```

### 说明
- 注册会自动创建机构和机构管理员账号
- `org_admin` 角色拥有全部模块访问权限（无需在矩阵中配置）

---

## Step 2: 创建赛事

### API 调用
```bash
POST /api/admin/races
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "name": "2024城市马拉松",
  "slug": "2024-city-marathon",
  "orgId": 1,
  "startDate": "2024-05-01",
  "endDate": "2024-05-03"
}
```

### 返回结果
```json
{
  "success": true,
  "data": {
    "id": 100,
    "name": "2024城市马拉松",
    "orgId": 1
  }
}
```

---

## Step 3: 创建普通用户

### API 调用（管理员创建用户）
```bash
POST /api/admin/org/users
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "username": "user_a",
  "email": "user_a@example.org",
  "password": "UserPass123!",
  "role": "user"
}
```

### 批量创建多个用户
```bash
# 创建用户B - 赛事管理员
POST /api/admin/org/users
{
  "username": "user_b",
  "email": "user_b@example.org",
  "password": "UserPass123!",
  "role": "race_admin"
}

# 创建用户C - 普通用户
POST /api/admin/org/users
{
  "username": "user_c",
  "email": "user_c@example.org",
  "password": "UserPass123!",
  "role": "user"
}
```

### 用户角色与默认权限
| 角色 | 默认模块权限 | 说明 |
|------|-------------|------|
| `org_admin` | 全部模块 | 机构管理员，无需配置 |
| `race_admin` | app:home, app:profile, app:map, ops:* | 赛事管理员，有基础权限 |
| `user` | app:home, app:profile | 普通用户，最小权限，需管理员授权 |

---

## Step 4: 进入权限矩阵页面

### 页面入口
```
/admin/module-permissions?orgId=1
```

### 页面展示内容
- **用户列表**: user_a, user_b, user_c（排除 org_admin）
- **模块矩阵**: 所有注册的模块列

| 用户 | 首页 | 个人页 | GIS地图 | 报销 | 证件 | 仓储 | 面试 |
|------|------|--------|---------|------|------|------|------|
| user_a (user) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| user_b (race_admin) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| user_c (user) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## Step 5: 批量授权模块

### API 调用
```bash
PUT /api/module-access/organization/1/users/batch
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "updates": [
    {
      "userId": "user_a的ID",
      "modules": ["app:home", "app:profile", "app:credentials", "app:inventory"]
    },
    {
      "userId": "user_c的ID",
      "modules": ["app:home", "app:profile", "app:reimbursements", "app:interview"]
    }
  ]
}
```

### 授权后矩阵状态
| 用户 | 首页 | 个人页 | 报销 | 证件 | 仓储 | 面试 |
|------|------|--------|------|------|------|------|
| user_a | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| user_b | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | (race_admin 默认) |
| user_c | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |

---

## Step 6: 验证权限生效

### 前端验证
用户登录后：
1. 有权限的模块 → 侧边栏显示
2. 无权限的模块 → 侧边栏隐藏
3. 直接访问无权限路由 → 显示"模块访问受限"页面

### API 验证
```bash
# 无权限用户访问报销API
GET /api/app/reimbursements
Authorization: Bearer {user_a的token}

# 返回 403
{
  "success": false,
  "message": "无权访问模块 app:reimbursements"
}
```

---

## Step 7: 权限更新后的生效机制

### 当前实现
- 权限保存后，被修改用户需要**刷新页面或重新登录**
- 前端提示: "权限矩阵已保存。被修改的用户需要刷新页面或重新登录才能生效。"

### 数据流程
```
权限矩阵保存 → 写入 user_module_access 表
               ↓
用户刷新页面 → GET /api/auth/me → 返回最新 moduleAccess
               ↓
前端 authStore 更新 → 侧边栏重新渲染
```

---

## 附录: 完整模块ID列表

### APP 入口
| 模块ID | 名称 | 默认 | 说明 |
|--------|------|------|------|
| app:home | 首页 | ✅ | 所有用户必有 |
| app:profile | 个人页 | ✅ | 所有用户必有 |
| app:map | GIS地图 | ❌ | 地图功能 |
| app:reimbursements | 报销管理 | ❌ | 财务报销 |
| app:3d-studio | 3D工作室 | ❌ | 空间设计 |
| app:credentials | 证件流程 | ❌ | 证件全流程(8页) |
| app:inventory | 仓储作业 | ❌ | 仓储作业(6页) |
| app:events | 赛事管理 | ❌ | 赛事功能(5页) |
| app:interview | 面试工具 | ❌ | 面试评分(3页) |

### OPS 入口
| 模块ID | 名称 | 默认 | 说明 |
|--------|------|------|------|
| ops:home | 执行端首页 | ❌ | OPS入口 |
| ops:scan | 扫码登录 | ❌ | 扫码功能 |
| ops:bib-pickup | 号码布领取 | ❌ | 物资发放 |
| ops:bib-tracking | 号码布追踪 | ❌ | 追踪管理 |
| ops:credentials | 证件发放 | ❌ | 证件发放 |
| ops:warehouse | 仓储作业 | ❌ | OPS仓储 |

### ADMIN 入口
| 模块ID | 名称 | 默认 | 说明 |
|--------|------|------|------|
| admin:dashboard | 管理仪表盘 | ❌ | 后台首页 |
| admin:members | 成员与授权 | ❌ | 用户管理+权限 |
| admin:orgs | 机构管理 | ❌ | 机构CRUD |
| admin:races | 赛事管理 | ❌ | 赛事CRUD |
| admin:credentials | 证件管理 | ❌ | 后台证件 |
| admin:finance | 财务管理 | ❌ | 报销审核 |
| admin:inventory | 仓储管理 | ❌ | 后台仓储 |
| admin:backups | 数据备份 | ❌ | 系统备份 |
| admin:hr | 人事面试 | ❌ | 面试管理 |