import { useCallback, useEffect, useRef, useState } from 'react'

const SIDEBAR_COLLAPSE_EXIT_MS = 150
const SIDEBAR_EXPAND_ENTER_MS = 320

export default function useSidebarMotion(initialCollapsed = false) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialCollapsed)
  const [sidebarMotionPhase, setSidebarMotionPhase] = useState('idle')
  const timeoutsRef = useRef([])
  const collapsedRef = useRef(initialCollapsed)
  const phaseRef = useRef('idle')

  const clearTimers = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout)
    timeoutsRef.current = []
  }, [])

  useEffect(() => {
    collapsedRef.current = sidebarCollapsed
  }, [sidebarCollapsed])

  useEffect(() => {
    phaseRef.current = sidebarMotionPhase
  }, [sidebarMotionPhase])

  useEffect(() => clearTimers, [clearTimers])

  const toggleSidebar = useCallback(() => {
    clearTimers()

    const shouldExpand = collapsedRef.current || phaseRef.current === 'collapsing'

    if (shouldExpand) {
      setSidebarCollapsed(false)
      setSidebarMotionPhase('expanding')

      timeoutsRef.current.push(
        setTimeout(() => {
          setSidebarMotionPhase('idle')
        }, SIDEBAR_EXPAND_ENTER_MS),
      )
      return
    }

    setSidebarMotionPhase('collapsing')
    timeoutsRef.current.push(
      setTimeout(() => {
        setSidebarCollapsed(true)
        setSidebarMotionPhase('idle')
      }, SIDEBAR_COLLAPSE_EXIT_MS),
    )
  }, [clearTimers])

  const sidebarMotionClass = sidebarMotionPhase === 'idle'
    ? ''
    : `workspace-layout--sidebar-${sidebarMotionPhase}`

  return {
    sidebarCollapsed,
    sidebarMotionClass,
    toggleSidebar,
  }
}
