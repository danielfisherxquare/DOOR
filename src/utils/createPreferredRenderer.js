import * as THREE from 'three/webgpu'
import { WebGLRenderer } from 'three'

function recordRendererBackend(renderer, label, backend) {
  const metadata = renderer.userData && typeof renderer.userData === 'object'
    ? renderer.userData
    : {}

  metadata.renderBackend = backend
  metadata.renderLabel = label
  renderer.userData = metadata

  const canvas = renderer.domElement
  if (canvas?.dataset) {
    canvas.dataset.rendererBackend = backend
    canvas.dataset.rendererLabel = label
  }

  if (typeof globalThis !== 'undefined') {
    const diagnostics = globalThis.__DOOR_RENDERERS__ || {}
    diagnostics[label] = {
      backend,
      at: new Date().toISOString(),
    }
    globalThis.__DOOR_RENDERERS__ = diagnostics
  }
}

function recordRendererFailure(label, backend, error) {
  if (typeof globalThis === 'undefined') return

  const diagnostics = globalThis.__DOOR_RENDERERS__ || {}
  diagnostics[label] = {
    backend,
    failed: true,
    message: error?.message || String(error),
    at: new Date().toISOString(),
  }
  globalThis.__DOOR_RENDERERS__ = diagnostics
}

function buildWebGPUProps(props, { preserveDrawingBuffer = false } = {}) {
  const nextProps = { ...props }

  // WebGPURenderer does not use preserveDrawingBuffer the same way WebGL does.
  // Keep the config surface explicit so we do not pass unsupported flags through.
  if (preserveDrawingBuffer) {
    nextProps.preserveDrawingBuffer = true
  }

  return nextProps
}

function syncRendererSize(renderer, canvas) {
  if (!renderer?.setSize || !canvas) return

  const width = Math.max(canvas.clientWidth || canvas.width || 1, 1)
  const height = Math.max(canvas.clientHeight || canvas.height || 1, 1)
  const pixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1

  if (renderer.setPixelRatio) {
    renderer.setPixelRatio(pixelRatio)
  }

  renderer.setSize(width, height, false)
}

export async function createPreferredRenderer(props, options = {}) {
  const {
    label = 'ThreeCanvas',
    preserveDrawingBuffer = false,
    backend = 'prefer-webgpu',
  } = options

  const wantsStrictWebGPU = backend === 'webgpu'

  if (typeof navigator !== 'undefined' && navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter()
      if (!adapter) {
        throw new Error('navigator.gpu.requestAdapter() returned null')
      }

      const renderer = new THREE.WebGPURenderer(buildWebGPUProps(props, { preserveDrawingBuffer }))
      await renderer.init()
      syncRendererSize(renderer, props.canvas)

      recordRendererBackend(renderer, label, 'webgpu')
      console.info(`[${label}] WebGPU renderer initialized`)
      return renderer
    } catch (error) {
      recordRendererFailure(label, 'webgpu', error)
      if (wantsStrictWebGPU) {
        throw error
      }
      console.warn(`[${label}] WebGPU unavailable, falling back to WebGL`, error)
    }
  } else {
    const error = new Error('navigator.gpu is unavailable')
    recordRendererFailure(label, 'webgpu', error)
    if (wantsStrictWebGPU) {
      throw error
    }
    console.info(`[${label}] navigator.gpu is unavailable, using WebGL`)
  }

  const renderer = new WebGLRenderer({
    ...props,
    preserveDrawingBuffer,
  })
  syncRendererSize(renderer, props.canvas)

  recordRendererBackend(renderer, label, 'webgl')
  console.info(`[${label}] WebGL renderer initialized`)
  return renderer
}
