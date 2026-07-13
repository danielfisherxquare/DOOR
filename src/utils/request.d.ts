import type { AxiosRequestConfig, AxiosResponse } from 'axios'

export type RequestConfig = AxiosRequestConfig

export interface RequestClient {
  get<T = unknown>(url: string, config?: RequestConfig): Promise<T>
  post<T = unknown>(url: string, data?: unknown, config?: RequestConfig): Promise<T>
  put<T = unknown>(url: string, data?: unknown, config?: RequestConfig): Promise<T>
  patch<T = unknown>(url: string, data?: unknown, config?: RequestConfig): Promise<T>
  delete<T = unknown>(url: string, config?: RequestConfig): Promise<T>
}

export interface RawRequestClient {
  get<T = unknown>(url: string, config?: RequestConfig): Promise<AxiosResponse<T>>
  post<T = unknown>(url: string, data?: unknown, config?: RequestConfig): Promise<AxiosResponse<T>>
  put<T = unknown>(url: string, data?: unknown, config?: RequestConfig): Promise<AxiosResponse<T>>
  patch<T = unknown>(url: string, data?: unknown, config?: RequestConfig): Promise<AxiosResponse<T>>
  delete<T = unknown>(url: string, config?: RequestConfig): Promise<AxiosResponse<T>>
}

declare const request: RequestClient

export const requestWithLongTimeout: RequestClient
export const requestRaw: RawRequestClient
export default request
