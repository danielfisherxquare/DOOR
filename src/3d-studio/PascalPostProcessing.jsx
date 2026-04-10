import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Color, Layers, UnsignedByteType } from 'three'
import { outline } from 'three/addons/tsl/display/OutlineNode.js'
import { ssgi } from 'three/addons/tsl/display/SSGINode.js'
import { denoise } from 'three/examples/jsm/tsl/display/DenoiseNode.js'
import {
  add,
  colorToDirection,
  diffuseColor,
  directionToColor,
  float,
  mix,
  mrt,
  normalView,
  oscSine,
  output,
  pass,
  sample,
  time,
  uniform,
  vec4,
} from 'three/tsl'
import { RenderPipeline } from 'three/webgpu'
import { SCENE_LAYER, ZONE_LAYER } from '../../node_modules/@pascal-app/viewer/dist/lib/layers.js'
import useViewer from '../../node_modules/@pascal-app/viewer/dist/store/use-viewer.js'

const MAX_PIPELINE_RETRIES = 3
const RETRY_DELAY_MS = 500
const DARK_BG = '#1f2433'
const LIGHT_BG = '#ffffff'

const SSGI_PARAMS = {
  enabled: true,
  sliceCount: 1,
  stepCount: 4,
  radius: 1,
  expFactor: 1.5,
  thickness: 0.5,
  backfaceLighting: 0.5,
  aoIntensity: 1.5,
  giIntensity: 0,
  useLinearThickness: false,
  useScreenSpaceSampling: true,
  useTemporalFiltering: false,
}

export default function PascalPostProcessing() {
  const { gl: renderer, scene, camera } = useThree()
  const renderPipelineRef = useRef(null)
  const hasPipelineErrorRef = useRef(false)
  const retryCountRef = useRef(0)
  const [isInitialized, setIsInitialized] = useState(false)

  const initBg = useViewer.getState().theme === 'dark' ? DARK_BG : LIGHT_BG
  const bgUniform = useRef(uniform(new Color(initBg)))
  const bgCurrent = useRef(new Color(initBg))
  const bgTarget = useRef(new Color())

  const zoneLayers = useMemo(() => {
    const layers = new Layers()
    layers.enable(ZONE_LAYER)
    layers.disable(SCENE_LAYER)
    return layers
  }, [])

  const projectId = useViewer((state) => state.projectId)
  const [pipelineVersion, setPipelineVersion] = useState(0)

  const requestPipelineRebuild = useCallback(() => {
    setPipelineVersion((value) => value + 1)
  }, [])

  useEffect(() => {
    let mounted = true

    const initRenderer = async () => {
      try {
        if (renderer?.init) {
          await renderer.init()
        }
        if (mounted) {
          setIsInitialized(true)
        }
      } catch (error) {
        console.error('[viewer] Failed to initialize renderer for post-processing.', error)
        if (mounted) {
          setIsInitialized(false)
        }
      }
    }

    initRenderer()
    return () => {
      mounted = false
    }
  }, [renderer])

  useEffect(() => {
    retryCountRef.current = 0
  }, [projectId])

  useEffect(() => {
    if (!(renderer && scene && camera && isInitialized)) {
      return undefined
    }

    hasPipelineErrorRef.current = false

    const outliner = useViewer.getState().outliner
    outliner.selectedObjects.length = 0
    outliner.hoveredObjects.length = 0

    try {
      const scenePass = pass(scene, camera)
      const zonePass = pass(scene, camera)
      zonePass.setLayers(zoneLayers)

      const scenePassColor = scenePass.getTextureNode('output')
      const hasGeometry = scenePassColor.a
      const contentAlpha = hasGeometry.max(zonePass.a)
      let sceneColor = scenePassColor

      if (SSGI_PARAMS.enabled) {
        scenePass.setMRT(mrt({
          output,
          diffuseColor,
          normal: directionToColor(normalView),
        }))

        const scenePassDiffuse = scenePass.getTextureNode('diffuseColor')
        const scenePassDepth = scenePass.getTextureNode('depth')
        const scenePassNormal = scenePass.getTextureNode('normal')

        const diffuseTexture = scenePass.getTexture('diffuseColor')
        diffuseTexture.type = UnsignedByteType

        const normalTexture = scenePass.getTexture('normal')
        normalTexture.type = UnsignedByteType

        const sceneNormal = sample((uv) => colorToDirection(scenePassNormal.sample(uv)))
        const giPass = ssgi(scenePassColor, scenePassDepth, sceneNormal, camera)
        giPass.sliceCount.value = SSGI_PARAMS.sliceCount
        giPass.stepCount.value = SSGI_PARAMS.stepCount
        giPass.radius.value = SSGI_PARAMS.radius
        giPass.expFactor.value = SSGI_PARAMS.expFactor
        giPass.thickness.value = SSGI_PARAMS.thickness
        giPass.backfaceLighting.value = SSGI_PARAMS.backfaceLighting
        giPass.aoIntensity.value = SSGI_PARAMS.aoIntensity
        giPass.giIntensity.value = SSGI_PARAMS.giIntensity
        giPass.useLinearThickness.value = SSGI_PARAMS.useLinearThickness
        giPass.useScreenSpaceSampling.value = SSGI_PARAMS.useScreenSpaceSampling
        giPass.useTemporalFiltering = SSGI_PARAMS.useTemporalFiltering

        const giTexture = giPass.getTextureNode()
        const aoAsRgb = vec4(giTexture.a, giTexture.a, giTexture.a, float(1))
        const denoisePass = denoise(aoAsRgb, scenePassDepth, sceneNormal, camera)
        denoisePass.index.value = 0
        denoisePass.radius.value = 4

        const gi = giPass.rgb
        const ao = denoisePass.r
        sceneColor = vec4(
          add(scenePassColor.rgb.mul(ao), add(zonePass.rgb, scenePassDiffuse.rgb.mul(gi))),
          contentAlpha,
        )
      }

      const selectedOutlinePass = buildSelectedOutline(scene, camera)
      const hoverOutlinePass = buildHoverOutline(scene, camera)
      const compositeWithOutlines = vec4(
        add(sceneColor.rgb, selectedOutlinePass.add(hoverOutlinePass)),
        sceneColor.a,
      )
      const finalOutput = vec4(mix(bgUniform.current, compositeWithOutlines.rgb, contentAlpha), float(1))

      const renderPipeline = new RenderPipeline(renderer)
      renderPipeline.outputNode = finalOutput
      renderPipelineRef.current = renderPipeline
    } catch (error) {
      hasPipelineErrorRef.current = true
      console.error('[viewer] Failed to set up post-processing pipeline. Continuing with raw WebGPU render.', error)
      renderPipelineRef.current?.dispose()
      renderPipelineRef.current = null
    }

    return () => {
      renderPipelineRef.current?.dispose()
      renderPipelineRef.current = null
    }
  }, [renderer, scene, camera, isInitialized, zoneLayers, pipelineVersion, projectId])

  useFrame((state, delta) => {
    bgTarget.current.set(useViewer.getState().theme === 'dark' ? DARK_BG : LIGHT_BG)
    bgCurrent.current.lerp(bgTarget.current, Math.min(delta, 0.1) * 4)
    bgUniform.current.value.copy(bgCurrent.current)

    const renderRawScene = () => {
      try {
        renderer.setClearAlpha?.(1)
        renderer.render(scene, camera)
      } catch (error) {
        console.error('[viewer] Raw WebGPU render failed.', error)
      }
    }

    if (hasPipelineErrorRef.current || !renderPipelineRef.current) {
      renderRawScene()
      return
    }

    try {
      renderer.setClearAlpha?.(0)
      renderPipelineRef.current.render()
    } catch (error) {
      hasPipelineErrorRef.current = true
      console.error('[viewer] Post-processing render pass failed. Falling back to raw WebGPU render.', error)
      renderPipelineRef.current?.dispose()
      renderPipelineRef.current = null

      if (retryCountRef.current < MAX_PIPELINE_RETRIES) {
        retryCountRef.current += 1
        console.warn(`[viewer] Scheduling post-processing rebuild (attempt ${retryCountRef.current}/${MAX_PIPELINE_RETRIES})`)
        setTimeout(requestPipelineRebuild, RETRY_DELAY_MS)
      } else {
        console.error('[viewer] Post-processing retries exhausted. Raw WebGPU render will remain active.')
      }

      renderRawScene()
    }
  }, 1)

  return null
}

function buildSelectedOutline(scene, camera) {
  const edgeStrength = uniform(3)
  const edgeGlow = uniform(0)
  const edgeThickness = uniform(1)
  const visibleEdgeColor = uniform(new Color(0xffffff))
  const hiddenEdgeColor = uniform(new Color(0xf3ff47))
  const outlinePass = outline(scene, camera, {
    selectedObjects: useViewer.getState().outliner.selectedObjects,
    edgeGlow,
    edgeThickness,
  })
  const { visibleEdge, hiddenEdge } = outlinePass
  return visibleEdge.mul(visibleEdgeColor).add(hiddenEdge.mul(hiddenEdgeColor)).mul(edgeStrength)
}

function buildHoverOutline(scene, camera) {
  const edgeStrength = uniform(5)
  const edgeGlow = uniform(0.5)
  const edgeThickness = uniform(1.5)
  const pulsePeriod = uniform(3)
  const visibleEdgeColor = uniform(new Color(0x00aaff))
  const hiddenEdgeColor = uniform(new Color(0xf3ff47))
  const outlinePass = outline(scene, camera, {
    selectedObjects: useViewer.getState().outliner.hoveredObjects,
    edgeGlow,
    edgeThickness,
  })
  const { visibleEdge, hiddenEdge } = outlinePass
  const period = time.div(pulsePeriod).mul(2)
  const osc = oscSine(period).mul(0.5).add(0.5)
  const outlineColor = visibleEdge.mul(visibleEdgeColor).add(hiddenEdge.mul(hiddenEdgeColor)).mul(edgeStrength)
  return pulsePeriod.greaterThan(0).select(outlineColor.mul(osc), outlineColor)
}
