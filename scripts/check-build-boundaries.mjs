import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const distDirectory = path.resolve('dist')
const assetsDirectory = path.join(distDirectory, 'assets')
const indexHtml = await readFile(path.join(distDirectory, 'index.html'), 'utf8')
const assetFiles = await readdir(assetsDirectory)
const modulePreloads = [...indexHtml.matchAll(/rel="modulepreload"[^>]+href="([^"]+)"/g)]
  .map((match) => match[1])

const forbiddenInitialChunks = ['vendor-react-three', 'vendor-three-core', 'StudioProjectPage']
const leakedInitialChunks = modulePreloads.filter((href) => (
  forbiddenInitialChunks.some((chunkName) => href.includes(chunkName))
))

if (leakedInitialChunks.length > 0) {
  throw new Error(`3D-only chunks leaked into the initial preload graph: ${leakedInitialChunks.join(', ')}`)
}

if (assetFiles.some((file) => file.startsWith('vendor-docs-'))) {
  throw new Error('Independent document tools were merged back into vendor-docs')
}

async function assertChunkSize(prefix, limitBytes) {
  const chunks = assetFiles.filter((file) => file.startsWith(prefix) && file.endsWith('.js'))
  if (chunks.length !== 1) {
    throw new Error(`Expected one ${prefix} chunk, found ${chunks.length}`)
  }

  const chunk = chunks[0]
  const { size } = await stat(path.join(assetsDirectory, chunk))
  if (size > limitBytes) {
    throw new Error(`${chunk} is ${size} bytes; limit is ${limitBytes}`)
  }

  return { chunk, size }
}

const chunkLimit = 500 * 1024
const checkedChunks = await Promise.all([
  assertChunkSize('vendor-echarts-', chunkLimit),
  assertChunkSize('vendor-xlsx-', chunkLimit),
])

console.log('Build boundary check passed.', {
  initialPreloads: modulePreloads.length,
  checkedChunks,
})
