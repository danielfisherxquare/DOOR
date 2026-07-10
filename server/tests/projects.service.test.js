import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectsService } from '../src/modules/projects/projects.service.js';
import {
  parseAssigneePayload,
  parseProjectPayload,
  parseTaskPayload,
} from '../src/modules/projects/projects.schema.js';

const PROJECT_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_PROJECT_ID = '10000000-0000-4000-8000-000000000002';
const TASK_ID = '20000000-0000-4000-8000-000000000001';
const MEMBER_ID = '30000000-0000-4000-8000-000000000001';
const ORG_ID = '40000000-0000-4000-8000-000000000001';

test('project and task schemas whitelist persistence fields', () => {
  assert.deepEqual(parseProjectPayload({
    name: '  春季赛事筹备  ',
    description: '',
    race_id: '12',
    org_id: ORG_ID,
    created_by: 'attacker',
  }), {
    name: '春季赛事筹备',
    description: null,
    raceId: 12,
    orgId: ORG_ID,
  });

  assert.deepEqual(parseTaskPayload({
    title: '  搭建起点  ',
    status: 'IN_PROGRESS',
    start_date: '2026-07-10',
    end_date: null,
    is_milestone: true,
    sort_order: 2.5,
    project_id: OTHER_PROJECT_ID,
  }), {
    title: '搭建起点',
    parentId: null,
    status: 'IN_PROGRESS',
    startDate: '2026-07-10T00:00:00.000Z',
    endDate: null,
    isMilestone: true,
    notes: null,
    sortOrder: 2.5,
    responsibleGroup: null,
  });

  assert.throws(() => parseTaskPayload({ title: 'x', status: 'UNKNOWN' }), /status/);
  assert.throws(
    () => parseTaskPayload({ title: 'x', start_date: '2026-07-11', end_date: '2026-07-10' }),
    /开始日期不能晚于结束日期/,
  );
});

test('non-super administrators cannot access unowned or unscoped projects', async () => {
  const service = createProjectsService({
    findProjectById: async () => ({ id: PROJECT_ID, org_id: null }),
  });

  await assert.rejects(
    service.getProject({ role: 'org_admin', orgId: ORG_ID }, PROJECT_ID),
    (error) => error.status === 403,
  );
});

test('project updates cannot transfer ownership through the generic endpoint', async () => {
  let updateCalled = false;
  const service = createProjectsService({
    findProjectById: async () => ({ id: PROJECT_ID, org_id: ORG_ID }),
    updateProject: async () => {
      updateCalled = true;
    },
  });

  await assert.rejects(
    service.updateProject(
      { role: 'super_admin' },
      PROJECT_ID,
      { orgId: '40000000-0000-4000-8000-000000000002' },
    ),
    (error) => error.status === 400 && error.code === 'PROJECT_ORG_TRANSFER_UNSUPPORTED',
  );
  assert.equal(updateCalled, false);
});

test('task updates reject descendant parents to prevent hierarchy cycles', async () => {
  let updateCalled = false;
  const descendantId = '20000000-0000-4000-8000-000000000002';
  const service = createProjectsService({
    findProjectById: async () => ({ id: PROJECT_ID, org_id: ORG_ID }),
    findTaskById: async (_projectId, taskId) => {
      if (taskId === TASK_ID) return { id: TASK_ID, project_id: PROJECT_ID, parent_id: null };
      if (taskId === descendantId) {
        return { id: descendantId, project_id: PROJECT_ID, parent_id: TASK_ID };
      }
      return null;
    },
    updateTask: async () => {
      updateCalled = true;
    },
  });

  await assert.rejects(
    service.updateTask(
      { role: 'org_admin', orgId: ORG_ID },
      PROJECT_ID,
      TASK_ID,
      { parentId: descendantId },
    ),
    /父任务不能是当前任务的子任务/,
  );
  assert.equal(updateCalled, false);
});

test('assignee writes reject a task from another project before persistence', async () => {
  let replaceCalled = false;
  const service = createProjectsService({
    findProjectById: async () => ({ id: PROJECT_ID, org_id: ORG_ID }),
    findTaskById: async () => null,
    replaceTaskAssignees: async () => {
      replaceCalled = true;
    },
  });

  await assert.rejects(
    service.setTaskAssignees(
      { role: 'org_admin', orgId: ORG_ID },
      PROJECT_ID,
      TASK_ID,
      [{ sourceType: 'team_member', teamMemberId: MEMBER_ID }],
    ),
    (error) => error.status === 404,
  );
  assert.equal(replaceCalled, false);
});

test('assignee writes use authoritative organization member data', async () => {
  let persisted;
  const repository = {
    findProjectById: async () => ({ id: PROJECT_ID, org_id: ORG_ID }),
    findTaskById: async () => ({ id: TASK_ID, project_id: PROJECT_ID }),
    findTeamMembers: async (orgId, memberIds) => {
      assert.equal(orgId, ORG_ID);
      assert.deepEqual(memberIds, [MEMBER_ID]);
      return [{
        id: MEMBER_ID,
        employee_code: 'ZA-001',
        employee_name: '张三',
        position: '赛事主管',
        member_type: 'employee',
        external_engagement_type: null,
      }];
    },
    replaceTaskAssignees: async (input) => {
      persisted = input;
      return input.assignees.map((item, index) => ({ id: `saved-${index}`, ...item }));
    },
  };
  const service = createProjectsService(repository);
  const assignees = parseAssigneePayload({
    assignees: [{
      sourceType: 'team_member',
      teamMemberId: MEMBER_ID,
      employeeName: '伪造姓名',
      position: '现场总控',
    }],
  });

  const result = await service.setTaskAssignees(
    { role: 'org_admin', orgId: ORG_ID },
    PROJECT_ID,
    TASK_ID,
    assignees,
  );

  assert.deepEqual(persisted, {
    projectId: PROJECT_ID,
    taskId: TASK_ID,
    orgId: ORG_ID,
    assignees: [{
      source_type: 'team_member',
      team_member_id: MEMBER_ID,
      employee_code: 'ZA-001',
      employee_name: '张三',
      position: '现场总控',
      member_type: 'employee',
      external_engagement_type: null,
    }],
  });
  assert.equal(result[0].employeeName, '张三');
});
