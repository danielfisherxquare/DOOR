/**
 * 场地底图层（只读）
 *
 * 在 PascalViewer 的 R3F 场景里渲染「卫星正射瓦片地面 + OSM 白模」作为不可编辑的底图，
 * 让可编辑实体（地形/赛事结构）叠在真实卫星地形之上。建筑作为只读背景层，不进
 * editorDocument，因此不会触发大场景退化为静态 2D。
 *
 * 坐标与 model/siteBackdrop.js 的本地米制一致（x=东，z=北，y=上）。
 */
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'

const BUILDING_COLOR = '#d4dae3'
const BUILDING_EDGE_COLOR = '#9aa6b6'

function useTileTexture(url) {
  const [texture, setTexture] = useState(null)
  useEffect(() => {
    let alive = true
    let loadedTexture = null
    setTexture(null)
    const loader = new THREE.TextureLoader()
    loader.setCrossOrigin('anonymous')
    loader.load(
      url,
      (loaded) => {
        loadedTexture = loaded
        if (!alive) {
          loaded.dispose()
          return
        }
        loaded.colorSpace = THREE.SRGBColorSpace
        setTexture(loaded)
      },
      undefined,
      () => {}
    )
    return () => {
      alive = false
      loadedTexture?.dispose()
    }
  }, [url])
  return texture
}

/** 单片卫星瓦片：用四角显式构造一个贴地的 XZ 平面，避免旋转带来的方向歧义 */
function TilePlane({ url, rect, y = 0 }) {
  const texture = useTileTexture(url)
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const { minX, maxX, minZ, maxZ } = rect
    // 四角（世界 x,y,z），北=maxZ 在图像顶部(v=1)，西=minX 在左(u=0)
    const positions = new Float32Array([minX, y, minZ, maxX, y, minZ, maxX, y, maxZ, minX, y, maxZ])
    const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1])
    const indices = [0, 2, 1, 0, 3, 2]
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return geo
  }, [rect, y])
  useEffect(() => () => geometry.dispose(), [geometry])
  if (!texture) return null
  return (
    <mesh geometry={geometry} renderOrder={-10} receiveShadow>
      <meshBasicMaterial map={texture} toneMapped={false} depthWrite={false} />
    </mesh>
  )
}

function SatelliteGround({ tiles }) {
  if (!tiles?.length) return null
  return (
    <group>
      {tiles.map((tile, index) => (
        <TilePlane key={`${tile.url}-${index}`} url={tile.url} rect={tile.rect} y={-0.02} />
      ))}
    </group>
  )
}

/** 把卫星瓦片合成为单张 CanvasTexture（覆盖瓦片并集范围），供地形 drape 使用 */
function useCompositeTexture(tiles) {
  const [texture, setTexture] = useState(null)
  useEffect(() => {
    if (!tiles?.length) {
      setTexture(null)
      return undefined
    }
    let alive = true
    let compositeTexture = null
    setTexture(null)
    let unionMinX = Infinity
    let unionMaxX = -Infinity
    let unionMinZ = Infinity
    let unionMaxZ = -Infinity
    for (const tile of tiles) {
      unionMinX = Math.min(unionMinX, tile.rect.minX)
      unionMaxX = Math.max(unionMaxX, tile.rect.maxX)
      unionMinZ = Math.min(unionMinZ, tile.rect.minZ)
      unionMaxZ = Math.max(unionMaxZ, tile.rect.maxZ)
    }
    const unionWidth = unionMaxX - unionMinX || 1
    const unionDepth = unionMaxZ - unionMinZ || 1
    const tile0Width = tiles[0].rect.maxX - tiles[0].rect.minX || 1
    const pxPerMeter = 256 / tile0Width
    const canvasW = Math.max(16, Math.min(4096, Math.round(unionWidth * pxPerMeter)))
    const canvasH = Math.max(16, Math.min(4096, Math.round(unionDepth * pxPerMeter)))
    const canvas = document.createElement('canvas')
    canvas.width = canvasW
    canvas.height = canvasH
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#9fb0c3'
    ctx.fillRect(0, 0, canvasW, canvasH)

    let remaining = tiles.length
    const finalize = () => {
      if (!alive) return
      // 经 toDataURL 转为图像纹理（比 CanvasTexture 在各渲染后端下更可靠）
      let dataUrl = ''
      try {
        dataUrl = canvas.toDataURL('image/jpeg', 0.92)
      } catch {
        return
      }
      new THREE.TextureLoader().load(dataUrl, (tex) => {
        compositeTexture = tex
        if (!alive) {
          tex.dispose()
          return
        }
        tex.colorSpace = THREE.SRGBColorSpace
        tex.needsUpdate = true
        setTexture(tex)
      })
    }
    tiles.forEach((tile) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      const done = () => {
        remaining -= 1
        if (remaining === 0) finalize()
      }
      img.onload = () => {
        if (!alive) return
        const px = ((tile.rect.minX - unionMinX) / unionWidth) * canvasW
        const py = ((unionMaxZ - tile.rect.maxZ) / unionDepth) * canvasH
        const pw = ((tile.rect.maxX - tile.rect.minX) / unionWidth) * canvasW
        const ph = ((tile.rect.maxZ - tile.rect.minZ) / unionDepth) * canvasH
        try {
          ctx.drawImage(img, px, py, pw, ph)
        } catch {
          /* ignore */
        }
        done()
      }
      img.onerror = done
      img.src = tile.url
    })
    return () => {
      alive = false
      compositeTexture?.dispose()
    }
  }, [tiles])
  return texture
}

/** 卫星纹理随地形起伏铺在地表（drape）：地形网格 + 合成卫星贴图 */
function DrapedTerrain({ terrain, tiles }) {
  const texture = useCompositeTexture(tiles)
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(terrain.positions, 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(terrain.uvs, 2))
    geo.setIndex(terrain.indices)
    geo.computeVertexNormals()
    return geo
  }, [terrain])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} renderOrder={-10}>
      {/* key 随纹理就绪切换，强制重建材质，避免 map 后置时 shader 未重编译（USE_MAP 缺失）导致贴图不显示 */}
      <meshBasicMaterial
        key={texture ? 'textured' : 'plain'}
        map={texture || null}
        color={texture ? '#ffffff' : '#88a0b8'}
        toneMapped={false}
      />
    </mesh>
  )
}

function buildBuildingGeometry(buildings) {
  const merged = []
  const edges = []
  for (const building of buildings) {
    const footprint = building.footprint
    if (!Array.isArray(footprint) || footprint.length < 3) continue
    const shape = new THREE.Shape()
    // 取负 z：配合 rotateX(-90°) 后 footprint 回到世界 (x, z) 不翻转，挤出方向朝上 +y
    shape.moveTo(footprint[0][0], -footprint[0][1])
    for (let i = 1; i < footprint.length; i += 1) {
      shape.lineTo(footprint[i][0], -footprint[i][1])
    }
    shape.closePath()
    const height = Math.max(Number(building.height) || 0, 0.5)
    const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, steps: 1 })
    geo.rotateX(-Math.PI / 2)
    geo.translate(0, Number(building.baseY) || 0, 0)
    merged.push(geo)
    edges.push(new THREE.EdgesGeometry(geo))
  }
  return { merged, edges }
}

function ReadonlyBuildings({ buildings }) {
  const { merged, edges } = useMemo(() => buildBuildingGeometry(buildings || []), [buildings])
  useEffect(
    () => () => {
      merged.forEach((geo) => geo.dispose())
      edges.forEach((geo) => geo.dispose())
    },
    [merged, edges]
  )
  if (!merged.length) return null
  return (
    <group>
      {merged.map((geo, index) => (
        <mesh key={index} geometry={geo} castShadow receiveShadow>
          <meshStandardMaterial color={BUILDING_COLOR} roughness={0.92} metalness={0.02} />
        </mesh>
      ))}
      {edges.map((geo, index) => (
        <lineSegments key={index} geometry={geo} renderOrder={5}>
          <lineBasicMaterial color={BUILDING_EDGE_COLOR} transparent opacity={0.5} />
        </lineSegments>
      ))}
    </group>
  )
}

export default function SiteBackdrop({ data }) {
  if (!data) return null
  return (
    <group name="site-backdrop">
      {data.terrain ? (
        <DrapedTerrain terrain={data.terrain} tiles={data.tiles} />
      ) : (
        <SatelliteGround tiles={data.tiles} />
      )}
      <ReadonlyBuildings buildings={data.buildings} />
    </group>
  )
}
