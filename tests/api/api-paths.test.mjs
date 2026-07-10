import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

const rootUrl = new URL('../../', import.meta.url)

async function source(relativePath) {
  return readFile(new URL(relativePath, rootUrl), 'utf8')
}

describe('API path ownership', () => {
  it('does not rewrite API paths inside the shared request client', async () => {
    const requestSource = await source('src/utils/request.js')

    assert.doesNotMatch(requestSource, /remapApiPath/)
    for (const legacyPrefix of [
      '/assessment/public',
      '/tools',
      '/interview',
      '/projects',
      '/races',
      '/org',
    ]) {
      assert.equal(requestSource.includes(legacyPrefix), false)
    }
  })

  it('uses the mounted public tools route explicitly', async () => {
    const toolsSource = await source('src/api/tools.js')

    assert.match(toolsSource, /\/public\/tools/)
    assert.doesNotMatch(toolsSource, /request\.(?:get|post)\(`?['"]?\/tools/)
  })

  it('keeps the app race dashboard on an app-owned backend route', async () => {
    const dashboardSource = await source('src/api/raceDashboard.js')
    const appSource = await source('server/src/app.js')

    assert.match(dashboardSource, /\/app\/races\/dashboard/)
    assert.doesNotMatch(dashboardSource, /request\.get\(`?\/races/)
    assert.match(appSource, /app\.use\('\/api\/app\/races\/dashboard'/)
  })

  it('keeps event-workflow APIs on explicit app-owned routes', async () => {
    const appOwnedApis = [
      'src/api/audit.js',
      'src/api/bib.js',
      'src/api/clothing.js',
      'src/api/column-mappings.js',
      'src/api/import-session.js',
      'src/api/lottery.js',
      'src/api/pipeline.js',
      'src/api/records.js',
      'src/api/app/bibTracking.js',
    ]

    for (const relativePath of appOwnedApis) {
      const apiSource = await source(relativePath)

      assert.doesNotMatch(apiSource, /surfaceApi|window\.location/, relativePath)
      assert.match(apiSource, /['"]\/app\//, relativePath)
    }
  })
})
