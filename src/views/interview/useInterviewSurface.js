import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'

export function buildInterviewPath(basePath, suffix = '') {
  return `${basePath}${suffix}`
}

export function useInterviewSurface() {
  const location = useLocation()

  return useMemo(() => {
    const isAppSurface = location.pathname.startsWith('/app/')
    const basePath = isAppSurface ? '/app/interview' : '/admin/interview'

    return {
      isAppSurface,
      basePath,
      buildPath: (suffix = '') => buildInterviewPath(basePath, suffix),
    }
  }, [location.pathname])
}
