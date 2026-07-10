import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

import { createTeamController } from '../src/modules/team/team.controller.js'
import {
  parseTeamImportRows,
  parseTeamListQuery,
  parseTeamMemberInput,
  resolveTeamOrgId,
} from '../src/modules/team/team.schema.js'

describe('team schemas', () => {
  it('normalizes organization context and list bounds', () => {
    assert.equal(
      resolveTeamOrgId({ role: 'super_admin', orgId: null }, { orgId: ' org-1 ' }),
      'org-1',
    )
    assert.deepEqual(parseTeamListQuery({ page: '2', limit: '50', keyword: ' Ops ' }), {
      page: 2,
      limit: 50,
      keyword: 'Ops',
      department: '',
      memberType: '',
      externalEngagementType: '',
      status: '',
      hasAccount: '',
    })
  })

  it('copies only supported member and import fields', () => {
    assert.deepEqual(
      parseTeamMemberInput({
        employeeCode: ' A001 ',
        employeeName: ' Runner ',
        department: ' Ops ',
        memberType: 'employee',
        idNumber: '110101',
        contact: '13800138000',
        role: 'super_admin',
      }),
      {
        employeeCode: 'A001',
        employeeName: 'Runner',
        department: 'Ops',
        memberType: 'employee',
        idNumber: '110101',
        contact: '13800138000',
      },
    )
    assert.deepEqual(
      parseTeamImportRows({ rows: [{ employee_code: 'A001', employee_name: 'Runner' }] }),
      [{ employeeCode: 'A001', employeeName: 'Runner' }],
    )
  })
})

describe('team controller boundary', () => {
  it('passes a parsed member payload to the service', async () => {
    let received
    const controller = createTeamController({
      service: {
        async createTeamMember(...args) {
          received = args
          return { id: 'member-1' }
        },
      },
    })
    const req = {
      teamOrgId: 'org-1',
      authContext: { userId: 'user-1' },
      body: {
        employeeCode: ' A001 ',
        employeeName: ' Runner ',
        department: ' Ops ',
        memberType: 'employee',
        idNumber: '110101',
        contact: '13800138000',
        role: 'super_admin',
      },
    }
    const response = { status: () => response, json: (body) => body }

    await controller.createTeamMember(req, response, assert.fail)

    assert.deepEqual(received, [
      'org-1',
      'user-1',
      {
        employeeCode: 'A001',
        employeeName: 'Runner',
        department: 'Ops',
        memberType: 'employee',
        idNumber: '110101',
        contact: '13800138000',
      },
    ])
  })
})

describe('team account linking', () => {
  it('persists the account link exactly once in the linked-user workflow', async () => {
    const source = await readFile(
      new URL('../src/modules/team/team.service.js', import.meta.url),
      'utf8',
    )
    const matches = source.match(
      /repo\.updateTeamMember\(orgId, teamMember\.id, \{ account_user_id: user\.id \}, trx\)/gu,
    )
    assert.equal(matches?.length, 1)
  })
})
