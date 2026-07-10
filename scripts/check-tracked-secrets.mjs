import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const allowedEnvironmentFiles = new Set(['.env.example', '.env.sample', '.env.template'])
const secretKeyPattern =
  /(?:^|_)(?:API_KEY|SECRET|TOKEN|PASSWORD|ENCRYPTION_KEY|HMAC_KEY|PRIVATE_KEY|PEPPER)$/i
const credentialValuePattern = /^(?:sk|pk|rk|ak)-[A-Za-z0-9_-]{12,}$/i
const binaryExtensionPattern =
  /\.(?:3mf|7z|avif|bin|docx?|eot|gif|gz|ico|jpe?g|mp4|pdf|png|rar|ttf|webm|webp|woff2?|xlsx?|zip)$/i
const assignmentScanPathPattern = /(?:^|\/)\.env(?:\.|$)|\.(?:conf|ini|properties|ya?ml)$/i

function stripWrappingQuotes(value) {
  const trimmed = value.trim().replace(/\s+#.*$/, '').trim()
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

export function isPlaceholderSecretValue(value) {
  const normalized = stripWrappingQuotes(String(value ?? ''))
  if (credentialValuePattern.test(normalized)) return false
  if (!normalized) return true
  if (/^\$\{[^}]+\}$/.test(normalized)) return true
  if (/^<[^>]+>$/.test(normalized)) return true
  if (/^(?:your_|change[_-]?me|replace[_-]?me|placeholder|x{6,})/i.test(normalized)) {
    return true
  }
  return false
}

export function isForbiddenEnvironmentFile(filePath) {
  const basename = path.posix.basename(filePath)
  return basename.startsWith('.env') && !allowedEnvironmentFiles.has(basename)
}

function listTrackedFiles() {
  return execFileSync('git', ['-C', repoRoot, 'ls-files', '-z'], {
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean)
}

export function findSecretAssignmentRules(contents) {
  const rules = new Set()
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(
      /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*[:=]\s*(.*?)\s*[,;]?\s*$/,
    )
    if (!match || !secretKeyPattern.test(match[1])) continue
    if (!isPlaceholderSecretValue(match[2])) rules.add('non-placeholder-secret-assignment')
  }
  return [...rules].sort()
}

export function findTrackedSecretViolations() {
  const violationsByPath = new Map()

  for (const filePath of listTrackedFiles()) {
    const rules = new Set()
    if (isForbiddenEnvironmentFile(filePath)) rules.add('tracked-environment-file')

    const absolutePath = path.join(repoRoot, filePath)
    if (
      existsSync(absolutePath) &&
      !binaryExtensionPattern.test(filePath) &&
      statSync(absolutePath).size <= 1024 * 1024
    ) {
      const contents = readFileSync(absolutePath, 'utf8')
      if (!contents.includes('\0') && assignmentScanPathPattern.test(filePath)) {
        for (const rule of findSecretAssignmentRules(contents)) rules.add(rule)
      }
    }

    if (rules.size > 0) violationsByPath.set(filePath, [...rules].sort())
  }

  return [...violationsByPath.entries()]
    .map(([filePath, rules]) => ({ path: filePath, rules }))
    .sort((left, right) => left.path.localeCompare(right.path))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const violations = findTrackedSecretViolations()
  if (violations.length > 0) {
    console.error('Tracked secret policy violations:')
    for (const violation of violations) {
      console.error(`- ${violation.path} (${violation.rules.join(', ')})`)
    }
    process.exitCode = 1
  } else {
    console.log('Tracked secret policy check passed.')
  }
}
