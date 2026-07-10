import { Router } from 'express'
import { checkReadiness as defaultCheckReadiness } from './health.service.js'

export function createHealthRouter({ checkReadiness = defaultCheckReadiness } = {}) {
  const router = Router()

  router.get('/live', (_req, res) => {
    res.json({ status: 'ok' })
  })

  router.get('/ready', async (_req, res) => {
    try {
      const readiness = await checkReadiness()
      res.status(readiness.healthy ? 200 : 503).json(readiness.body)
    } catch (error) {
      console.error('健康检查失败:', error.message)
      res.status(503).json({ status: 'error', database: 'disconnected' })
    }
  })

  return router
}

export default createHealthRouter()
