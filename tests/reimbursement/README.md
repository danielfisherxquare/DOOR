# ArcSpro 发票报销模块自动化测试

## 概述

本测试套件用于验证 ArcSpro 项目发票报销模块的全流程功能：

1. ✅ 正确上传识别发票
2. ✅ 正确上传识别付款凭证
3. ✅ 正确汇总为表格
4. ✅ 正确导出为表格 + 命名后的文件

## 目录结构

```
door/tests/reimbursement/
├── README.md                      # 本文档
├── reimbursement-e2e.test.js      # 端到端测试主脚本
├── fixtures/                      # 测试数据文件
│   ├── test-credentials.json      # 测试账号配置
│   ├── invoice-sample.jpg         # 测试发票图片（需准备）
│   └── payment-receipt.png        # 测试付款凭证（需准备）
└── screenshots/                   # 测试截图和报告（自动生成）
    ├── login-page-*.png
    ├── reimbursement-page-*.png
    ├── invoice-uploaded-*.png
    ├── payment-uploaded-*.png
    ├── records-table-*.png
    ├── test-report-*.json         # 测试报告
    └── ...
```

## 环境要求

- Node.js 18+
- Playwright
- 运行中的 ArcSpro 应用（本地或测试环境）

## 安装

```bash
# 进入 door 目录
cd door

# 安装 Playwright（如果尚未安装）
npm install -D playwright

# 安装 Playwright 浏览器
npx playwright install chromium
```

## 配置

### 方式 1：使用默认配置

编辑 `fixtures/test-credentials.json`：

```json
{
  "username": "your-test-email@example.com",
  "password": "your-test-password",
  "testProjectName": "自动化测试项目"
}
```

### 方式 2：使用环境变量

```bash
export ARCSPRO_TEST_URL=http://localhost:5173
export ARCSPRO_TEST_USERNAME=test@example.com
export ARCSPRO_TEST_PASSWORD=TestPassword123!
```

## 准备测试数据

### 发票测试文件

准备一张测试发票图片，保存到 `fixtures/invoice-sample.jpg`：
- 支持格式：JPG、PNG、PDF
- 文件大小：最大 20MB
- 内容：应包含清晰的发票代码、发票号码、金额、日期等信息

### 付款凭证测试文件

准备一张付款凭证截图，保存到 `fixtures/payment-receipt.png`：
- 支持格式：PNG、JPG
- 内容：银行转账记录、支付截图等

## 运行测试

### 运行完整测试

```bash
cd door
node tests/reimbursement/reimbursement-e2e.test.js
```

### 使用自定义配置运行

```bash
ARCSPRO_TEST_URL=http://localhost:3000 \
ARCSPRO_TEST_USERNAME=admin@example.com \
ARCSPRO_TEST_PASSWORD=admin123 \
node tests/reimbursement/reimbursement-e2e.test.js
```

### 无头模式运行（CI/CD）

编辑 `reimbursement-e2e.test.js`，将：
```javascript
headless: false,  // 改为
headless: true,
```

## 测试流程

测试将自动执行以下步骤：

### 1. 登录系统
- 打开登录页面
- 输入测试账号
- 验证登录成功并跳转

### 2. 创建项目
- 导航到发票报销页面
- 检查是否需要创建新项目
- 创建测试专用项目

### 3. 上传发票
- 点击"上传发票"按钮
- 上传测试发票文件
- 等待 OCR 识别完成
- 验证识别结果

### 4. 上传付款凭证
- 点击"上传付款凭证"按钮
- 上传测试付款凭证
- 等待 OCR 识别完成
- 验证识别结果

### 5. 汇总表格
- 切换到"报销明细"标签
- 验证表格显示正确
- 检查字段完整性
- 验证统计信息

### 6. 导出文件
- 点击"导出 Excel"按钮
- 验证下载文件
- 检查文件名格式
- 验证文件大小

## 测试结果

测试完成后会生成：

### 截图文件
- `login-page-*.png` - 登录页面截图
- `reimbursement-page-*.png` - 报销页面截图
- `invoice-uploaded-*.png` - 发票上传后截图
- `payment-uploaded-*.png` - 付款凭证上传后截图
- `records-table-*.png` - 表格详情截图
- `after-export-*.png` - 导出后截图

### 测试报告 (JSON)

```json
{
  "timestamp": "2026-03-30T12:00:00.000Z",
  "tests": [
    { "name": "登录系统", "passed": true },
    { "name": "创建项目", "passed": true },
    { "name": "上传发票", "passed": true },
    { "name": "上传付款凭证", "passed": true },
    { "name": "汇总表格", "passed": true },
    { "name": "导出文件", "passed": true }
  ],
  "screenshots": [...],
  "issues": []
}
```

## 问题排查

### 登录失败
- 确认测试账号存在且有权限
- 检查 ArcSpro 应用是否正常运行
- 查看浏览器控制台错误信息

### 上传失败
- 确认测试文件存在且格式正确
- 检查文件大小是否超过限制
- 确认 OCR 服务配置正确

### 导出失败
- 确认表格中有数据
- 检查后端导出服务是否正常
- 查看网络请求响应

## 与其他工具集成

### Playwright MCP

如果您使用 Playwright MCP，可以在测试调试时使用 AI 辅助：

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

### CI/CD 集成

```yaml
# GitHub Actions 示例
- name: Run Reimbursement Tests
  run: |
    cd door
    npm install -D playwright
    npx playwright install chromium
    node tests/reimbursement/reimbursement-e2e.test.js
  env:
    ARCSPRO_TEST_URL: ${{ secrets.ARCSPRO_TEST_URL }}
    ARCSPRO_TEST_USERNAME: ${{ secrets.ARCSPRO_TEST_USERNAME }}
    ARCSPRO_TEST_PASSWORD: ${{ secrets.ARCSPRO_TEST_PASSWORD }}
```

## 扩展测试

可以基于此脚本扩展更多测试场景：

- 批量上传多张发票
- 测试发票与付款凭证匹配功能
- 测试编辑报销记录功能
- 测试删除记录功能
- 测试不同用户角色权限
- 测试错误处理和边界情况

## 注意事项

1. 测试会创建浏览器窗口并实际操作 UI，请勿在测试过程中干扰
2. 测试数据会在每次运行时创建唯一项目名称，避免冲突
3. 测试完成后建议清理创建的测试项目
4. 生产环境测试请谨慎使用，避免污染真实数据