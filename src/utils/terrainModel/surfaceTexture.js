const WEB_MERCATOR_MAX_LATITUDE = 85.05112878
const DEFAULT_TILE_SIZE = 256
const DEFAULT_MAX_TEXTURE_PIXELS = 10_000_000

export const SURFACE_TEXTURE_SOURCES = {
  esriWorldImagery: {
    key: 'esriWorldImagery',
    name: 'Esri World Imagery',
    kind: 'xyz-template',
    attribution: 'Source: Esri World Imagery',
    urlTemplate: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  },
  googleSatellite: {
    key: 'googleSatellite',
    name: 'Google 卫星影像',
    kind: 'google-map-tiles',
    attribution: 'Source: Google Maps Tiles API',
    maxZoom: 20,
  },
  cesiumIonRaster: {
    key: 'cesiumIonRaster',
    name: 'Cesium ion 影像',
    kind: 'cesium-ion-raster',
    attribution: 'Source: Cesium ion imagery',
    maxZoom: 20,
  },
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function round(value, digits = 6) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function pickNumber(value, fallback = null) {
  const nextValue = Number(value)
  return Number.isFinite(nextValue) ? nextValue : fallback
}

function pickString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function encodeTemplateValue(value) {
  return encodeURIComponent(String(value ?? ''))
}

function appendUrlParam(url, key, value) {
  const separator = String(url).includes('?') ? '&' : '?'
  return String(url) + separator + encodeURIComponent(key) + '=' + encodeTemplateValue(value)
}

function getQuadkey(x, y, z) {
  let quadkey = ''
  for (let i = z; i > 0; i -= 1) {
    let digit = 0
    const mask = 1 << (i - 1)
    if ((x & mask) !== 0) digit += 1
    if ((y & mask) !== 0) digit += 2
    quadkey += String(digit)
  }
  return quadkey
}

function pickSubdomain(subdomains, tile) {
  const values = Array.isArray(subdomains)
    ? subdomains
    : String(subdomains || 'abc').split('')
  const safeValues = values.filter(Boolean)
  if (!safeValues.length) return ''
  return safeValues[Math.abs(tile.x + tile.y) % safeValues.length]
}

function getUrlOrigin(value, fallback = 'https://dev.virtualearth.net') {
  try {
    return new URL(value || fallback).origin
  } catch (error) {
    void error
    return fallback
  }
}

function normalizeBounds(bounds = {}) {
  const west = pickNumber(bounds.west)
  const east = pickNumber(bounds.east)
  const south = pickNumber(bounds.south)
  const north = pickNumber(bounds.north)
  if (![west, east, south, north].every(Number.isFinite) || west >= east || south >= north) {
    throw new Error('卫星贴图范围无效')
  }
  return {
    west: clamp(west, -180, 180),
    east: clamp(east, -180, 180),
    south: clamp(south, -WEB_MERCATOR_MAX_LATITUDE, WEB_MERCATOR_MAX_LATITUDE),
    north: clamp(north, -WEB_MERCATOR_MAX_LATITUDE, WEB_MERCATOR_MAX_LATITUDE),
  }
}

export function lonLatToTilePoint(longitude, latitude, zoom) {
  const resolvedZoom = Math.max(0, Math.round(Number(zoom) || 0))
  const scale = 2 ** resolvedZoom
  const lon = clamp(Number(longitude), -180, 180)
  const lat = clamp(Number(latitude), -WEB_MERCATOR_MAX_LATITUDE, WEB_MERCATOR_MAX_LATITUDE)
  const latRadians = (lat * Math.PI) / 180
  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + Math.sin(latRadians)) / (1 - Math.sin(latRadians))) / (4 * Math.PI)) * scale,
  }
}

export function tilePointToLonLat(x, y, zoom) {
  const resolvedZoom = Math.max(0, Math.round(Number(zoom) || 0))
  const scale = 2 ** resolvedZoom
  const longitude = (Number(x) / scale) * 360 - 180
  const n = Math.PI - (2 * Math.PI * Number(y)) / scale
  const latitude = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
  return { longitude, latitude }
}

function buildTileUrl(template, tile, sourceOptions = {}) {
  const replacements = {
    z: tile.z,
    x: tile.x,
    y: tile.y,
    '$z': tile.z,
    '$x': tile.x,
    '$y': tile.y,
    s: pickSubdomain(sourceOptions.subdomains, tile),
    subdomain: pickSubdomain(sourceOptions.subdomains, tile),
    quadkey: getQuadkey(tile.x, tile.y, tile.z),
    culture: sourceOptions.culture || 'zh-CN',
    apiKey: sourceOptions.apiKey,
    api_key: sourceOptions.apiKey,
    accessToken: sourceOptions.accessToken,
    access_token: sourceOptions.accessToken,
    assetId: sourceOptions.assetId,
    session: sourceOptions.session,
  }
  return String(template || '')
    .replace(/\{([^{}]+)\}/g, (match, key) => {
      if (!Object.prototype.hasOwnProperty.call(replacements, key)) return match
      const value = replacements[key]
      if (value === undefined || value === null || value === '') return ''
      return ['x', 'y', 'z', '$x', '$y', '$z', 'quadkey', 's', 'subdomain'].includes(key)
        ? String(value)
        : encodeTemplateValue(value)
    })
}

export function buildBingImageryMetadataUrl(options = {}) {
  const key = pickString(options.key)
  if (!key) {
    throw new Error('Cesium ion Bing 影像缺少授权 Key')
  }
  const mapStyle = pickString(options.mapStyle) || 'Aerial'
  return getUrlOrigin(options.baseUrl)
    + '/REST/v1/Imagery/Metadata/' + encodeURIComponent(mapStyle)
    + '?output=json&include=ImageryProviders&key=' + encodeTemplateValue(key)
}

function getBingMetadataResource(payload = {}) {
  const resourceSets = Array.isArray(payload.resourceSets) ? payload.resourceSets : []
  for (const resourceSet of resourceSets) {
    const resources = Array.isArray(resourceSet?.resources) ? resourceSet.resources : []
    const resource = resources.find((item) => typeof item?.imageUrl === 'string' && item.imageUrl.includes('{quadkey}'))
    if (resource) return resource
  }
  return null
}

async function fetchBingImageryTemplate(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    throw new Error('当前环境无法请求 Cesium ion Bing 影像')
  }
  const metadataUrl = buildBingImageryMetadataUrl({
    baseUrl: options.baseUrl,
    key: options.key,
    mapStyle: options.mapStyle,
  })
  const response = await fetchImpl(metadataUrl, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  })
  if (!response?.ok) {
    throw new Error('Cesium ion Bing 影像元数据获取失败')
  }
  const payload = await response.json()
  const resource = getBingMetadataResource(payload)
  if (!resource) {
    throw new Error('Cesium ion Bing 影像元数据无可用瓦片模板')
  }
  return {
    urlTemplate: resource.imageUrl,
    subdomains: Array.isArray(resource.imageUrlSubdomains) ? resource.imageUrlSubdomains : [],
    minZoom: pickNumber(resource.zoomMin),
    maxZoom: pickNumber(resource.zoomMax),
  }
}

export function buildGoogleMapTilesSessionRequest(options = {}) {
  const apiKey = pickString(options.apiKey)
  if (!apiKey) {
    throw new Error('请填写 Google Maps Tiles API Key')
  }
  const body = {
    mapType: pickString(options.mapType) || 'satellite',
    language: pickString(options.language) || 'zh-CN',
    region: pickString(options.region) || 'CN',
  }
  return {
    method: 'POST',
    url: appendUrlParam('https://tile.googleapis.com/v1/createSession', 'key', apiKey),
    headers: {
      'Content-Type': 'application/json',
    },
    body,
    bodyText: JSON.stringify(body),
  }
}

export async function createGoogleMapTilesSession(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    throw new Error('当前环境无法请求 Google Maps Tiles API')
  }
  const request = buildGoogleMapTilesSessionRequest(options)
  const response = await fetchImpl(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.bodyText,
  })
  if (!response?.ok) {
    throw new Error('Google Maps Tiles session 创建失败')
  }
  const payload = await response.json()
  const session = pickString(payload?.session)
  if (!session) {
    throw new Error('Google Maps Tiles session 响应无效')
  }
  return {
    session,
    expiry: payload?.expiry || null,
    tileWidth: pickNumber(payload?.tileWidth),
    tileHeight: pickNumber(payload?.tileHeight),
  }
}

export function buildGoogleMapTileUrl(options = {}) {
  const apiKey = pickString(options.apiKey)
  const session = pickString(options.session)
  const z = Math.max(0, Math.round(Number(options.z) || 0))
  const x = Math.max(0, Math.round(Number(options.x) || 0))
  const y = Math.max(0, Math.round(Number(options.y) || 0))
  if (!apiKey) {
    throw new Error('请填写 Google Maps Tiles API Key')
  }
  if (!session) {
    throw new Error('请先创建 Google Maps Tiles session')
  }
  return 'https://tile.googleapis.com/v1/2dtiles/' + z + '/' + x + '/' + y
    + '?session=' + encodeTemplateValue(session)
    + '&key=' + encodeTemplateValue(apiKey)
}

export function buildCesiumIonAssetEndpointRequest(options = {}) {
  const assetId = pickString(options.assetId)
  const accessToken = pickString(options.accessToken)
  if (!assetId) {
    throw new Error('请填写 Cesium ion Asset ID')
  }
  if (!accessToken) {
    throw new Error('请填写 Cesium ion Token')
  }
  return {
    method: 'GET',
    url: appendUrlParam('https://api.cesium.com/v1/assets/' + encodeURIComponent(assetId) + '/endpoint', 'access_token', accessToken),
    headers: {
      Accept: 'application/json',
    },
  }
}

function findCesiumIonUrlTemplate(endpoint = {}) {
  const candidates = [
    endpoint.url,
    endpoint.templateUrl,
    endpoint.urlTemplate,
    endpoint.options?.url,
    endpoint.options?.templateUrl,
    endpoint.options?.urlTemplate,
    endpoint.resource?.url,
    endpoint.tiles?.url,
  ]
  return candidates.find((candidate) => (
    typeof candidate === 'string'
    && (
      /\{\s*z\s*\}/i.test(candidate)
      || /\{\s*\$z\s*\}/i.test(candidate)
      || /\{\s*quadkey\s*\}/i.test(candidate)
    )
  )) || ''
}

function ensureCesiumIonAccessTokenTemplate(urlTemplate, accessToken) {
  if (!accessToken) return urlTemplate
  if (/\{accessToken\}|\{access_token\}|access_token=|accessToken=|[?&]token=/i.test(urlTemplate)) {
    return urlTemplate
  }
  return urlTemplate + (urlTemplate.includes('?') ? '&' : '?') + 'access_token={accessToken}'
}

export function buildCesiumIonRasterTileUrl(options = {}) {
  const urlTemplate = pickString(options.urlTemplate)
  if (!urlTemplate) {
    throw new Error('请填写 Cesium ion URL 模板')
  }
  const shouldAppendAccessToken = options.appendAccessToken !== false && options.externalType !== 'BING'
  const template = shouldAppendAccessToken
    ? ensureCesiumIonAccessTokenTemplate(urlTemplate, pickString(options.accessToken))
    : urlTemplate
  return buildTileUrl(template, {
    z: Math.max(0, Math.round(Number(options.z) || 0)),
    x: Math.max(0, Math.round(Number(options.x) || 0)),
    y: Math.max(0, Math.round(Number(options.y) || 0)),
  }, options)
}

export async function fetchCesiumIonRasterSourceOptions(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    throw new Error('当前环境无法请求 Cesium ion')
  }
  const request = buildCesiumIonAssetEndpointRequest(options)
  const response = await fetchImpl(request.url, {
    method: request.method,
    headers: request.headers,
  })
  if (!response?.ok) {
    throw new Error('Cesium ion Asset 端点解析失败')
  }
  const endpoint = await response.json()
  const urlTemplate = findCesiumIonUrlTemplate(endpoint)
  if (!urlTemplate && endpoint?.externalType === 'BING') {
    const bingOptions = endpoint.options || {}
    const imageryTemplate = await fetchBingImageryTemplate({
      fetchImpl,
      baseUrl: bingOptions.url,
      key: bingOptions.key,
      mapStyle: bingOptions.mapStyle,
    })
    return {
      accessToken: pickString(options.accessToken),
      assetId: pickString(options.assetId),
      urlTemplate: imageryTemplate.urlTemplate,
      subdomains: imageryTemplate.subdomains,
      culture: pickString(options.culture) || 'zh-CN',
      appendAccessToken: false,
      minZoom: imageryTemplate.minZoom,
      maxZoom: imageryTemplate.maxZoom,
      endpointType: endpoint?.type || null,
      externalType: endpoint?.externalType || null,
      mapStyle: bingOptions.mapStyle || null,
    }
  }
  if (!urlTemplate) {
    throw new Error('该 Cesium ion Asset 不是可直接导出的栅格瓦片')
  }
  return {
    accessToken: pickString(options.accessToken),
    assetId: pickString(options.assetId),
      urlTemplate,
      endpointType: endpoint?.type || null,
      externalType: endpoint?.externalType || null,
  }
}

export function resolveSurfaceTextureSource(sourceKey = 'esriWorldImagery', sourceOptions = {}) {
  const baseSource = SURFACE_TEXTURE_SOURCES[sourceKey] || SURFACE_TEXTURE_SOURCES.esriWorldImagery
  if (baseSource.kind === 'google-map-tiles') {
    const apiKey = pickString(sourceOptions.apiKey)
    const session = pickString(sourceOptions.session)
    if (!apiKey) {
      throw new Error('请填写 Google Maps Tiles API Key')
    }
    if (!session) {
      throw new Error('请先创建 Google Maps Tiles session')
    }
    return {
      ...baseSource,
      sourceOptions: {
        apiKey,
        session,
      },
    }
  }
  if (baseSource.kind === 'cesium-ion-raster') {
    const accessToken = pickString(sourceOptions.accessToken)
    const assetId = pickString(sourceOptions.assetId)
    const urlTemplate = pickString(sourceOptions.urlTemplate)
    if (!urlTemplate) {
      throw new Error('请填写 Cesium ion URL 模板，或先解析 Asset 端点')
    }
    return {
      ...baseSource,
      urlTemplate,
      sourceOptions: {
        ...sourceOptions,
        accessToken,
        assetId,
        urlTemplate,
      },
      minZoom: pickNumber(sourceOptions.minZoom, baseSource.minZoom),
      maxZoom: pickNumber(sourceOptions.maxZoom, baseSource.maxZoom),
    }
  }
  return {
    ...baseSource,
    sourceOptions,
  }
}

function buildTileUrlForSource(source, tile) {
  if (source.kind === 'google-map-tiles') {
    return buildGoogleMapTileUrl({ ...source.sourceOptions, ...tile })
  }
  if (source.kind === 'cesium-ion-raster') {
    return buildCesiumIonRasterTileUrl({ ...source.sourceOptions, ...tile, urlTemplate: source.urlTemplate })
  }
  return buildTileUrl(source.urlTemplate, tile, source.sourceOptions)
}

function getTileRange(bounds, zoom) {
  const northwest = lonLatToTilePoint(bounds.west, bounds.north, zoom)
  const southeast = lonLatToTilePoint(bounds.east, bounds.south, zoom)
  const maxIndex = (2 ** zoom) - 1
  return {
    minX: clamp(Math.floor(northwest.x), 0, maxIndex),
    maxX: clamp(Math.floor(southeast.x), 0, maxIndex),
    minY: clamp(Math.floor(northwest.y), 0, maxIndex),
    maxY: clamp(Math.floor(southeast.y), 0, maxIndex),
  }
}

function buildPlanForZoom(bounds, source, zoom, options) {
  const tileSize = Math.max(128, Math.round(Number(options.tileSize) || DEFAULT_TILE_SIZE))
  const range = getTileRange(bounds, zoom)
  const tileColumns = range.maxX - range.minX + 1
  const tileRows = range.maxY - range.minY + 1
  const tileCount = tileColumns * tileRows
  const fullPixelWidth = tileColumns * tileSize
  const fullPixelHeight = tileRows * tileSize
  const maxTextureSize = Math.max(tileSize, Math.round(Number(options.maxTextureSize) || 2048))
  const maxTexturePixels = Math.max(tileSize * tileSize, Math.round(Number(options.maxTexturePixels) || DEFAULT_MAX_TEXTURE_PIXELS))
  const resizeScale = Math.min(
    1,
    maxTextureSize / Math.max(fullPixelWidth, fullPixelHeight),
    Math.sqrt(maxTexturePixels / Math.max(1, fullPixelWidth * fullPixelHeight)),
  )
  const tiles = []
  for (let y = range.minY; y <= range.maxY; y += 1) {
    for (let x = range.minX; x <= range.maxX; x += 1) {
      const tile = { x, y, z: zoom }
      tiles.push({
        ...tile,
        col: x - range.minX,
        row: y - range.minY,
        url: buildTileUrlForSource(source, tile),
      })
    }
  }
  const northwest = tilePointToLonLat(range.minX, range.minY, zoom)
  const southeast = tilePointToLonLat(range.maxX + 1, range.maxY + 1, zoom)

  const textureWidth = Math.max(1, Math.round(fullPixelWidth * resizeScale))
  const textureHeight = Math.max(1, Math.round(fullPixelHeight * resizeScale))

  return {
    source,
    zoom,
    tileSize,
    tileRange: range,
    tileColumns,
    tileRows,
    tileCount,
    fullPixelWidth,
    fullPixelHeight,
    textureWidth,
    textureHeight,
    texturePixelCount: textureWidth * textureHeight,
    maxTexturePixels,
    bounds,
    coverageBounds: {
      west: round(northwest.longitude),
      east: round(southeast.longitude),
      south: round(southeast.latitude),
      north: round(northwest.latitude),
    },
    tiles,
  }
}

function isTexturePlanWithinBudget(plan, maxTiles) {
  return plan.tileCount <= maxTiles
}

function annotateTexturePlan(plan, options) {
  const requestedZoom = Number.isFinite(options.requestedZoom) ? options.requestedZoom : null
  const budgetZoom = requestedZoom ?? options.maxZoom
  return {
    ...plan,
    requestedZoom,
    maxTiles: options.maxTiles,
    maxTextureSize: options.maxTextureSize,
    budgetLimited: Number.isFinite(budgetZoom) ? plan.zoom < budgetZoom : false,
    budget: {
      maxTiles: options.maxTiles,
      maxTextureSize: options.maxTextureSize,
      maxTexturePixels: options.maxTexturePixels,
    },
  }
}

export function buildSurfaceTextureTilePlan(bounds, options = {}) {
  const normalizedBounds = normalizeBounds(bounds)
  const source = resolveSurfaceTextureSource(options.sourceKey, options.sourceOptions || {})
  const minZoom = clamp(Math.round(Number(options.minZoom) || 8), 0, 18)
  const sourceMaxZoom = Number.isFinite(Number(source.maxZoom)) ? Number(source.maxZoom) : 18
  const maxZoom = clamp(Math.round(Number(options.maxZoom) || 15), minZoom, sourceMaxZoom)
  const requestedZoom = Number.isFinite(Number(options.zoom))
    ? clamp(Math.round(Number(options.zoom)), minZoom, maxZoom)
    : null
  const maxTiles = Math.max(1, Math.round(Number(options.maxTiles) || 24))
  const maxTextureSize = Math.max(DEFAULT_TILE_SIZE, Math.round(Number(options.maxTextureSize) || 2048))
  const maxTexturePixels = Math.max(DEFAULT_TILE_SIZE * DEFAULT_TILE_SIZE, Math.round(Number(options.maxTexturePixels) || DEFAULT_MAX_TEXTURE_PIXELS))
  const planOptions = {
    ...options,
    maxTextureSize,
    maxTexturePixels,
  }
  const budgetOptions = {
    requestedZoom,
    maxZoom,
    maxTiles,
    maxTextureSize,
    maxTexturePixels,
  }

  const startZoom = requestedZoom ?? maxZoom
  for (let zoom = startZoom; zoom >= minZoom; zoom -= 1) {
    const plan = buildPlanForZoom(normalizedBounds, source, zoom, planOptions)
    if (isTexturePlanWithinBudget(plan, maxTiles)) {
      return annotateTexturePlan(plan, budgetOptions)
    }
  }

  const fallbackPlan = buildPlanForZoom(normalizedBounds, source, minZoom, planOptions)
  throw new Error(
    '卫星贴图范围过大：最低 z' + minZoom
      + ' 仍需 ' + fallbackPlan.tileCount
      + ' 张瓦片，超过当前 ' + maxTiles
      + ' 张预算。请降低贴图精度或缩小地形外扩范围。',
  )
}

export function getTerrainSurfaceUv(vertex, dimensions = {}) {
  const terrainWidthMm = Math.max(0.001, Number(dimensions.terrainWidthMm) || 0)
  const terrainDepthMm = Math.max(0.001, Number(dimensions.terrainDepthMm) || 0)
  return {
    u: round(clamp(((Number(vertex?.x) || 0) + terrainWidthMm / 2) / terrainWidthMm, 0, 1), 6),
    v: round(clamp(1 - (((Number(vertex?.z) || 0) + terrainDepthMm / 2) / terrainDepthMm), 0, 1), 6),
  }
}

function loadImage(url, options = {}) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const timeoutMs = Math.max(0, Math.round(Number(options.tileTimeoutMs) || 15000))
    let timeoutId = null
    let settled = false
    const finish = (handler, value) => {
      if (settled) return
      settled = true
      if (timeoutId !== null) window.clearTimeout(timeoutId)
      handler(value)
    }
    if (timeoutMs > 0 && typeof window !== 'undefined') {
      timeoutId = window.setTimeout(() => {
        finish(reject, new Error('卫星贴图片加载超时'))
      }, timeoutMs)
    }
    image.crossOrigin = options.crossOrigin || 'anonymous'
    image.onload = () => finish(resolve, image)
    image.onerror = () => finish(reject, new Error('卫星贴图片加载失败'))
    image.src = url
  })
}

function reportTextureProgress(callback, payload) {
  if (typeof callback !== 'function') return
  try {
    callback(payload)
  } catch (error) {
    void error
  }
}

function yieldToBrowser() {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => resolve())
      return
    }
    setTimeout(resolve, 0)
  })
}

function canvasToDataUrl(canvas, mimeType, quality) {
  if (typeof canvas.toBlob === 'function' && typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('卫星贴图编码失败'))
          return
        }
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(new Error('卫星贴图编码失败'))
        reader.readAsDataURL(blob)
      }, mimeType, quality)
    })
  }
  return Promise.resolve(canvas.toDataURL(mimeType, quality))
}

function getTileConcurrency(options = {}) {
  return clamp(Math.round(Number(options.tileConcurrency) || 4), 1, 8)
}

function getTileLoadErrorMessage(error) {
  return error instanceof Error && error.message ? error.message : '瓦片加载失败'
}

function getTextureTileLoader(options = {}) {
  if (typeof options.loadImage === 'function') {
    return options.loadImage
  }
  return (url) => loadImage(url, options)
}

function drawTextureTile(context, image, tile, plan, scaleX, scaleY) {
  context.drawImage(
    image,
    tile.col * plan.tileSize * scaleX,
    tile.row * plan.tileSize * scaleY,
    plan.tileSize * scaleX,
    plan.tileSize * scaleY,
  )
}

async function renderTextureTiles(context, plan, scaleX, scaleY, options = {}) {
  const loadTextureTile = getTextureTileLoader(options)
  const allowPartialTiles = options.allowPartialTiles !== false
  const concurrency = Math.min(getTileConcurrency(options), plan.tiles.length)
  const yieldEveryTiles = Math.max(1, Math.round(Number(options.yieldEveryTiles) || 4))
  const missingTiles = []
  let completedTiles = 0
  let nextTileIndex = 0

  const worker = async () => {
    while (nextTileIndex < plan.tiles.length) {
      const tile = plan.tiles[nextTileIndex]
      nextTileIndex += 1
      reportTextureProgress(options.onProgress, {
        phase: 'loading-tile',
        completedTiles,
        totalTiles: plan.tileCount,
        tile,
        plan,
      })
      try {
        const image = await loadTextureTile(tile.url, tile, options)
        drawTextureTile(context, image, tile, plan, scaleX, scaleY)
        completedTiles += 1
        reportTextureProgress(options.onProgress, {
          phase: 'drawn-tile',
          completedTiles,
          totalTiles: plan.tileCount,
          tile,
          plan,
        })
      } catch (error) {
        completedTiles += 1
        const missingTile = {
          x: tile.x,
          y: tile.y,
          z: tile.z,
          col: tile.col,
          row: tile.row,
          message: getTileLoadErrorMessage(error),
        }
        missingTiles.push(missingTile)
        reportTextureProgress(options.onProgress, {
          phase: 'missing-tile',
          completedTiles,
          totalTiles: plan.tileCount,
          tile,
          missingTile,
          plan,
        })
        if (!allowPartialTiles) {
          throw error
        }
      }
      if (completedTiles % yieldEveryTiles === 0) {
        await yieldToBrowser()
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  if (missingTiles.length >= plan.tileCount) {
    throw new Error('卫星贴图片全部加载失败')
  }
  return missingTiles
}

export async function buildSurfaceTextureDataUrl(bounds, options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('当前环境无法生成卫星贴图')
  }
  const plan = buildSurfaceTextureTilePlan(bounds, options)
  reportTextureProgress(options.onProgress, { phase: 'plan', plan })
  await yieldToBrowser()
  const canvas = document.createElement('canvas')
  canvas.width = plan.textureWidth
  canvas.height = plan.textureHeight
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('当前浏览器无法创建卫星贴图画布')
  }
  context.fillStyle = '#d6d3d1'
  context.fillRect(0, 0, canvas.width, canvas.height)
  const scaleX = plan.textureWidth / plan.fullPixelWidth
  const scaleY = plan.textureHeight / plan.fullPixelHeight

  const missingTiles = await renderTextureTiles(context, plan, scaleX, scaleY, options)
  const qualityWarnings = missingTiles.length
    ? [missingTiles.length + ' 张卫星贴图片加载失败，已用底色保留预览']
    : []

  const mimeType = options.mimeType || 'image/jpeg'
  const quality = Number.isFinite(Number(options.quality)) ? Number(options.quality) : 0.9
  reportTextureProgress(options.onProgress, {
    phase: 'encoding',
    completedTiles: plan.tileCount,
    totalTiles: plan.tileCount,
    plan,
  })
  await yieldToBrowser()

  // Capture raw RGBA pixel data before JPEG compression.
  // This is used by the satellite color-mapping mode to extract real terrain
  // colors from the satellite imagery for multi-material FDM printing.
  const includeRawImageData = options.includeRawImageData === true
  const rawImageData = includeRawImageData
    ? context.getImageData(0, 0, canvas.width, canvas.height)
    : null

  const imageUrl = await canvasToDataUrl(canvas, mimeType, quality)
  reportTextureProgress(options.onProgress, {
    phase: 'done',
    completedTiles: plan.tileCount,
    totalTiles: plan.tileCount,
    plan,
  })
  return {
    kind: 'terrain-surface-texture',
    ...plan,
    mimeType,
    imageUrl,
    rawImageData,
    missingTileCount: missingTiles.length,
    missingTiles,
    qualityWarnings,
    generatedAt: new Date().toISOString(),
  }
}
