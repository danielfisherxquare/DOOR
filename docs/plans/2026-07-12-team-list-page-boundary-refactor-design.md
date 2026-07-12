# TeamListPage 边界拆分设计

**状态：** 已批准  
**日期：** 2026-07-12  
**范围：** `src/views/admin/TeamListPage.jsx`

## 目标

在不改变页面外观、路由、API 或业务流程的前提下，把当前 1075 行页面中的三类独立职责移出 React 页面：

1. 工号序列、默认表单和导入行归一化；
2. 团队成员模板的 XLSX 生成与上传文件解析；
3. 成员照片的鉴权加载、2:3 校验和 Blob URL 生命周期。

完成后，`TeamListPage.jsx` 只负责筛选状态、成员增删改/API 编排、表格和弹窗交互，文件行数不得超过 925 行。

## 不变项

- 路由、查询参数和 `adminApi` 方法签名不变。
- 页面 DOM、现有 CSS、文案、筛选项、分页和弹窗操作不变。
- 导入模板仍包含标题行、字段说明行和样例数据，工作表名称仍为 `团队成员模板`。
- 导入仍先预览重复工号，再提交；空文件继续报 `导入文件没有有效数据`。
- 照片仍要求 2:3 竖幅；加载失败继续显示原占位内容。
- 本批不拆表格、弹窗或页面状态 hook，不引入新的设计系统。

## 选定方案

采用中等拆分。与“只抽纯函数”相比，它同时移除 XLSX 和照片资源生命周期；与“全面组件化”相比，它不重排 JSX 和状态关系，回归面更小。

### `teamListPageData.js`

负责无浏览器依赖的稳定数据逻辑：

```js
export const EMPTY_TEAM_MEMBER_FORM = { ... }
export function buildEmployeeCodeOptions(codes, currentCode) { ... }
export function normalizeTeamImportRows(rows, columns) { ... }
```

输入示例：`['STA001', 'STA003']`。输出必须包含 `STA002`，并把已有工号标记为 `occupied: true`。导入归一化把中文标题映射为后端字段 key，并删除全空行。

### `teamMemberWorkbook.js`

该模块是页面与 `xlsx` 的唯一边界：

```js
export function writeTeamImportTemplate({ columns, sampleRows, fileName }) { ... }
export function parseTeamImportWorkbook(buffer, columns) { ... }
```

页面不再直接导入 `xlsx`。解析函数只返回规范化行；重复工号检查和提交仍由现有 API 流程完成。

### `TeamMemberPhoto.tsx`

照片组件使用明确的 props：

```ts
interface TeamMemberPhotoProps {
  teamMemberId: string | number
  hasPhoto: boolean
  orgId?: string
  alt: string
  style?: React.CSSProperties
  placeholder: React.ReactNode
}
```

组件内部读取当前 token，调用 `adminApi.getTeamMemberPhoto`，创建 Blob URL，并在依赖变化或卸载时释放 URL。页面上传预览使用的文件校验与 URL 释放辅助函数也放在该文件中导出，避免两套资源清理规则。

## 数据流

```text
筛选与表单操作
  -> TeamListPage 状态/API 编排
  -> adminApi

下载模板
  -> TeamListPage 获取模板元数据
  -> teamMemberWorkbook 写入 XLSX

上传名单
  -> teamMemberWorkbook 解析首个工作表
  -> teamListPageData 归一化标题与空行
  -> TeamListPage 调用 preview/commit API

显示照片
  -> TeamMemberPhoto 获取 token 和 Blob
  -> object URL
  -> 依赖变化或卸载时 revoke
```

## 错误处理

- XLSX 无工作表、无有效行或无法解析时，错误继续进入页面现有 `setMessage(error.message)` 路径。
- 照片尺寸或比例不合格时保留现有中文错误文案。
- 远程照片读取失败不抛到页面，仍显示占位内容。
- API 成功响应判断、初始密码提示、照片部分成功提示和导入统计文案保持原样。

## 测试与门禁

新增测试必须先观察 RED，再实现 GREEN：

- `tests/admin/teamListPageData.test.mjs`：工号补位、占用标记、当前编辑工号和导入行归一化。
- `tests/admin/teamMemberWorkbook.test.mjs`：模板标题/说明/样例行和首个工作表解析。
- `tests/admin/teamListPageArchitecture.test.mjs`：页面不直接导入 `xlsx`、使用独立照片组件、行数不超过 925。

批次验收命令：

```bash
node --test tests/admin/teamListPageData.test.mjs \
  tests/admin/teamMemberWorkbook.test.mjs \
  tests/admin/teamListPageArchitecture.test.mjs
npm run format:check
npm run lint -- --quiet
npm run typecheck
npm test
npm run check:encoding
npm run check:secrets
npm run build
git diff --check
```

最终提交还要在独立干净工作树重复运行定向测试、333 项根测试和生产构建。
