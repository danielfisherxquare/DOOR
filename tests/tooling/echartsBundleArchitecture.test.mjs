import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const eventDistributionUrl = new URL(
  '../../src/views/app/race-dashboard/components/EventDistribution.jsx',
  import.meta.url,
)

test('race dashboard registers only the ECharts features it renders', async () => {
  const source = await readFile(eventDistributionUrl, 'utf8')

  assert.doesNotMatch(source, /import\s+\*\s+as\s+echarts\s+from\s+['"]echarts['"]/)
  assert.match(source, /from\s+['"]echarts\/core['"]/)
  assert.match(source, /PieChart/)
  assert.match(source, /TooltipComponent/)
  assert.match(source, /LegendComponent/)
  assert.match(source, /CanvasRenderer/)
})

test('workspace does not install the unused ECharts React wrapper', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
  )

  assert.equal(packageJson.dependencies?.['echarts-for-react'], undefined)
})
