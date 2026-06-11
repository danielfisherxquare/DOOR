# ArcSpro "我的赛事" 名单导入到抽签结束端到端测试

本测试套件用于验证 ArcSpro 项目中"我的赛事"模块从名单导入到抽签结束的完整流程。

## 测试流程

1. **登录系统** - 验证用户登录功能
2. **导航到导入页面** - 访问名单导入页面
3. **选择赛事** - 选择目标赛事
4. **上传测试名单** - 上传包含 1200+ 参赛者的 Excel 文件
5. **字段映射** - 将 Excel 列映射到系统标准字段
6. **数据清洗** - 执行数据去重和规范化
7. **预览确认导入** - 预览数据并确认导入
8. **导航到抽签页面** - 访问抽签管理页面
9. **配置抽签容量** - 设置项目目标人数和抽签率
10. **配置起点沙盘** - 配置起跑区信息
11. **配置成绩筛选** - 设置成绩达标门槛
12. **执行最终抽签** - 执行抽签算法
13. **验证抽签结果** - 验证中签/未中签统计

## 前置条件

### 1. 启动后端服务

```bash
cd server
docker-compose up -d
# 或者本地运行
npm run dev
```

### 2. 启动前端服务

```bash
cd ..
npm run dev
```

### 3. 准备测试账号

确保有一个有效的测试账号，或者使用环境变量配置：

```bash
export ARCSPRO_TEST_USERNAME=your-email@example.com
export ARCSPRO_TEST_PASSWORD=your-password
```

## 运行测试

### 生成测试数据（可选，已预生成 1200 人）

```bash
node tests/event-lottery/generate-test-data.js 1200
```

### 运行端到端测试

```bash
# 使用默认配置（有头模式，可观察测试过程）
node tests/event-lottery/event-lottery-e2e.test.js

# 指定测试服务器地址
URL=http://127.0.0.1:5173 node tests/event-lottery/event-lottery-e2e.test.js

# 无头模式（CI 环境）
cross-env HEADLESS=true node tests/event-lottery/event-lottery-e2e.test.js
```

### 添加 npm 脚本（可选）

在 `package.json` 中添加：

```json
{
  "scripts": {
    "test:event-lottery": "node tests/event-lottery/event-lottery-e2e.test.js",
    "test:event-lottery:headless": "cross-env HEADLESS=true node tests/event-lottery/event-lottery-e2e.test.js",
    "test:generate-data": "node tests/event-lottery/generate-test-data.js"
  }
}
```

## 测试输出

### 截图

所有测试截图保存在 `tests/event-lottery/screenshots/` 目录下。

### 测试报告

测试完成后会生成 JSON 格式的报告：
- 位置：`tests/event-lottery/screenshots/test-report-{timestamp}.json`
- 内容：
  - 每个测试用例的通过/失败状态
  - 截图路径
  - 发现的问题
  - 抽签结果指标

## 测试数据说明

生成的测试数据包含以下字段：
- 姓名
- 身份证号
- 性别
- 出生日期
- 手机号
- 参赛项目（全程马拉松、半程马拉松、健康跑、家庭跑）
- 服装尺码
- 城市
- 紧急联系人
- 紧急联系人电话
- 邮箱
- 证件类型
- 国籍
- 民族

默认生成 1200 条记录，性别比例约为 1:1，项目分布符合实际赛事报名情况。

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `ARCSPRO_TEST_URL` | 测试服务器地址 | `http://127.0.0.1:5173` |
| `URL` | 测试服务器地址（备用） | `http://127.0.0.1:5173` |
| `ARCSPRO_TEST_USERNAME` | 测试账号用户名 | `test@example.com` |
| `ARCSPRO_TEST_PASSWORD` | 测试账号密码 | `TestPassword123!` |

## 故障排除

### 测试超时

如果抽签执行超时，可以增加 `TIMEOUT` 值：

```javascript
const TIMEOUT = 600000; // 10 分钟
```

### 元素找不到

如果页面元素选择器不匹配，需要更新测试脚本中的选择器：

```javascript
// 例如更新登录表单选择器
const usernameInput = page.locator('#username'); // 修改为实际选择器
```

### 赛事不存在

如果当前没有可用赛事，需要先手动创建一个赛事，或者在测试中添加创建赛事的步骤。

## 注意事项

1. 测试使用真实浏览器（有头模式），便于观察测试过程
2. 测试会在每个步骤后截图，便于问题排查
3. 测试数据会实际写入数据库，请在测试环境运行
4. 抽签执行可能需要较长时间，请耐心等待
