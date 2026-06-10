# DOOR 设计协同清单导入设计

## 目标

执行端支持上传各部门通用的“搭建&设计清单”Excel。系统识别整张协同清单，保留搭建上下文；其中 设计=✅ 的行同步为设计需求。缺少需求部门、需求人、交付时间的设计行进入待补齐状态，不直接送主管审核。

## 样表结构

源文件：/Users/xquare/Desktop/搭建&设计清单.xlsx

工作表：搭建&设计 清单

关键列：

| 列 | 表头 | 用途 |
| --- | --- | --- |
| B | 使用区域 | 场地区块/分组 |
| C | 供方 | 搭建、计时、人工、运输等责任方 |
| D | 类别 | 租赁、采购等 |
| E | 项目 | 清单项目，也作为设计需求标题基础 |
| F | 材质 | 搭建材质 |
| G | 制作工艺 | 工艺或结构说明 |
| H | 搭建尺寸 | 搭建尺寸 |
| I/J | 数量/单位 | 物料数量 |
| K/L | 单价/总价 | 成本信息 |
| M | 搭建备注 | 搭建侧备注 |
| N | 设计 | ✅ 表示需要生成设计需求 |
| O/P | 需求部门/需求人 | 设计需求提交人信息 |
| Q | 交付时间 | 设计需求时间 |
| R | 优先级 | 设计优先级 |
| S/T | 材质/设计尺寸 | 设计侧材质和尺寸 |
| U | 设计备注 | 具体设计需求 |
| V/W | 设计参考图/设计参考说明 | 参考样例 |

样表观察：

- 共 90 条有效清单行；Excel 底部存在只有公式残留的空行，不纳入导入展示。
- 21 条 设计=✅。
- 样表没有内嵌图片。
- 样表的 需求部门、需求人、交付时间、优先级 均为空。
- 使用区域 有合并单元格，需要解析时向下填充；未合并但空白的行可沿用最近一个区域。

## 执行端体验

/ops/design-requests 从单一提交表单升级为“协同清单工作台”。

布局：

1. 顶部：Excel 上传与导入状态。
2. 左侧主表：协同清单行，按使用区域、是否需设计、同步状态筛选。
3. 右侧详情：选中行的搭建信息和设计信息。
4. 底部/侧边：识别汇总，显示总行数、设计行数、待补齐、可同步、已同步。

可见状态：

- ignored：非设计行，仅保留为搭建上下文。
- needs_info：设计行缺少部门、人、交付时间等必填项。
- ready：设计行字段完整，可同步。
- synced：已生成或关联设计需求。
- error：解析或同步失败。

## 数据模型

新增 design_collaboration_imports。

关键字段：

- id
- org_id
- race_id
- event_type
- file_name
- file_hash
- sheet_name
- status
- row_count
- design_count
- ready_count
- needs_info_count
- synced_count
- issue_summary_json
- created_by
- created_at
- updated_at

新增 design_collaboration_items。

关键字段：

- id
- import_id
- org_id
- race_id
- excel_row_number
- row_hash
- area
- supplier
- category
- item_name
- build_material
- craft
- build_size
- quantity
- unit
- unit_price
- total_price
- build_note
- needs_design
- requester_department
- requester_name
- due_at
- priority
- design_material
- design_size
- design_note
- reference_image
- reference_note
- sync_status
- sync_issues_json
- design_request_id
- raw_json
- created_at
- updated_at

同步到 design_requests 时：

- title = 使用区域 + 项目
- requirement_text = 设计备注，空时使用 项目 + 工艺 + 搭建备注 组合。
- size_spec = 设计尺寸，空时使用 搭建尺寸。
- material_spec = 设计材质，空时使用 材质 或 制作工艺。
- reference_notes = 设计参考说明。
- priority = 表格优先级，空值默认为 normal。
- status = 字段完整时 pending_review；缺字段不创建设计需求。

## API

预览导入：

    POST /api/ops/design-requests/imports/preview
    Content-Type: multipart/form-data
    file=<xlsx>
    raceId=1
    eventType=marathon

响应：

    {
      "success": true,
      "data": {
        "importId": "uuid",
        "rowCount": 90,
        "designCount": 21,
        "readyCount": 0,
        "needsInfoCount": 21,
        "items": [
          {
            "excelRowNumber": 3,
            "area": "小票打印",
            "itemName": "门楣",
            "needsDesign": true,
            "syncStatus": "needs_info",
            "syncIssues": ["需求部门为空", "需求人为空", "交付时间为空"]
          }
        ]
      }
    }

补齐导入行：

    PATCH /api/ops/design-requests/imports/{importId}/items/{itemId}
    Content-Type: application/json
    {
      "requesterDepartment": "竞赛部",
      "requesterName": "李华",
      "dueAt": "2026-07-05T18:00:00.000Z",
      "priority": "high",
      "designNote": "门楣需包含赛事 logo 和区域名称"
    }

确认同步：

    POST /api/ops/design-requests/imports/{importId}/commit
    Content-Type: application/json
    {
      "itemIds": ["uuid"]
    }

导入列表：

    GET /api/ops/design-requests/imports?raceId=1

导入详情：

    GET /api/ops/design-requests/imports/{importId}

## 错误处理

- 文件不是 .xlsx：返回 400。
- 找不到表头行：返回 400，并提示需要的列名。
- raceId 不存在或无赛事权限：沿用 requireRaceAccess。
- 同一文件重复上传：允许创建新批次，但行级 row_hash 用于避免 commit 时重复生成需求。
- commit 时仍缺必填字段：跳过该行，返回 skippedItems 和原因。

## 验收

1. 上传样表后识别 90 条有效行、21 条设计行。
2. 样表 21 条设计行因缺少部门、人、交付时间进入 needs_info。
3. 执行端表格能按“需设计/待补齐/非设计项”筛选。
4. 补齐一条设计行后 commit，生成一条 pending_review 设计需求。
5. 管理端能看到该需求并走原审批流程。
6. 应用端仍只看到审批通过后的设计任务。
