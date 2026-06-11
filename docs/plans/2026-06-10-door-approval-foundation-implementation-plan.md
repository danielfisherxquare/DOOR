# ArcSpro Approval Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a reusable ArcSpro approval foundation and connect the first workflow: design request submission -> department owner approval -> race director approval -> design lead designer assignment.

**Architecture:** Keep race visibility in the existing race-access layer. Add race staff assignments as the source of event-specific posts, then add a small approval engine that creates approval instances and tasks for business records. Design requests call the approval engine on submit and receive status updates from approval decisions.

**Tech Stack:** Express, Knex migrations, PostgreSQL, node:test, Supertest/fetch, React, Axios, Vite.

---

### Task 1: Approval Resolver Unit Test

**Files:**
- Create: server/tests/approval-resolver.test.js
- Create later: server/src/modules/approvals/approval-resolver.service.js

**Step 1: Write the failing test**

Create a node:test suite that migrates the test DB, inserts an organization, race, users, team members, and race staff assignments.

Test cases:

- resolveRaceStaffApprovers returns the active department_owner for requester_department = 竞赛部.
- It excludes the requester when excludeRequester is true.
- It returns blocked with missing role details when no active race_director exists.

Minimal expected assertion shape:

~~~js
assert.deepEqual(result.status, 'ready');
assert.equal(result.approvers.length, 1);
assert.equal(result.approvers[0].roleKey, 'department_owner');
assert.equal(blocked.status, 'blocked');
assert.match(blocked.reason, /race_director/);
~~~

**Step 2: Run test to verify it fails**

Run:

~~~bash
cd /Users/xquare/scratch/door/server
DATABASE_URL=postgres://door:door_dev@localhost:5432/door_test npm test -- tests/approval-resolver.test.js
~~~

Expected: fail because the approval resolver and race staff table do not exist.

### Task 2: Race Staff Assignment Migration

**Files:**
- Create: server/src/db/migrations/20260610000004_create_race_staff_assignments.js

**Step 1: Add the table**

Create race_staff_assignments with:

- id uuid primary key
- org_id uuid not null
- race_id bigint not null
- team_member_id uuid not null
- user_id uuid nullable
- role_key text not null
- role_name text not null
- department_scope text nullable
- module_scope text nullable
- is_primary boolean default false
- status text default active
- starts_at timestamptz nullable
- ends_at timestamptz nullable
- created_by uuid nullable
- timestamps

Add indexes:

- org_id, race_id
- race_id, role_key, status
- race_id, department_scope, role_key
- user_id

Add status check: active, inactive, archived.

**Step 2: Run the failing resolver test again**

Expected: fail because service code does not exist yet, but schema errors are gone.

### Task 3: Approval Resolver Service

**Files:**
- Create: server/src/modules/approvals/approval-resolver.service.js

**Step 1: Implement minimal resolver**

Export:

~~~js
export async function resolveApprovers(context, step, businessRecord, trx = knex)
~~~

Support these first resolver types:

- race_staff_role
- race_staff_department_role

Rules:

- Filter by org_id, race_id, role_key, status = active.
- For department resolver, match department_scope to businessRecord.requester_department.
- Join team_members and users.
- Require an active bound account for assignable approval tasks.
- Exclude context.requesterUserId when step.exclude_requester is true.
- Return { status: 'ready', approvers: [...] } or { status: 'blocked', reason, missingRoleKey }.

**Step 2: Run resolver tests**

Expected: pass.

### Task 4: Approval Engine Migration

**Files:**
- Create: server/src/db/migrations/20260610000005_create_approval_foundation.js

**Step 1: Create tables**

Create:

- approval_definitions
- approval_steps
- approval_instances
- approval_tasks
- approval_events

Use the design document schema. Add foreign keys to organizations, races, and users where available. Use business_type + business_id indexes for fast lookup from modules.

**Step 2: Add seed-safe design workflow definition**

In the same migration or a focused seed helper, insert the default design request definition only when it does not already exist:

- business_type = design_request
- action_key = submit
- version 1
- status active

Steps:

1. department_owner_review
2. race_director_review
3. design_lead_assignment

**Step 3: Run migrations in the test DB**

Run:

~~~bash
cd /Users/xquare/scratch/door/server
DATABASE_URL=postgres://door:door_dev@localhost:5432/door_test npm test -- tests/approval-resolver.test.js
~~~

Expected: resolver tests still pass.

### Task 5: Approval Engine Service Tests

**Files:**
- Create: server/tests/approval-engine.test.js
- Create later: server/src/modules/approvals/approval.service.js

**Step 1: Write failing happy-path test**

Scenario:

~~~text
start approval for design_request
department owner approves
race director approves
design lead assigns designer
instance completes
~~~

Assertions:

- First pending task is assigned to department owner.
- After approval, next pending task is assigned to race director.
- After final approval, assignment task is assigned to design lead.
- Assignment action stores selected designer in task payload and completes the instance.
- approval_events contains started, task_created, approved, assigned, completed.

**Step 2: Write failing guard tests**

Cases:

- requester cannot approve own task.
- missing race director blocks the instance.
- reject completes the instance as rejected.
- request changes completes the current approval path with needs_info.

**Step 3: Run tests**

Expected: fail because approval.service.js does not exist.

### Task 6: Approval Engine Service

**Files:**
- Create: server/src/modules/approvals/approval.service.js

**Step 1: Implement core functions**

Export:

~~~js
startApproval(context, { businessType, businessId, actionKey, raceId, requesterUserId, businessRecord }, trx)
actOnTask(context, taskId, { action, comment, assignment }, trx)
getCurrentApprovalForBusiness(context, { businessType, businessId }, trx)
listMyApprovalTasks(context, filters)
~~~

**Step 2: Implement transactional behavior**

- startApproval creates one instance and creates the first step tasks.
- actOnTask validates current user eligibility.
- Approval advances to the next step.
- Rejection marks instance rejected.
- Request changes marks instance needs_info.
- Assignment completes the assignment task and the instance.
- Each change writes approval_events.

**Step 3: Run approval engine tests**

Expected: pass.

### Task 7: Approval API Routes

**Files:**
- Create: server/src/modules/approvals/approval.routes.js
- Modify: server/src/app.js

**Step 1: Add route tests**

Extend server/tests/approval-engine.test.js or create server/tests/approval.routes.test.js:

- GET /api/app/approvals/tasks returns only current user's pending tasks.
- POST /api/app/approvals/tasks/:taskId/approve completes a task.
- POST /api/app/approvals/tasks/:taskId/reject rejects a task.
- POST /api/app/approvals/tasks/:taskId/request-changes sends back for changes.
- POST /api/app/approvals/tasks/:taskId/assign assigns designer.

**Step 2: Implement routes**

Use the existing auth chain used by nearby modules. Every task action must also call service-level eligibility checks.

**Step 3: Run route tests**

Expected: pass.

### Task 8: Race Staff Admin Routes

**Files:**
- Create: server/src/modules/races/race-staff.routes.js
- Modify: server/src/modules/races/race.routes.js
- Test: server/tests/race-staff.routes.test.js

**Step 1: Write failing route tests**

Cases:

- org admin can list and create staff assignments for own race.
- assignment rejects a team member from another org.
- assignment rejects unbound login account when role requires approval actions.
- race viewer cannot create assignments.

**Step 2: Implement routes**

Mount under:

~~~text
/api/admin/races/:raceId/staff-assignments
~~~

Use requireRaceAccess('raceId') and require editor access.

**Step 3: Run tests**

Expected: pass.

### Task 9: Design Request Backend Integration

**Files:**
- Modify: server/src/modules/design-requests/design-request.service.js
- Modify: server/src/modules/design-requests/design-request.routes.js
- Modify: server/tests/design-requests.routes.test.js

**Step 1: Write failing design request workflow test**

Extend the existing design request route test:

1. Seed department owner, race director, design lead, and designer.
2. Submit a design request from ops.
3. Assert returned request includes currentApproval.currentStep = department_owner_review.
4. Approve as department owner.
5. Approve as race director.
6. Assign designer as design lead.
7. Assert design_requests.assigned_designer_id is set and status is approved.

**Step 2: Integrate createRequest**

Inside the existing transaction:

- Insert design request.
- Write existing design request history for compatibility.
- Call startApproval with businessType = design_request.
- If approval is blocked, keep pending_review and return blocked details.

**Step 3: Replace direct review path**

Keep /requests/:requestId/review temporarily, but make it call the approval engine or return a clear compatibility error unless current user owns a pending task. Avoid silently bypassing the new workflow.

**Step 4: Include current approval in list/detail**

Add currentApproval to mapped request payloads.

**Step 5: Run design request tests**

Expected: pass.

### Task 10: Frontend API Client

**Files:**
- Modify: src/services/designRequestApi.js
- Create: src/services/approvalApi.js

**Step 1: Add API helpers**

Add:

~~~js
listApprovalTasks(params)
approveApprovalTask(taskId, payload)
rejectApprovalTask(taskId, payload)
requestApprovalChanges(taskId, payload)
assignApprovalTask(taskId, payload)
listRaceStaffAssignments(raceId, params)
createRaceStaffAssignment(raceId, payload)
updateRaceStaffAssignment(raceId, assignmentId, payload)
deleteRaceStaffAssignment(raceId, assignmentId)
~~~

**Step 2: Run frontend build**

Expected first result: fail only if imports are unused or incorrect. Fix before UI work.

### Task 11: Frontend UI Integration

**Files:**
- Modify: src/views/design-requests/DesignRequestWorkspace.jsx
- Modify: src/views/design-requests/design-request-workspace.css
- Optional create: src/views/approvals/ApprovalTaskPanel.jsx

**Step 1: Add task panel**

Show pending task for current user:

- Design brief fields.
- Current step label.
- Approve, reject, request changes buttons for approval tasks.
- Designer selector and assign button for assignment tasks.

**Step 2: Add status timeline**

In the preview panel, show:

~~~text
部门负责人审批: 已通过 / 待处理 / 已退回
赛事总监终审: 待处理
设计负责人分派: 待处理
~~~

**Step 3: Add blocked state**

When backend returns missing role details, show:

~~~text
缺少赛事岗位：竞赛部 部门负责人。请在管理后台的赛事岗位中补充。
~~~

**Step 4: Run build**

Run:

~~~bash
cd /Users/xquare/scratch/door
npm run build
~~~

Expected: pass.

### Task 12: Admin Race Staff UI

**Files:**
- Modify candidate: src/views race management page after locating current race admin view.
- Modify or create CSS near the selected page.

**Step 1: Locate race admin UI**

Use:

~~~bash
cd /Users/xquare/scratch/door
rg -n "赛事管理|Race|race management|races" src/views src/components
~~~

**Step 2: Add staff assignment matrix**

Columns:

- 岗位
- 部门范围
- 人员
- 登录账号
- 状态
- 操作

**Step 3: Add required-post warnings**

For design request workflow, warn when missing:

- department_owner
- race_director
- design_lead

**Step 4: Run build**

Expected: pass.

### Task 13: Local Migration And End-To-End Validation

**Files:**
- No code files unless validation exposes bugs.

**Step 1: Run local migrations**

Run:

~~~bash
cd /Users/xquare/scratch/door/server
npm run migrate
~~~

Expected: migrations complete without table errors.

**Step 2: Start or reuse local services**

Backend should be on 127.0.0.1:3011; frontend should be on 127.0.0.1:5174. If either port is occupied by the correct server, reuse it.

**Step 3: Seed or create staff assignments**

For race 1, create:

- one department_owner for the request department
- one race_director
- one design_lead
- one design_designer

**Step 4: Browser validation**

Use the in-app browser:

1. Open http://127.0.0.1:5174/ops/design-requests?orgId=ddb44e75-34b5-4afc-9be3-ece255cffc9f&raceId=1.
2. Submit or import a design request.
3. Verify the preview shows 部门负责人审批.
4. Switch to the approver account or admin route and approve as department owner.
5. Approve as race director.
6. Assign designer as design lead.
7. Verify the designer can start design and upload deliverable.

**Step 5: Final tests**

Run:

~~~bash
cd /Users/xquare/scratch/door/server
DATABASE_URL=postgres://door:door_dev@localhost:5432/door_test npm test -- tests/approval-resolver.test.js tests/approval-engine.test.js tests/race-staff.routes.test.js tests/design-requests.routes.test.js

cd /Users/xquare/scratch/door
npm run build
~~~

Expected: all targeted backend tests pass and frontend build passes.
