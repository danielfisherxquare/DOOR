import profileApi from '../../api/profile'
import { normalizeWorkspaceOptions } from './workspaceSession'

export async function fetchWorkspaceOptions(params = {}) {
  const response = await profileApi.getContextOptions(params)
  if (!response?.success) {
    throw new Error(response?.message || '无法读取工作区选项')
  }
  return normalizeWorkspaceOptions(response.data || {})
}
