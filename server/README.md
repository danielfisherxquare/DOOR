# DOOR 门户系统 — 权限模型与部署指南

## 权限模型

### 角色体系

| 角色 | 说明 | 可见范围 |
|------|------|----------|
| `super_admin` | 超级管理员 | 全平台所有机构和赛事 |
| `org_admin` | 机构管理员 | 本机构所有赛事 + 成员管理 |
| `race_editor` | 赛事编辑 | 仅被分配的赛事（可读写） |
| `race_viewer` | 赛事只读 | 仅被分配的赛事（只读） |

### API 权限矩阵

| API 分组 | 无 Token | race_viewer | race_editor | org_admin | super_admin |
|----------|----------|-------------|-------------|-----------|-------------|
| `/api/auth/*` | ✅ 公开 | ✅ | ✅ | ✅ | ✅ |
| `/api/races` GET | ❌ 401 | ✅ 仅授权 | ✅ 仅授权 | ✅ 本机构 | ✅ 全平台 |
| `/api/records` GET | ❌ | ✅ 仅授权 | ✅ | ✅ | ✅ |
| `/api/records` POST | ❌ | ❌ 403 | ✅ | ✅ | ✅ |
| `/api/admin/*` | ❌ | ❌ | ❌ | ❌ | ✅ |
| `/api/org/*` | ❌ | ❌ | ❌ | ✅ | ✅ |

### 管理后台路由

| 路由 | 页面 | 可访问角色 |
|------|------|------------|
| `/admin` | 仪表板 | org_admin, super_admin |
| `/admin/orgs` | 机构列表 | super_admin |
| `/admin/orgs/new` | 新建机构 | super_admin |
| `/admin/users` | 全平台用户 | super_admin |
| `/admin/members` | 成员管理 | org_admin, super_admin |
| `/admin/members/new` | 新建成员 | org_admin, super_admin |
| `/admin/race-permissions` | 赛事授权 | org_admin, super_admin |

---

## 部署检查清单

### 环境变量

```bash
# .env 必需
DATABASE_URL=postgres://user:pass@host:5432/door
JWT_SECRET=<至少32位随机字符串>
JWT_REFRESH_SECRET=<至少32位随机字符串>
DISABLE_REGISTRATION=true       # 生产环境关闭注册
CORS_ORIGIN=https://your-domain.com
NODE_ENV=production
```

### 部署步骤

```bash
# 1. 运行数据库迁移
npx knex migrate:latest

# 2. 创建超级管理员
node scripts/seed-super-admin.js

# 3. 验证迁移
node --test tests/auth.test.js
node --test tests/permissions.test.js

# 4. 启动服务
npm start
```

### 日常维护

```bash
# 权限一致性巡检（建议每日 cron）
node scripts/audit-permissions.js

# 发现问题时自动修复
node scripts/audit-permissions.js --fix

# 迁移回滚（紧急情况）
npx knex migrate:rollback
```

---

## 项目结构

```
door/
├── server/
│   ├── src/
│   │   ├── app.js                      # Express 应用入口
│   │   ├── middleware/
│   │   │   ├── require-auth.js         # JWT 验证 + 角色映射
│   │   │   ├── require-roles.js        # 角色白名单守卫
│   │   │   ├── require-race-access.js  # 赛事级授权
│   │   │   └── rate-limiter.js         # 登录限流
│   │   └── modules/
│   │       ├── auth/                   # 认证模块
│   │       ├── admin/                  # 平台管理 API (super_admin)
│   │       ├── org/                    # 机构管理 API (org_admin)
│   │       ├── races/                  # 赛事模块
│   │       └── ...                     # 其他业务模块
│   ├── scripts/
│   │   ├── seed-super-admin.js         # 超管初始化
│   │   └── audit-permissions.js        # 权限巡检
│   └── tests/
│       ├── auth.test.js                # 认证测试
│       ├── permissions.test.js         # 权限场景测试
│       └── ...
├── src/                                # 前端 React
│   ├── views/admin/                    # 管理后台页面
│   ├── components/admin/               # 管理后台组件
│   ├── api/adminApi.js                 # 管理 API 封装
│   └── stores/authStore.js             # 认证状态管理
└── package.json
```
