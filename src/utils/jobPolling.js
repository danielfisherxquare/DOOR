import request from './request'
import { unwrapData } from './apiResponse'

const DEFAULT_POLL_INTERVAL = 1000 // 1 秒
const DEFAULT_POLL_TIMEOUT = 120000 // 2 分钟

/**
 * 轮询 Job 结果（共享实现）
 * @param {string} jobId - Job ID
 * @param {object} [options] - 轮询选项
 * @param {number} [options.interval] - 轮询间隔（毫秒）
 * @param {number} [options.timeout] - 超时时间（毫秒）
 * @param {function} [options.onProgress] - 进度回调
 * @param {string} [options.jobsBasePath] - Job 查询路径前缀（默认 /jobs）
 * @param {string} [options.errorLabel] - 错误消息中的任务名称（默认 '任务'）
 * @returns {Promise<object>} Job result
 */
export async function pollJobResult(jobId, options = {}) {
  const interval = options.interval || DEFAULT_POLL_INTERVAL
  const timeout = options.timeout || DEFAULT_POLL_TIMEOUT
  const onProgress = options.onProgress || (() => {})
  const jobsBasePath = options.jobsBasePath || '/jobs'
  const errorLabel = options.errorLabel || '任务'

  const startTime = Date.now()

  while (true) {
    const resp = await request.get(`${jobsBasePath}/${jobId}`)
    const job = unwrapData(resp)

    if (!job) throw new Error(`${errorLabel}不存在`)

    onProgress({
      status: job.status,
      progress: job.progress || 0,
      message: job.message || '',
    })

    if (job.status === 'succeeded') {
      return job.result || {}
    }
    if (job.status === 'failed') {
      throw new Error(job.error?.message || `${errorLabel}失败: ${jobId}`)
    }

    if (Date.now() - startTime > timeout) {
      throw new Error(`${errorLabel}超时 (${timeout / 1000}s): ${jobId}`)
    }

    await new Promise((resolve) => setTimeout(resolve, interval))
  }
}
