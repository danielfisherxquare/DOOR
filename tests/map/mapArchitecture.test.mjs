import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const rootUrl = new URL('../../', import.meta.url)

test('3D map delegates OSM and runtime policy responsibilities to focused modules', async () => {
  const source = await readFile(new URL('src/components/map/MapView3D.tsx', rootUrl), 'utf8')
  const lineCount = source.split('\n').length

  assert.ok(lineCount <= 2450, `MapView3D.tsx has ${lineCount} lines; expected no more than 2450`)
  assert.match(source, /from '\.\/osmBuildings'/)
  assert.match(source, /from '\.\/terrainRuntimePolicy'/)
})

test('map workspace uses the shared spatial project view switch and keeps 3D metrics out of 2D', async () => {
  const source = await readFile(new URL('src/components/app/AppMapLayout.jsx', rootUrl), 'utf8')
  const switchSource = await readFile(new URL('src/components/app/spatial/SpatialProjectViewSwitch.tsx', rootUrl), 'utf8')

  assert.match(source, /<SpatialProjectViewSwitch/)
  assert.match(source, /activeView="map"/)
  assert.match(source, /viewMode === '3DGlobe' &&/)
  assert.match(source, /to=\{buildAppHref\('\/3d-studio', context\)\}/)
  assert.match(source, /返回空间项目/)
  assert.match(switchSource, /aria-label="空间项目视图"/)
  assert.match(switchSource, /aria-current=\{isActive \? 'page' : undefined\}/)
})

test('new event sites create a real project before map and 3D editing diverge', async () => {
  const layoutSource = await readFile(new URL('src/components/app/AppMapLayout.jsx', rootUrl), 'utf8')
  const dialogSource = await readFile(new URL('src/components/app/spatial/SpatialProjectCreateDialog.tsx', rootUrl), 'utf8')
  const workflowSource = await readFile(new URL('src/components/app/spatial/SpatialProjectWorkflowRail.tsx', rootUrl), 'utf8')
  const onboardingSource = await readFile(new URL('src/components/map/MapOnboarding.tsx', rootUrl), 'utf8')

  assert.match(layoutSource, /searchParams\.get\('createMode'\) === 'event-site'/)
  assert.match(layoutSource, /await siteModeApi\.createProject\(\{/)
  assert.match(layoutSource, /projectType: 'site'/)
  assert.match(layoutSource, /geoAnchor: \{/)
  assert.match(layoutSource, /nextUrl\.searchParams\.set\('projectId', createdProject\.id\)/)
  assert.match(layoutSource, /nextUrl\.searchParams\.set\('workflow', 'event-site'\)/)
  assert.match(layoutSource, /setTileStyle\('esri_world_imagery'\)/)
  assert.match(layoutSource, /modelDisabled=\{modelDisabled\}/)
  assert.match(layoutSource, /<SpatialProjectWorkflowRail/)
  assert.match(dialogSource, /role="dialog"/)
  assert.match(dialogSource, /创建并进入地图/)
  assert.match(workflowSource, /卫星选址/)
  assert.match(workflowSource, /生成参考数据/)
  assert.match(workflowSource, /实体布置/)
  assert.match(workflowSource, /aria-live="polite"/)
  assert.match(onboardingSource, /!completed && !projectId && !createMode/)
})
