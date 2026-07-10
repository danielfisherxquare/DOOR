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

    await assert.rejects(source('src/utils/surfaceApi.js'), { code: 'ENOENT' })
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

  it('exposes explicit clients for APIs shared by admin and ops', async () => {
    const bibTrackingSource = await source('src/api/bibTracking.js')
    const credentialSource = await source('src/api/credential.js')

    for (const apiSource of [bibTrackingSource, credentialSource]) {
      assert.doesNotMatch(apiSource, /surfaceApi|window\.location/)
      assert.match(apiSource, /admin:/)
      assert.match(apiSource, /ops:/)
    }

    assert.match(bibTrackingSource, /adminBibTrackingApi/)
    assert.match(bibTrackingSource, /opsBibTrackingApi/)
    assert.match(credentialSource, /adminCredentialApi/)
    assert.match(credentialSource, /opsCredentialApi/)
  })

  it('passes the interview surface explicitly from views to the store', async () => {
    const interviewApiSource = await source('src/api/interview.js')
    const interviewStoreSource = await source('src/stores/interviewStore.js')
    const interviewSurfaceSource = await source('src/views/interview/useInterviewSurface.js')

    assert.doesNotMatch(interviewApiSource, /window\.location/)
    assert.match(interviewApiSource, /adminInterviewApi/)
    assert.match(interviewApiSource, /appInterviewApi/)
    assert.match(interviewStoreSource, /getInterviewApi\(surface\)/)
    assert.match(interviewSurfaceSource, /\bsurface,/)

    for (const relativePath of [
      'src/views/interview/InterviewList.jsx',
      'src/views/interview/InterviewCompare.jsx',
      'src/views/interview/InterviewForm.jsx',
    ]) {
      const viewSource = await source(relativePath)
      assert.match(viewSource, /useInterviewSurface\(\)/, relativePath)
      assert.match(viewSource, /(?:fetch|save|delete)Interview(?:s)?\([^)]*surface/, relativePath)
    }
  })

  it('injects an explicit inventory client into the ops workbench', async () => {
    const inventoryApiSource = await source('src/services/inventoryApi.js')
    const opsWorkbenchSource = await source('src/views/ops/WarehouseWorkbench.jsx')

    assert.doesNotMatch(inventoryApiSource, /surfaceApi|useAuthStore|window\.location/)
    assert.match(inventoryApiSource, /createInventoryApi/)
    assert.match(inventoryApiSource, /opsInventoryApi/)
    assert.match(opsWorkbenchSource, /opsInventoryApi/)

    for (const relativePath of [
      'src/views/ops/warehouse/InboundWorkspace.jsx',
      'src/views/ops/warehouse/OutboundWorkspace.jsx',
      'src/views/ops/warehouse/BindingWorkspace.jsx',
      'src/views/ops/warehouse/CountWorkspace.jsx',
    ]) {
      const workspaceSource = await source(relativePath)
      assert.match(workspaceSource, /opsInventoryApi/, relativePath)
    }
  })
})
