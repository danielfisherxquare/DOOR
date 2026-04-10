# DOOR 发票报销模块自动化测试计划

## 一、测试目标

验证 DOOR 项目应用层发票报销模块的完整用户流程：

| 序号 | 测试项 | 预期结果 |
|:---:|--------|----------|
| 1 | 上传识别发票 | OCR 正确识别发票代码、号码、日期、金额等字段 |
| 2 | 上传识别付款凭证 | OCR 正确识别付款金额、日期、收款方等字段 |
| 3 | 汇总为表格 | 所有记录正确显示，字段完整，统计准确 |
| 4 | 导出为表格 + 命名文件 | 导出文件命名正确，内容完整可打开 |

## 二、测试范围

### 2.1 包含的功能

- ✅ 用户登录认证
- ✅ 项目管理（创建、切换）
- ✅ 发票上传与 OCR 识别
- ✅ 付款凭证上传与 OCR 识别
- ✅ 报销明细表格展示
- ✅ 数据导出（Excel、ZIP）

### 2.2 不包含的功能

- ❌ 后端 OCR 服务性能测试
- ❌ 大批量数据压力测试
- ❌ 跨浏览器兼容性测试
- ❌ 移动端适配测试

## 三、测试环境

### 3.1 硬件要求

- CPU: 2 核心以上
- 内存：4GB 以上
- 磁盘：1GB 可用空间

### 3.2 软件要求

| 组件 | 版本要求 |
|------|----------|
| Node.js | 18+ |
| Playwright | 1.52+ |
| Chromium | Playwright 自带 |

### 3.3 应用环境

| 环境 | URL | 用途 |
|------|-----|------|
| 本地开发 | http://localhost:5173 | 开发调试 |
| 测试环境 | TBD | 集成测试 |
| 预发布 | TBD | 上线前验证 |

## 四、测试数据

### 4.1 测试账号

```json
{
  "username": "test@example.com",
  "password": "TestPassword123!"
}
```

### 4.2 测试文件

| 文件名 | 类型 | 用途 |
|--------|------|------|
| invoice-sample.jpg | JPG | 测试发票上传 |
| payment-receipt.png | PNG | 测试付款凭证上传 |

### 4.3 数据清理

每次测试会创建唯一项目名称（带时间戳），测试完成后需手动清理。

## 五、测试策略

### 5.1 测试类型

| 类型 | 工具 | 频率 |
|------|------|------|
| 端到端测试 | Playwright | 每次变更 |
| 回归测试 | Playwright | 每周 |
| 冒烟测试 | Playwright | 每日构建 |

### 5.2 测试优先级

| 优先级 | 测试场景 |
|--------|----------|
| P0 | 登录、上传发票、导出 |
| P1 | 上传付款凭证、表格展示 |
| P2 | 编辑记录、删除记录 |

### 5.3 通过标准

- 所有 P0 测试用例必须通过
- P1 测试用例通过率 ≥ 90%
- 无阻塞性问题

## 六、测试执行

### 6.1 准备工作

```bash
# 1. 安装依赖
cd door
npm install

# 2. 安装 Playwright
npx playwright install chromium

# 3. 准备测试数据
# 复制测试发票和付款凭证到 fixtures/ 目录
```

### 6.2 执行测试

```bash
# 运行完整测试
npm run test:reimbursement

# 无头模式运行
npm run test:reimbursement:headless
```

### 6.3 结果分析

测试完成后检查：
1. 控制台输出的测试结果
2. `screenshots/` 目录的截图
3. `test-report-*.json` 测试报告

## 七、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 测试环境不稳定 | 测试失败 | 使用本地环境测试 |
| 测试数据缺失 | 无法执行 | 提前准备占位数据 |
| UI 变更导致定位失败 | 测试失败 | 使用稳定的选择器 |
| OCR 服务不可用 | 识别失败 | 跳过 OCR 验证步骤 |

## 八、交付物

### 8.1 测试脚本

- `reimbursement-e2e.test.js` - 端到端测试主脚本

### 8.2 测试报告

- `test-report-*.json` - JSON 格式测试报告
- `screenshots/` - 测试过程截图

### 8.3 文档

- `README.md` - 测试使用说明
- `TEST_PLAN.md` - 本文档

## 九、附录

### 9.1 关键 UI 元素定位

| 元素 | 选择器 |
|------|--------|
| 上传发票按钮 | `button:has-text("上传发票")` |
| 上传付款凭证按钮 | `button:has-text("上传付款凭证")` |
| 报销明细标签 | `button:has-text("报销明细")` |
| 导出按钮 | `button:has-text("导出 Excel")` |
| 表格 | `.reimbursement-table` |

### 9.2 API 端点

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/app/reimbursements/invoices/upload/:projectId` | POST | 上传发票 |
| `/api/app/reimbursements/invoices/upload-payment/:projectId` | POST | 上传付款凭证 |
| `/api/app/reimbursements/projects/:id/records` | GET | 获取记录 |
| `/api/app/reimbursements/export` | POST | 导出 Excel |

### 9.3 修订历史

| 版本 | 日期 | 作者 | 变更内容 |
|------|------|------|----------|
| 1.0 | 2026-03-30 | AI Assistant | 初始版本 |