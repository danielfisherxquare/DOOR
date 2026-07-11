import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import * as esbuild from 'esbuild'

async function loadTerrainRuntimePolicy() {
  const outdir = path.join(os.tmpdir(), `door-terrain-runtime-${process.pid}-${Date.now()}`)
  await fs.mkdir(outdir, { recursive: true })
  await esbuild.build({
    entryPoints: [path.resolve('src/components/map/terrainRuntimePolicy.ts')],
    outdir,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
  })

  return {
    policy: await import(pathToFileURL(path.join(outdir, 'terrainRuntimePolicy.js')).href),
    cleanup: () => fs.rm(outdir, { recursive: true, force: true }),
  }
}

test('terrain runtime policy degrades before honoring quality presets', async () => {
  const { policy, cleanup } = await loadTerrainRuntimePolicy()
  try {
    assert.deepEqual(policy.resolveTerrainWorkZoneRuntimePolicy({ preset: 'quality' }, 20), {
      strategy: 'merged-glb',
      reason: 'fps<24',
      qualityPreset: 'quality',
      fpsBucket: 'degraded',
    })
    assert.equal(policy.resolveTerrainWorkZoneRuntimePolicy({ preset: 'performance' }, 60).strategy, 'merged-glb')
    assert.equal(policy.resolveTerrainWorkZoneRuntimePolicy({ preset: 'balanced' }, 60).strategy, 'instanced-glb')
    assert.equal(policy.resolveTerrainWorkZoneRuntimePolicy({ preset: 'quality' }, 60).strategy, 'template-fanout')
  } finally {
    await cleanup()
  }
})

test('terrain runtime summary aggregates instances and preserves the first fallback', async () => {
  const { policy, cleanup } = await loadTerrainRuntimePolicy()
  try {
    const runtimePolicy = policy.resolveTerrainWorkZoneRuntimePolicy({ preset: 'quality' }, 60)
    const summary = policy.summarizeTerrainWorkZoneRuntimeHandles([
      {
        sourceSummaries: [
          { strategy: 'template-fanout', instanceCount: 3, fallbackReason: null },
          { strategy: 'merged-glb', instanceCount: 2, fallbackReason: 'template-fanout-load-failed' },
        ],
      },
    ], runtimePolicy, 60)

    assert.deepEqual(summary, {
      zoneCount: 1,
      sourceCount: 2,
      strategyLabel: '模板展开预览 + 合批 GLB',
      requestedStrategyLabel: '模板展开预览',
      fallbackReason: 'template-fanout-load-failed',
      qualityPreset: 'quality',
      fpsBucket: 'quality',
      renderFps: 60,
      instanceCount: 5,
      fallbackSourceCount: 1,
    })
  } finally {
    await cleanup()
  }
})

test('globe experience status distinguishes startup, fallback, and ready states', async () => {
  const { policy, cleanup } = await loadTerrainRuntimePolicy()
  try {
    const emptySummary = {
      zoneCount: 0,
      sourceCount: 0,
      strategyLabel: '实例化 GLB',
      requestedStrategyLabel: '实例化 GLB',
      fallbackReason: null,
      qualityPreset: 'balanced',
      fpsBucket: 'idle',
      renderFps: null,
      instanceCount: 0,
      fallbackSourceCount: 0,
    }

    assert.equal(policy.deriveGlobeExperienceStatus({
      hasRenderableSize: false,
      viewerReady: false,
      hasRenderedFrame: false,
      tileLoadCount: 0,
      runtimeLoadingCount: 0,
      expectedZoneCount: 0,
      summary: emptySummary,
    }).title, '正在启动地球视图')

    const fallback = policy.deriveGlobeExperienceStatus({
      hasRenderableSize: true,
      viewerReady: true,
      hasRenderedFrame: true,
      tileLoadCount: 0,
      runtimeLoadingCount: 0,
      expectedZoneCount: 1,
      summary: { ...emptySummary, zoneCount: 1, fallbackReason: 'fps<24' },
    })
    assert.equal(fallback.tone, 'warn')
    assert.match(fallback.detail, /帧率偏低/)

    const ready = policy.deriveGlobeExperienceStatus({
      hasRenderableSize: true,
      viewerReady: true,
      hasRenderedFrame: true,
      tileLoadCount: 0,
      runtimeLoadingCount: 0,
      expectedZoneCount: 1,
      summary: { ...emptySummary, zoneCount: 1 },
    })
    assert.equal(ready.tone, 'ready')
    assert.equal(ready.title, '重点区白模已就绪')
  } finally {
    await cleanup()
  }
})
