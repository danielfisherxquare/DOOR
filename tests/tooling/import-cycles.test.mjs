import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const rootDir = fileURLToPath(new URL('../../', import.meta.url))
const srcDir = path.join(rootDir, 'src')
const sourceExtensions = ['.js', '.jsx', '.ts', '.tsx']

async function listSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) return listSourceFiles(entryPath)
      return sourceExtensions.includes(path.extname(entry.name)) ? [entryPath] : []
    }),
  )
  return nested.flat()
}

function resolveLocalImport(importer, specifier, knownFiles) {
  if (!specifier.startsWith('.')) return null
  const basePath = path.resolve(path.dirname(importer), specifier)
  const candidates = [
    basePath,
    ...sourceExtensions.map((extension) => `${basePath}${extension}`),
    ...sourceExtensions.map((extension) => path.join(basePath, `index${extension}`)),
  ]
  return candidates.find((candidate) => knownFiles.has(candidate)) || null
}

function findCycle(graph, entryFile) {
  const active = new Set()
  const visited = new Set()
  const stack = []

  function visit(file) {
    if (active.has(file)) {
      return [...stack.slice(stack.indexOf(file)), file]
    }
    if (visited.has(file)) return null

    active.add(file)
    stack.push(file)
    for (const dependency of graph.get(file) || []) {
      const cycle = visit(dependency)
      if (cycle) return cycle
    }
    stack.pop()
    active.delete(file)
    visited.add(file)
    return null
  }

  return visit(entryFile)
}

test('auth request boundary has no static import cycle', async () => {
  const files = await listSourceFiles(srcDir)
  const knownFiles = new Set(files)
  const graph = new Map()
  const importPattern = /(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g

  for (const file of files) {
    const source = await readFile(file, 'utf8')
    const dependencies = []
    for (const match of source.matchAll(importPattern)) {
      const dependency = resolveLocalImport(file, match[1], knownFiles)
      if (dependency) dependencies.push(dependency)
    }
    graph.set(file, dependencies)
  }

  const entryFile = path.join(srcDir, 'stores/authStore.js')
  const cycle = findCycle(graph, entryFile)
  const printableCycle = cycle?.map((file) => path.relative(rootDir, file)).join(' -> ')

  assert.equal(cycle, null, printableCycle || 'unexpected auth import cycle')
})
