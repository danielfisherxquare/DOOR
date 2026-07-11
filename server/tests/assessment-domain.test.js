import assert from 'node:assert/strict'
import test from 'node:test'

async function loadDomain() {
  try {
    return await import('../src/modules/assessment/assessment-domain.js')
  } catch {
    return null
  }
}

test('assessment defaults are normalized and returned as independent copies', async () => {
  const domain = await loadDomain()
  assert.ok(domain, 'focused assessment domain module must exist')

  const first = domain.getDefaultTemplateItems()
  const second = domain.getDefaultTemplateItems()
  assert.equal(first.length, 10)
  assert.ok(first.every((item) => item.scoreMin === 0 && item.scoreMax === 10))

  first[0].title = 'mutated'
  assert.notEqual(second[0].title, 'mutated')
  assert.equal(domain.getDefaultTemplateTitle(' 成都马拉松 '), '成都马拉松考评表')
})

test('assessment template, roster, and score inputs keep their public validation contract', async () => {
  const domain = await loadDomain()
  assert.ok(domain, 'focused assessment domain module must exist')

  const [item] = domain.normalizeTemplateItems([{
    id: 'legacy',
    title: '旧评分项',
    scoreMin: 1,
    scoreMax: 10,
  }])
  assert.equal(item.scoreMin, 0)
  assert.equal(item.required, true)

  const roster = domain.normalizeRosterRows([
    { employeeCode: 'A001', employeeName: '导入姓名', position: '执行' },
  ], new Map([['A001', '系统姓名']]))
  assert.equal(roster.inheritedNameCount, 1)
  assert.equal(roster.rows[0].employeeName, '系统姓名')

  assert.deepEqual(domain.normalizeScores([{ score: 7 }], [item]), [{
    itemId: 'legacy',
    title: '旧评分项',
    score: 7,
  }])
  assert.throws(
    () => domain.normalizeScores([{ score: 11 }], [item]),
    (error) => error.status === 400 && /0-10/.test(error.message),
  )

  const invalidInputs = [
    {
      run: () => domain.normalizeRosterRows([]),
      message: '名单不能为空',
    },
    {
      run: () => domain.normalizeTemplateItems([{ title: ' ' }]),
      message: 'templateItems[0].title is required',
    },
    {
      run: () => domain.normalizeScores([], [item]),
      message: '评分项数量与模板不一致',
    },
  ]
  for (const invalidInput of invalidInputs) {
    assert.throws(
      invalidInput.run,
      (error) => error.status === 400 && error.expose === true && error.message === invalidInput.message,
    )
  }
})

test('assessment reports calculate averages, variance, comments, and talent tiers', async () => {
  const domain = await loadDomain()
  assert.ok(domain, 'focused assessment domain module must exist')

  const templateItems = domain.getDefaultTemplateItems()
  const scoresFor = (score) => templateItems.map((item) => ({ itemId: item.id, title: item.title, score }))
  const report = domain.buildMemberReport({
    member: {
      id: 'member-1',
      employee_code: 'A001',
      employee_name: '张三',
      position: '现场执行',
    },
    templateItems,
    submissions: [
      { scores: scoresFor(10), comment: '表现稳定' },
      { scores: scoresFor(8), comment: '  ' },
    ],
  })

  assert.equal(report.sampleCount, 2)
  assert.equal(report.averageScore, 90)
  assert.equal(report.variance, 100)
  assert.ok(report.itemAverages.every((item) => item.averageScore === 9))
  assert.deepEqual(report.comments, ['表现稳定'])
  assert.equal(report.tierResult.tier, 'S')

  const redLineItems = [
    { itemId: 'skill', title: '业务技能', averageScore: 4 },
    { itemId: 'quality', title: '工作质量', averageScore: 3 },
    { itemId: 'execution', title: '执行力', averageScore: 9 },
  ]
  const tier = domain.buildTierResult(85, redLineItems)
  assert.equal(tier.tier, 'D')
  assert.equal(tier.redLineCount, 2)
  assert.equal(tier.redLineWarnings.length, 2)
})

test('assessment talent tiers preserve score and red-line boundaries', async () => {
  const domain = await loadDomain()
  assert.ok(domain, 'focused assessment domain module must exist')

  const itemAverages = (skill, quality, execution) => [
    { itemId: 'skill', title: '业务技能', averageScore: skill },
    { itemId: 'quality', title: '工作质量', averageScore: quality },
    { itemId: 'execution', title: '执行力', averageScore: execution },
  ]
  const cases = [
    { averageScore: 90, items: itemAverages(9, 9, 9), tier: 'S' },
    { averageScore: 90, items: itemAverages(9, 9, 8), tier: 'A' },
    { averageScore: 75, items: itemAverages(8, 8, 8), tier: 'A' },
    { averageScore: 60, items: itemAverages(7, 7, 7), tier: 'B' },
    { averageScore: 40, items: itemAverages(6, 6, 6), tier: 'C' },
    { averageScore: 39, items: itemAverages(6, 6, 6), tier: 'D' },
    { averageScore: 85, items: itemAverages(4, 8, 8), tier: 'C' },
    { averageScore: 59, items: itemAverages(4, 8, 8), tier: 'D' },
    { averageScore: 85, items: itemAverages(4, 4, 8), tier: 'D' },
  ]

  for (const testCase of cases) {
    assert.equal(
      domain.buildTierResult(testCase.averageScore, testCase.items).tier,
      testCase.tier,
      JSON.stringify(testCase),
    )
  }
})
