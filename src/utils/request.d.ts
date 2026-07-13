export interface RequestConfig {
  params?: Record<string, unknown>
  headers?: Record<string, string>
  responseType?: string
  timeout?: number
}

export interface RequestClient {
  get(url: string, config?: RequestConfig): Promise<unknown>
  post(url: string, data?: unknown, config?: RequestConfig): Promise<unknown>
  put(url: string, data?: unknown, config?: RequestConfig): Promise<unknown>
  patch(url: string, data?: unknown, config?: RequestConfig): Promise<unknown>
  delete(url: string, config?: RequestConfig): Promise<unknown>
}

declare const request: RequestClient

export const requestWithLongTimeout: RequestClient
export default request
