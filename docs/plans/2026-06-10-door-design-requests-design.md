# ArcSpro 设计需求协同应用设计

## 目标

在 ArcSpro 基座中新增“设计需求协同”应用。执行层负责提交设计需求，管理层负责审核和模板管理，应用层负责设计师查看、统计、处理和上传完成图示。

本期采用 A 方案：主管审核通过前，设计师不能接单、处理或上传成品。设计师只处理已审批需求。

## 参考系统提炼

成熟创意工作流系统通常有五个共同点：

- 标准化表单：提交人必须填写需求、参考样例、尺寸、材质、截止时间等字段。
- 审批门禁：提交后先由主管审核，通过后进入生产。
- 状态流：需求按新建、待审核、已通过、设计中、已上传、已交付等状态推进。
- 表格和仪表盘：管理者和设计师通过表格、状态统计、截止时间发现风险。
- 文件版本：参考样例和完成图示作为资产保存，后续可以复用为模板。

## 三层入口

### 执行层 /ops/design-requests

面向各部门提交人。

可见行为：

- 选择当前赛事和赛事项目类型。
- 使用赛事模板生成提交表单。
- 填写具体需求、参考样例、尺寸、材质、需求时间、优先级。
- 表格查看当前赛事所有设计需求。
- 已提交记录显示审批状态和设计进度。

### 管理层 /admin/design-requests

面向项目主管和管理员。

可见行为：

- 查看待审核需求。
- 审核通过、驳回、要求补充。
- 分配设计师、设置优先级、记录审核意见。
- 为马拉松、越野赛、水上项目、定向赛维护默认模板。
- 在赛事创建/编辑后按赛事类型自动使用默认模板。
- 将实际提交过的需求另存为赛事模板。

### 应用层 /app/design-requests

面向设计师。

可见行为：

- 顶部统计卡片：待处理、设计中、今日到期、本周交付。
- 表格查看已审批需求。
- 详情预览：需求、参考样例、尺寸、材质、需求时间、赛事、提交部门、审核意见。
- 将需求标记为设计中。
- 上传完成图示，保留版本和备注。
- 查看完成图示历史。

## 数据模型

### design_request_templates

赛事或组织级模板。

关键字段：

- id
- org_id
- race_id
- event_type: marathon, trail, aquatic, orienteering, general
- name
- description
- fields_json: 模板字段定义
- sample_payload_json: 示例需求
- source_request_id: 从需求沉淀模板时记录来源
- is_default
- created_by
- created_at, updated_at

### design_requests

设计需求主表。

关键字段：

- id
- org_id
- race_id
- template_id
- event_type
- requester_department
- requester_name
- title
- requirement_text
- reference_notes
- size_spec
- material_spec
- due_at
- priority
- status
- assigned_designer_id
- reviewer_id
- review_comment
- approved_at
- created_by
- created_at, updated_at

状态：

submitted -> pending_review -> approved -> in_design -> design_uploaded -> delivered -> archived

pending_review 也可以转为 needs_info 或 rejected。

MVP 中创建接口直接产生 pending_review 状态，不开放草稿。

### design_request_assets

附件和图示版本。

关键字段：

- id
- request_id
- asset_type: reference 或 deliverable
- file_name
- file_url
- mime_type
- note
- version
- uploaded_by
- created_at

MVP 先存 URL 或 data URL 字符串，不引入新的对象存储链路。

### design_request_reviews

审核和状态历史。

关键字段：

- id
- request_id
- action: submit, approve, reject, needs_info, start_design, upload_deliverable, deliver
- from_status
- to_status
- comment
- actor_id
- created_at

## API

三层共享同一业务服务，按入口挂载权限：

- /api/ops/design-requests
- /api/admin/design-requests
- /api/app/design-requests

核心接口：

- GET /templates?raceId=&eventType=
- POST /templates
- POST /templates/from-request/:requestId
- GET /requests?raceId=&status=&eventType=
- GET /requests/:requestId
- POST /requests
- POST /requests/:requestId/review
- POST /requests/:requestId/start
- POST /requests/:requestId/assets
- GET /stats?raceId=

提交请求示例字段：

- raceId: 12
- eventType: marathon
- requesterDepartment: 招商部
- requesterName: 李华
- title: 完赛奖牌主视觉延展
- requirementText: 需要用于奖牌盒、背景板和社媒海报的统一视觉。
- referenceNotes: 参考 2025 杭州马拉松蓝金配色。
- sizeSpec: 海报 1080x1920，背景板 6m x 3m
- materialSpec: 喷绘布、覆膜贴纸
- dueAt: 2026-07-05T18:00:00.000Z
- priority: high
- referenceAssets: reference.jpg

审批请求示例字段：

- action: approve
- comment: 需求完整，先出主视觉方向。
- assignedDesignerId: user-42

## 权限边界

- 执行层可创建和查看赛事范围内需求。
- 管理层可审核、维护模板、另存模板。
- 应用层设计师只能开始处理已审批需求，不能处理 pending_review、rejected、needs_info 状态。
- 所有接口保留 org_id 和 race_id，沿用 ArcSpro 现有赛事上下文。

## 验收场景

1. 管理员为马拉松赛事维护默认模板。
2. 执行层提交“完赛奖牌主视觉延展”需求。
3. 管理层看到待审核需求，审批通过并分配设计师。
4. 应用层设计师看到该需求，详情页展示完整 brief 和参考样例。
5. 设计师点击开始设计，上传完成图示。
6. 三层表格同步显示 design_uploaded 状态。
