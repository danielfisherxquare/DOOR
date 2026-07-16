import { createAssetClient } from '@arcspro/asset-client'

export interface DesktopSession {
  serverUrl: string
  accessToken: string
  refreshToken: string
  orgId: string
  userName: string
}

export interface DesktopOrganization {
  id: string
  name: string
  slug?: string
}

export interface DesktopPendingOrganizationSelection {
  serverUrl: string
  accessToken: string
  refreshToken: string
  userName: string
  organizations: DesktopOrganization[]
}

export type DesktopLoginResult =
  | { kind: 'session'; session: DesktopSession }
  | { kind: 'organization-selection'; pending: DesktopPendingOrganizationSelection }

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : null
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function responseMessage(payload: unknown, fallback: string): string {
  const body = asRecord(payload)
  const error = asRecord(body?.error)
  return stringValue(error?.message) || stringValue(body?.message) || fallback
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function fetchJson(url: string, init: RequestInit, networkMessage: string): Promise<{ response: Response; payload: unknown }> {
  try {
    const response = await fetch(url, init)
    return { response, payload: await readJson(response) }
  } catch {
    throw new Error(networkMessage)
  }
}

function organizationsFrom(payload: unknown): DesktopOrganization[] {
  const data = asRecord(asRecord(payload)?.data)
  const organizations = Array.isArray(data?.organizations) ? data.organizations : []
  return organizations.flatMap((candidate) => {
    const organization = asRecord(candidate)
    const id = stringValue(organization?.id)
    const name = stringValue(organization?.name)
    if (!id || !name) return []
    const slug = stringValue(organization?.slug)
    return [{ id, name, ...(slug ? { slug } : {}) }]
  })
}

function createTransport(session: DesktopSession, binary = false) {
  async function send(method: string, route: string, data?: unknown, config: Record<string, unknown> = {}) {
    const url = new URL(`/api${route}`, session.serverUrl)
    const params = config.params as Record<string, string | number | undefined> | undefined
    Object.entries(params || {}).forEach(([key, value]) => value !== undefined && url.searchParams.set(key, String(value)))
    const isForm = typeof FormData !== 'undefined' && data instanceof FormData
    let response: Response
    try {
      response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'X-ArcSpro-Scope-Type': 'org',
          'X-ArcSpro-Org-Id': session.orgId,
          ...(!isForm && data !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: data === undefined ? undefined : (isForm ? data : JSON.stringify(data)),
      })
    } catch {
      throw new Error('无法连接团队素材库，请检查 DOOR 服务地址或网络连接')
    }
    const payload = binary ? await response.blob() : await readJson(response)
    if (!response.ok) {
      const error = new Error(binary ? `下载失败（HTTP ${response.status}）` : responseMessage(payload, `HTTP ${response.status}`))
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

export function createDesktopSession(
  pending: DesktopPendingOrganizationSelection,
  orgId: string,
): DesktopSession {
  if (!pending.organizations.some((organization) => organization.id === orgId)) {
    throw new Error('请选择可访问的团队机构')
  }
  return {
    serverUrl: pending.serverUrl,
    accessToken: pending.accessToken,
    refreshToken: pending.refreshToken,
    userName: pending.userName,
    orgId,
  }
}

export async function login(serverUrl: string, account: string, password: string): Promise<DesktopLoginResult> {
  const normalized = serverUrl.replace(/\/+$/, '')
  const { response, payload } = await fetchJson(
    `${normalized}/api/auth/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: account, password }),
    },
    '无法连接 DOOR 服务，请检查服务地址、网络或客户端跨域配置',
  )
  const body = asRecord(payload)
  if (!response.ok || body?.success !== true) {
    throw new Error(responseMessage(payload, response.status === 401 ? '账号或密码错误' : `登录失败（HTTP ${response.status}）`))
  }

  const data = asRecord(body.data)
  const user = asRecord(data?.user)
  const accessToken = stringValue(data?.accessToken)
  const refreshToken = stringValue(data?.refreshToken)
  const userName = stringValue(user?.username) || account
  const orgId = stringValue(user?.orgId) || stringValue(user?.org_id)
  if (!accessToken || !refreshToken) throw new Error('登录响应缺少访问令牌')

  if (orgId) {
    return {
      kind: 'session',
      session: { serverUrl: normalized, accessToken, refreshToken, orgId, userName },
    }
  }

  const context = await fetchJson(
    `${normalized}/api/profile/context-options`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    '登录成功，但无法读取可访问的团队机构',
  )
  if (!context.response.ok) {
    throw new Error(responseMessage(context.payload, `读取团队机构失败（HTTP ${context.response.status}）`))
  }
  const organizations = organizationsFrom(context.payload)
  if (organizations.length === 0) throw new Error('当前账号没有可访问的团队机构')

  const pending: DesktopPendingOrganizationSelection = {
    serverUrl: normalized,
    accessToken,
    refreshToken,
    userName,
    organizations,
  }
  if (organizations.length === 1) {
    return { kind: 'session', session: createDesktopSession(pending, organizations[0].id) }
  }
  return { kind: 'organization-selection', pending }
}
