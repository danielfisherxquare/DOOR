import { createAssetClient } from '@arcspro/asset-client'

export interface DesktopSession {
  serverUrl: string
  accessToken: string
  refreshToken: string
  orgId: string
  userName: string
}

function createTransport(session: DesktopSession, binary = false) {
  async function send(method: string, route: string, data?: unknown, config: Record<string, unknown> = {}) {
    const url = new URL(`/api${route}`, session.serverUrl)
    const params = config.params as Record<string, string | number | undefined> | undefined
    Object.entries(params || {}).forEach(([key, value]) => value !== undefined && url.searchParams.set(key, String(value)))
    const isForm = typeof FormData !== 'undefined' && data instanceof FormData
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'X-ArcSpro-Scope-Type': 'org',
        'X-ArcSpro-Org-Id': session.orgId,
        ...(!isForm && data !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: data === undefined ? undefined : (isForm ? data : JSON.stringify(data)),
    })
    const payload = binary ? await response.blob() : await response.json()
    if (!response.ok) {
      const error = new Error((payload as { error?: { message?: string }; message?: string })?.error?.message || (payload as { message?: string })?.message || `HTTP ${response.status}`)
      Object.assign(error, { status: response.status, response: { status: response.status, data: payload } })
      throw error
    }
    return binary ? { data: payload } : payload
  }
  return {
    get: (route: string, config?: Record<string, unknown>) => send('GET', route, undefined, config),
    post: (route: string, data?: unknown, config?: Record<string, unknown>) => send('POST', route, data, config),
    patch: (route: string, data?: unknown, config?: Record<string, unknown>) => send('PATCH', route, data, config),
    delete: (route: string, config?: Record<string, unknown>) => send('DELETE', route, undefined, config),
  }
}

export function desktopAssetClient(session: DesktopSession) {
  return createAssetClient({ request: createTransport(session), rawRequest: createTransport(session, true) })
}

export async function login(serverUrl: string, account: string, password: string): Promise<DesktopSession> {
  const normalized = serverUrl.replace(/\/+$/, '')
  const response = await fetch(`${normalized}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: account, password }),
  })
  const payload = await response.json()
  if (!response.ok || !payload.success) throw new Error(payload?.error?.message || payload?.message || '登录失败')
  const orgId = payload.data.user?.orgId || payload.data.user?.org_id
  if (!orgId) throw new Error('当前账号没有机构工作区')
  return {
    serverUrl: normalized,
    accessToken: payload.data.accessToken,
    refreshToken: payload.data.refreshToken,
    orgId: String(orgId),
    userName: payload.data.user?.username || account,
  }
}
