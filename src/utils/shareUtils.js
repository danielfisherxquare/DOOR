/**
 * 分享工具函数
 */

import request from './request'

/**
 * 生成分享短链接
 */
export async function generateShareLink(sceneData, options = {}) {
  const { expiresIn = '7d' } = options

  // 压缩场景数据
  const compressed = await compressSceneData(sceneData)

  // 调用后端 API 生成短链接
  // 注意：如果后端 API 未就绪，返回模拟数据
  try {
    const response = await request.post('/share/create', {
      data: compressed,
      expiresIn,
    })
    const result = response.data

    return {
      id: result.id,
      shortUrl: `${window.location.origin}/s/${result.id}`,
      embedCode: generateEmbedCode(result.id),
      expiresAt: result.expiresAt,
    }
  } catch (error) {
    console.warn('分享 API 不可用，使用本地模拟')
  }

  // 模拟分享链接（前端生成）
  const mockId = generateShareId()
  return {
    id: mockId,
    shortUrl: `${window.location.origin}/share/${mockId}`,
    embedCode: generateEmbedCode(mockId),
    expiresAt: calculateExpiresAt(expiresIn),
    isLocal: true,
  }
}

/**
 * 获取分享数据
 */
export async function getShareData(shareId) {
  const response = await request.get(`/share/${shareId}`)
  const result = response.data
  const sceneData = await decompressSceneData(result.data)

  return {
    scene: sceneData,
    metadata: {
      viewCount: result.viewCount,
      createdAt: result.createdAt,
    },
  }
}

/**
 * 生成嵌入代码
 */
function generateEmbedCode(shareId) {
  const baseUrl = window.location.origin
  return `<iframe
  src="${baseUrl}/embed/${shareId}"
  width="800"
  height="600"
  frameborder="0"
  allowfullscreen
></iframe>`
}

/**
 * 生成分享 ID
 */
function generateShareId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * 计算过期时间
 */
function calculateExpiresAt(expiresIn) {
  if (expiresIn === 'never') return null

  const now = new Date()
  const match = expiresIn.match(/^(\d+)([dhm])$/)

  if (!match) return null

  const value = parseInt(match[1], 10)
  const unit = match[2]

  switch (unit) {
    case 'd':
      now.setDate(now.getDate() + value)
      break
    case 'h':
      now.setHours(now.getHours() + value)
      break
    case 'm':
      now.setMinutes(now.getMinutes() + value)
      break
  }

  return now.toISOString()
}

/**
 * 压缩场景数据
 */
async function compressSceneData(data) {
  const jsonString = JSON.stringify(data)

  // 检查 CompressionStream API 支持
  if (typeof CompressionStream !== 'undefined') {
    try {
      const encoder = new TextEncoder()
      const input = encoder.encode(jsonString)

      const cs = new CompressionStream('gzip')
      const writer = cs.writable.getWriter()
      writer.write(input)
      writer.close()

      const reader = cs.readable.getReader()
      const chunks = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }

      const compressed = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0))
      let offset = 0
      for (const chunk of chunks) {
        compressed.set(chunk, offset)
        offset += chunk.length
      }

      return btoa(String.fromCharCode(...compressed))
    } catch (error) {
      console.warn('压缩失败，使用未压缩数据')
    }
  }

  // 降级：直接 Base64
  return btoa(unescape(encodeURIComponent(jsonString)))
}

/**
 * 解压场景数据
 */
async function decompressSceneData(compressed) {
  // 解码 Base64
  const binaryString = decodeURIComponent(escape(atob(compressed)))
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  // 检查 DecompressionStream API 支持
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const ds = new DecompressionStream('gzip')
      const writer = ds.writable.getWriter()
      writer.write(bytes)
      writer.close()

      const reader = ds.readable.getReader()
      const chunks = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }

      const decompressed = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0))
      let offset = 0
      for (const chunk of chunks) {
        decompressed.set(chunk, offset)
        offset += chunk.length
      }

      const decoder = new TextDecoder()
      return JSON.parse(decoder.decode(decompressed))
    } catch (error) {
      // 可能是未压缩的数据
    }
  }

  // 降级：直接解析
  const decoder = new TextDecoder()
  return JSON.parse(decoder.decode(bytes))
}

/**
 * 复制到剪贴板
 */
export async function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (error) {
      console.warn('Clipboard API 失败，使用降级方案')
    }
  }

  // 降级方案
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()

  let success = false
  try {
    success = document.execCommand('copy')
  } catch (error) {
    console.error('复制失败:', error)
  }

  document.body.removeChild(textarea)
  return success
}

/**
 * 生成场景缩略图 (用于分享预览)
 */
export function generateThumbnail(draftScene, size = 200) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')

  const dimensions = draftScene?.warehouse?.dimensions_mm || {}
  const warehouse = {
    width: draftScene?.warehouse?.width || dimensions.width_mm / 1000 || 20,
    depth: draftScene?.warehouse?.depth || dimensions.depth_mm / 1000 || 15,
  }
  const canvasPadding = Math.max(12, Math.round(size * 0.08))
  const innerSize = Math.max(1, size - canvasPadding * 2)
  const scale = innerSize / Math.max(warehouse.width, warehouse.depth, 1)
  const offsetX = canvasPadding + (innerSize - warehouse.width * scale) / 2
  const offsetY = canvasPadding + (innerSize - warehouse.depth * scale) / 2

  ctx.fillStyle = '#F9FAFB'
  ctx.fillRect(0, 0, size, size)

  // 仓库边界
  ctx.strokeStyle = '#D1D5DB'
  ctx.lineWidth = 2
  ctx.strokeRect(offsetX, offsetY, warehouse.width * scale, warehouse.depth * scale)

  // 区域
  if (draftScene.zones) {
    for (const zone of draftScene.zones) {
      const x = offsetX + (zone.position?.x || 0) * scale
      const y = offsetY + (zone.position?.z || 0) * scale
      const w = (zone.size?.width || 2) * scale
      const h = (zone.size?.depth || 2) * scale

      ctx.fillStyle = getZoneColorHex(zone.type)
      ctx.globalAlpha = 0.5
      ctx.fillRect(x, y, w, h)
      ctx.globalAlpha = 1
    }
  }

  // 墙体
  if (draftScene.walls) {
    ctx.strokeStyle = '#4B5563'
    ctx.lineWidth = 3
    for (const wall of draftScene.walls) {
      const x1 = offsetX + (wall.start?.x || 0) * scale
      const y1 = offsetY + (wall.start?.z || 0) * scale
      const x2 = offsetX + (wall.end?.x || 0) * scale
      const y2 = offsetY + (wall.end?.z || 0) * scale
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }
  }

  return canvas.toDataURL('image/png')
}

function getZoneColorHex(type) {
  const colors = {
    storage: '#A78BFA',
    receiving: '#34D399',
    shipping: '#FBBF24',
    office: '#60A5FA',
    cold: '#22D3EE',
    hazardous: '#F87171',
  }
  return colors[type] || '#94A3B8'
}

/**
 * 保存到本地存储
 */
export function saveToLocal(shareId, sceneData) {
  try {
    const key = `share_${shareId}`
    const data = {
      scene: sceneData,
      createdAt: new Date().toISOString(),
      viewCount: 0,
    }
    localStorage.setItem(key, JSON.stringify(data))
    return true
  } catch (error) {
    console.error('保存到本地存储失败:', error)
    return false
  }
}

/**
 * 从本地存储加载
 */
export function loadFromLocal(shareId) {
  try {
    const key = `share_${shareId}`
    const data = localStorage.getItem(key)
    if (data) {
      const parsed = JSON.parse(data)
      // 更新浏览次数
      parsed.viewCount = (parsed.viewCount || 0) + 1
      localStorage.setItem(key, JSON.stringify(parsed))
      return parsed
    }
    return null
  } catch (error) {
    console.error('从本地存储加载失败:', error)
    return null
  }
}
