/**
 * 截图工具函数
 * 使用 Canvas API 和 Three.js 渲染器导出图片
 */
import * as THREE from 'three'

/**
 * 捕获 3D 场景截图
 * @param {Object} options - 截图选项
 * @param {THREE.WebGLRenderer} renderer - Three.js 渲染器
 * @param {THREE.Scene} scene - 场景对象
 * @param {THREE.Camera} camera - 相机对象
 * @returns {Promise<Blob>} 图片 Blob
 */
export async function captureScene(options, renderer, scene, camera) {
  const {
    width = 1920,
    height = 1080,
    format = 'png',
    quality = 95,
  } = options

  // 保存原始状态
  const originalSize = {
    width: renderer.domElement.width,
    height: renderer.domElement.height,
  }

  // 设置渲染目标尺寸
  renderer.setSize(width, height)
  camera.aspect = width / height
  camera.updateProjectionMatrix()

  // 渲染
  renderer.render(scene, camera)

  // 获取像素数据
  const mimeType = format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg'

  return new Promise((resolve, reject) => {
    renderer.domElement.toBlob(
      (blob) => {
        // 恢复原始状态
        renderer.setSize(originalSize.width, originalSize.height)
        camera.aspect = originalSize.width / originalSize.height
        camera.updateProjectionMatrix()

        if (blob) resolve(blob)
        else reject(new Error('截图失败'))
      },
      mimeType,
      quality / 100
    )
  })
}

/**
 * 使用 WebGLRenderTarget 高分辨率渲染
 */
export async function captureHighRes(options, gl, scene, camera) {
  const { width = 3840, height = 2160, format = 'png' } = options

  // 创建离屏渲染目标
  const renderTarget = new THREE.WebGLRenderTarget(width, height, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
  })

  // 保存原始渲染目标
  const originalRenderTarget = gl.getRenderTarget()

  // 设置新渲染目标
  gl.setRenderTarget(renderTarget)

  // 渲染
  gl.render(scene, camera)

  // 读取像素
  const buffer = new Uint8Array(width * height * 4)
  gl.readRenderTargetPixels(renderTarget, 0, 0, width, height, buffer)

  // 创建 Canvas 并翻转 Y 轴
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  const imageData = ctx.createImageData(width, height)

  // 翻转 Y 轴
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = ((height - y - 1) * width + x) * 4
      const dstIdx = (y * width + x) * 4
      imageData.data[dstIdx] = buffer[srcIdx]
      imageData.data[dstIdx + 1] = buffer[srcIdx + 1]
      imageData.data[dstIdx + 2] = buffer[srcIdx + 2]
      imageData.data[dstIdx + 3] = buffer[srcIdx + 3]
    }
  }
  ctx.putImageData(imageData, 0, 0)

  // 恢复原始渲染目标
  gl.setRenderTarget(originalRenderTarget)
  renderTarget.dispose()

  // 转换为 Blob
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      format === 'png' ? 'image/png' : 'image/jpeg',
      0.95
    )
  })
}

/**
 * 从 Canvas 元素捕获截图
 */
export async function captureFromCanvas(canvas, options = {}) {
  const { format = 'png', quality = 95 } = options

  const mimeType = format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg'

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Canvas 截图失败'))
      },
      mimeType,
      quality / 100
    )
  })
}

/**
 * 下载 Blob 为文件
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * 生成文件名
 */
export function generateFilename(prefix = 'scene', format = 'png') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `${prefix}_${timestamp}.${format}`
}
