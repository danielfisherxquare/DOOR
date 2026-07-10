import { lookup as defaultLookup } from 'node:dns/promises'
import { Agent as HttpsAgent } from 'node:https'
import { isIP } from 'node:net'

function unsafe(message) {
  const error = new Error(message)
  error.status = 400
  error.code = 'OCR_BASE_URL_UNSAFE'
  error.expose = true
  return error
}

function isPrivateIpv4(address) {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true
  const [a, b, c] = parts
  return (
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  )
}

function isPrivateIp(address) {
  const normalized = String(address || '')
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
  const family = isIP(normalized)
  if (family === 4) return isPrivateIpv4(normalized)
  if (family !== 6) return true

  const mappedIpv4 = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/u)?.[1]
  if (mappedIpv4) return isPrivateIpv4(mappedIpv4)

  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    /^fe[89ab]/u.test(normalized) ||
    normalized.startsWith('ff') ||
    normalized.startsWith('2001:db8:')
  )
}

function isLocalHostname(hostname) {
  const normalized = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/u, '')
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.internal') ||
    normalized.endsWith('.lan') ||
    normalized.endsWith('.home') ||
    normalized.endsWith('.home.arpa')
  )
}

async function resolvePublicAddresses(hostname, lookup) {
  let addresses
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true })
  } catch {
    throw unsafe('OCR Base URL 主机无法解析')
  }
  const resolved = Array.isArray(addresses) ? addresses : [addresses]
  if (resolved.length === 0 || resolved.some((entry) => isPrivateIp(entry?.address))) {
    throw unsafe('OCR Base URL 必须仅解析到公网地址')
  }
  return resolved
}

export async function assertSafeOcrBaseUrl(value, { lookup = defaultLookup } = {}) {
  const raw = typeof value === 'string' ? value.trim() : ''
  let url
  try {
    url = new URL(raw)
  } catch {
    throw unsafe('OCR Base URL 格式无效')
  }

  if (url.protocol !== 'https:') throw unsafe('OCR Base URL 仅允许 HTTPS')
  if (url.username || url.password) throw unsafe('OCR Base URL 不允许包含账号凭据')
  if (url.search || url.hash) throw unsafe('OCR Base URL 不允许包含查询参数或片段')
  if (!url.hostname || isLocalHostname(url.hostname)) {
    throw unsafe('OCR Base URL 不允许使用本机或内部主机名')
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw unsafe('OCR Base URL 必须使用公网地址')
    return raw.replace(/\/+$/u, '')
  }

  await resolvePublicAddresses(hostname, lookup)

  return raw.replace(/\/+$/u, '')
}

export function createSafeOcrHttpsAgent({ lookup = defaultLookup } = {}) {
  return new HttpsAgent({
    lookup(hostname, options, callback) {
      resolvePublicAddresses(hostname, lookup)
        .then((addresses) => {
          if (options?.all) callback(null, addresses)
          else callback(null, addresses[0].address, addresses[0].family)
        })
        .catch((error) => callback(error))
    },
  })
}
