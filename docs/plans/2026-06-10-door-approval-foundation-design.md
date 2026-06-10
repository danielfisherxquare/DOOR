# DOOR Approval Foundation Design

## Goal

Introduce a system-level approval foundation for DOOR. The first business flow is design request approval:

~~~text
需求方提交设计需求
  -> 部门负责人审批
  -> 赛事总监终审
  -> 设计负责人分派设计师
  -> 设计师开始设计并上传完成图示
~~~

This should become reusable infrastructure for later modules such as credential requests, reimbursements, procurement, inventory changes, and race publish gates.

## Reference Patterns

- Jira Service Management attaches approval steps to workflow statuses. Each step defines when approval is required, the approver source, approve or decline transitions, and excluded approvers.
- ServiceNow separates gating approvals from in-process approvals. A request can be blocked before execution starts, then continue through later process approvals.
- Power Automate models approval as a task inside a flow. The flow notifies approvers and waits for the response before it continues.
- Camunda user tasks separate human work from business data. A task can be assigned to a named user, candidate users, or candidate groups, and assignments can be resolved from expressions.
- Odoo Studio lets a button action require one or more approval steps, ordered by step number, with exclusive approval to prevent the same person approving multiple steps on the same record.
- Oracle approval workflow guidance starts with participants: named users, job-function roles, and approval groups.

Reference links:

- Jira Service Management: https://support.atlassian.com/jira-service-management-cloud/docs/add-an-approval-to-a-workflow/
- ServiceNow approvals: https://www.servicenow.com/docs/r/servicenow-platform/approvals/c_ApprovalRules.html
- Power Automate approvals: https://learn.microsoft.com/en-us/power-automate/get-started-approvals
- Camunda user tasks: https://docs.camunda.io/docs/components/modeler/bpmn/user-tasks/
- Odoo approval rules: https://www.odoo.com/documentation/19.0/applications/studio/approval_rules.html
- Oracle approval workflow participants: https://docs.oracle.com/en/cloud/saas/project-management/fawpm/key-components-of-approval-workflows.html

## Current DOOR Context

Existing useful foundations:

- server/src/modules/races/race-access.service.js resolves whether a user can access or edit a race through organization ownership, organization grants, and user race assignments.
- server/src/middleware/require-race-access.js guards race-scoped routes.
- server/src/utils/data-scope.js already treats race_admin as assigned-race scoped.
- server/src/utils/capability-policy.js has global scoped capabilities such as race:approve, but those are role-level capabilities, not event staff assignments.
- team_members stores organization people, department, position, member type, and account binding.
- project_task_assignees shows how task assignment can snapshot people from team_members.
- credential_role_templates.requires_review and credential_categories.requires_review show per-race module configuration, but review still uses org_admin/super_admin.
- design_requests has status, reviewer_id, review_comment, and design_request_reviews; this is module-local review history, not a reusable approval engine.

Main gap:

~~~text
Current model:
  who can access a race
  who is an org/platform admin
  who is in the organization staff list

Missing model:
  who is appointed to which post in a specific race
  which post can approve which business action
  which approval task is currently waiting for which person
~~~

## Recommended Architecture

Use a lightweight DOOR approval engine, not an external BPMN engine for the first version.

~~~text
Business module
  design_requests / credential_requests / reimbursement_records
        |
        | startApproval(businessType, businessId, action)
        v
Approval foundation
  approval_definitions
  approval_steps
  approval_instances
  approval_tasks
  approval_events
        |
        | resolve approvers
        v
Race staff assignments
  race_staff_assignments -> team_members -> users
~~~

The business table remains the source of business fields. The approval foundation owns human approval state, task assignment, action logs, delegation, and final outcome.

## Race Staff Assignments

Add a race-level appointment table. Do not infer authority from free-text team_members.position.

Proposed table: race_staff_assignments

Core columns:

- id
- org_id
- race_id
- team_member_id
- user_id
- role_key
- role_name
- department_scope
- module_scope
- is_primary
- status
- starts_at
- ends_at
- created_by
- created_at
- updated_at

Initial role_key values:

- department_owner: 部门负责人, can approve requests from the matching department_scope.
- race_director: 赛事总监, final approval for race-level business actions.
- design_lead: 设计负责人, assigns designers after approval.
- design_designer: 设计师, can receive design assignments.

Later module roles:

- credential_lead
- finance_owner
- inventory_owner
- ops_owner

Validation rules:

- A staff assignment must point to an active team_members row in the same org.
- If the assignment needs login actions, user_id must be bound through team_members.account_user_id.
- race_director should normally have one primary active assignment per race.
- department_owner can have multiple departments and multiple people.
- Deactivated users cannot receive new approval tasks.

## Approval Definitions

Add versioned workflow definitions so future modules can reuse the same engine.

Proposed tables:

- approval_definitions: module/action level workflow definition.
- approval_steps: ordered steps in a definition.
- approval_instances: one running approval for one business record.
- approval_tasks: concrete human tasks generated from each step.
- approval_events: append-only audit log.
- approval_delegations: optional later table for temporary delegation.

Important fields:

~~~text
approval_definitions
  id, org_id, race_id nullable, business_type, action_key,
  name, version, status, created_by, created_at, published_at

approval_steps
  id, definition_id, step_order, step_key, step_name,
  task_type, resolver_type, resolver_config_json,
  decision_mode, min_approvals, reject_behavior,
  exclude_requester, due_duration_hours

approval_instances
  id, definition_id, definition_version, org_id, race_id,
  business_type, business_id, action_key,
  requester_user_id, status, current_step_order,
  started_at, completed_at, blocked_reason

approval_tasks
  id, instance_id, step_id, assigned_user_id,
  candidate_role_key, candidate_department_scope,
  status, decision, comment, due_at,
  acted_by, acted_at, delegated_from_task_id

approval_events
  id, instance_id, task_id nullable,
  event_type, actor_user_id, payload_json, created_at
~~~

Initial task_type values:

- approval: approve, reject, or request changes.
- assignment: assign the next responsible user, such as selecting a designer.

Initial resolver_type values:

- race_staff_role: resolve from race_staff_assignments.role_key.
- race_staff_department_role: resolve from role_key plus requester_department.
- fixed_user: direct named user, mainly for overrides.
- org_role: fallback to sys_role, used only for emergency routing.

Initial decision_mode values:

- single: any one assigned approver can complete the step.
- all: every assigned approver must approve.
- quorum: later, N of M.

## Design Request Flow

Definition:

~~~json
{
  "businessType": "design_request",
  "actionKey": "submit",
  "steps": [
    {
      "stepKey": "department_owner_review",
      "stepName": "部门负责人审批",
      "taskType": "approval",
      "resolverType": "race_staff_department_role",
      "resolverConfig": {
        "roleKey": "department_owner",
        "departmentField": "requester_department"
      },
      "decisionMode": "single",
      "excludeRequester": true
    },
    {
      "stepKey": "race_director_review",
      "stepName": "赛事总监终审",
      "taskType": "approval",
      "resolverType": "race_staff_role",
      "resolverConfig": {
        "roleKey": "race_director"
      },
      "decisionMode": "single",
      "excludeRequester": true
    },
    {
      "stepKey": "design_lead_assignment",
      "stepName": "设计负责人分派",
      "taskType": "assignment",
      "resolverType": "race_staff_role",
      "resolverConfig": {
        "roleKey": "design_lead"
      },
      "decisionMode": "single"
    }
  ]
}
~~~

State mapping:

~~~text
approval_instance.status = pending
  -> design_requests.status = pending_review

department owner asks for changes
  -> design_requests.status = needs_info

department owner rejects or race director rejects
  -> design_requests.status = rejected

race director approves and design lead assignment task opens
  -> design_requests.status = approved

design lead assigns designer
  -> design_requests.assigned_designer_id = selected user
  -> design_requests.status = approved

designer starts work
  -> design_requests.status = in_design

designer uploads deliverable
  -> design_requests.status = design_uploaded
~~~

If no valid approver is found:

~~~text
approval_instance.status = blocked
design_requests.status = pending_review
blocked_reason = "缺少赛事岗位: department_owner / race_director / design_lead"
~~~

UI should show a clear admin action: go to the race staff assignment page and appoint the missing post.

## API Shape

Race staff:

~~~text
GET    /api/admin/races/:raceId/staff-assignments
POST   /api/admin/races/:raceId/staff-assignments
PATCH  /api/admin/races/:raceId/staff-assignments/:assignmentId
DELETE /api/admin/races/:raceId/staff-assignments/:assignmentId
~~~

Approval tasks:

~~~text
GET  /api/app/approvals/tasks?status=pending
GET  /api/admin/approvals/tasks?raceId=1&status=pending
POST /api/app/approvals/tasks/:taskId/approve
POST /api/app/approvals/tasks/:taskId/reject
POST /api/app/approvals/tasks/:taskId/request-changes
POST /api/app/approvals/tasks/:taskId/assign
GET  /api/app/approvals/instances/:instanceId
~~~

Design request integration:

~~~text
POST /api/ops/design-requests/requests
  -> create design request
  -> start approval instance
  -> return request with currentApproval

GET /api/app/design-requests/requests
  -> include currentApproval, currentStep, pendingTaskForCurrentUser
~~~

## UI Placement

Admin surface:

- Race management gets a 赛事岗位 section.
- A matrix shows post, department scope, assigned person, account status, and active state.
- Missing required posts show a warning before enabling design request workflow.

App surface:

- Designers keep the current table and preview panel.
- Design leads see an assignment task when a request has passed final approval.
- Approvers see 我的审批 tasks with the design brief, reference assets, deadline, department, and decision buttons.

Ops surface:

- Requesters can submit and upload spreadsheets.
- They can see approval status and who is currently responsible.
- They cannot choose approvers directly in normal flow.

Admin management:

- Approval monitor shows blocked, pending, approved, rejected, and average handling time.
- Admin can see the full audit trail but cannot silently rewrite history.

## Security And Audit Rules

- Race access is still required before reading or writing race-scoped approval data.
- A user can approve a task only when they are the assigned user or an eligible candidate resolved from the task.
- The requester cannot approve their own step when exclude_requester = true.
- Every decision writes an approval_events row.
- Business status updates and approval task updates run in the same database transaction.
- Admin override must write an explicit audit event with reason.
- Existing design_request_reviews can remain as compatibility history, but new decisions should be driven by approval_events.

## Migration Strategy

Phase 1: build the foundation and design request integration.

- Add race staff assignment management.
- Seed the design request workflow definition.
- Start approval instances on new design requests.
- Keep the existing reviewRequest route as a compatibility wrapper until the UI is migrated.

Phase 2: migrate other module-local reviews.

- Credential requests can use credential_lead or race_director definitions.
- Reimbursement approvals can use department owner plus finance owner.
- Inventory and procurement approvals can use inventory owner plus race director.

Phase 3: advanced workflow features.

- Delegation and vacation rules.
- SLA escalation.
- Parallel and quorum approvals.
- Workflow definition UI.

## Validation

Backend:

- Resolver tests for race staff by role and department.
- Approval engine tests for happy path, rejection, request changes, blocked workflow, and self-approval prevention.
- Design request route test for submit -> department owner approve -> race director approve -> design lead assign.
- Credential regression test to ensure existing review behavior is not broken before migration.

Frontend:

- Build check with npm run build.
- Browser validation for admin staff assignment, approver task list, design request status timeline, and design lead assignment.

Operational:

- Run migrations on local dev DB.
- Create one test race with department owner, race director, design lead, and designer.
- Submit a design request from ops and complete the whole approval flow from app/admin surfaces.
