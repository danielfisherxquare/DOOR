import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const modulesRoot = path.join(serverRoot, 'src/modules')
const ratchet = JSON.parse(
  await readFile(new URL('./module-boundaries.ratchet.json', import.meta.url), 'utf8'),
)

async function listBoundaryFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listBoundaryFiles(absolutePath)))
    } else if (/\.(?:routes|controller)\.js$/.test(entry.name)) {
      files.push(absolutePath)
    }
  }

  return files.sort()
}

async function listJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listJavaScriptFiles(absolutePath)))
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(absolutePath)
    }
  }

  return files.sort()
}

function relativePath(file) {
  return path.relative(serverRoot, file).split(path.sep).join('/')
}

function findClosingParenthesis(source, openIndex) {
  let depth = 0
  let quote = null
  let escaped = false
  let lineComment = false
  let blockComment = false

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]

    if (lineComment) {
      if (char === '\n') lineComment = false
      continue
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false
        index += 1
      }
      continue
    }
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = null
      }
      continue
    }
    if (char === '/' && next === '/') {
      lineComment = true
      index += 1
      continue
    }
    if (char === '/' && next === '*') {
      blockComment = true
      index += 1
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char
      continue
    }
    if (char === '(') depth += 1
    if (char === ')') {
      depth -= 1
      if (depth === 0) return index
    }
  }

  return source.length - 1
}

function findRawRequestPersistenceCalls(file, source) {
  const matches = []
  const callPattern =
    /\b(repo|repository|[A-Za-z_$][\w$]*(?:Repo|Repository))\.([A-Za-z_$][\w$]*)\s*\(/g
  let match

  while ((match = callPattern.exec(source)) !== null) {
    const openIndex = source.indexOf('(', match.index)
    const closeIndex = findClosingParenthesis(source, openIndex)
    const callSource = source.slice(openIndex + 1, closeIndex)
    if (/\breq\.(?:body|query)\b/.test(callSource)) {
      matches.push(`${relativePath(file)}:${match[1]}.${match[2]}`)
    }
    callPattern.lastIndex = closeIndex + 1
  }

  return matches
}

function findConcurrentTransactionQueries(file, source) {
  const matches = []
  const promiseAllPattern = /\bPromise\.all\s*\(/g
  let match

  while ((match = promiseAllPattern.exec(source)) !== null) {
    const openIndex = source.indexOf('(', match.index)
    const closeIndex = findClosingParenthesis(source, openIndex)
    const callSource = source.slice(openIndex + 1, closeIndex)
    if (/\btrx\s*\(/.test(callSource)) {
      matches.push(`${relativePath(file)}:${source.slice(0, match.index).split('\n').length}`)
    }
    promiseAllPattern.lastIndex = closeIndex + 1
  }

  return matches
}

function sortedUnique(values) {
  return [...new Set(values)].sort()
}

describe('backend module boundaries', () => {
  it('ratchets direct database imports in routes and controllers', async () => {
    const violations = []

    for (const file of await listBoundaryFiles(modulesRoot)) {
      const source = await readFile(file, 'utf8')
      if (
        /\bfrom\s+['"][^'"]*\/db\/knex\.js['"]/.test(source) ||
        /\bimport\s*\(\s*['"][^'"]*\/db\/knex\.js['"]\s*\)/.test(source)
      ) {
        violations.push(relativePath(file))
      }
    }

    assert.deepEqual(sortedUnique(violations), sortedUnique(ratchet.directDatabaseImports))
  })

  it('ratchets raw request objects passed to repositories', async () => {
    const violations = []

    for (const file of await listBoundaryFiles(modulesRoot)) {
      const source = await readFile(file, 'utf8')
      violations.push(...findRawRequestPersistenceCalls(file, source))
    }

    assert.deepEqual(sortedUnique(violations), sortedUnique(ratchet.rawRequestPersistenceCalls))
  })

  it('does not run concurrent queries through one transaction client', async () => {
    const violations = []

    for (const file of await listJavaScriptFiles(path.join(serverRoot, 'src'))) {
      const source = await readFile(file, 'utf8')
      violations.push(...findConcurrentTransactionQueries(file, source))
    }

    assert.deepEqual(violations, [])
  })
})
