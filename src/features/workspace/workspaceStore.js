import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createWorkspaceSession, getWorkspacePathKey, parseWorkspaceSession } from './workspaceSession'
import { configureRequestContextAdapter } from '../../auth/request-context-adapter'

const STORAGE_KEY = 'workspace-session'

function readInitialSession() {
  if (typeof window === 'undefined') return null
  return parseWorkspaceSession(window.localStorage.getItem(STORAGE_KEY))
}

const useWorkspaceStore = create(
  persist(
    (set, get) => ({
      session: readInitialSession(),

      setWorkspaceSession: (session) => {
        set({ session: createWorkspaceSession(session) })
      },

      clearWorkspaceSession: () => {
        set({ session: null })
      },

      rememberSurfacePath: (surface, path) => {
        const current = get().session
        if (!current || !path) return
        set({
          session: {
            ...current,
            [getWorkspacePathKey(surface)]: path,
          },
        })
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({ session: state.session }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        session: parseWorkspaceSession(JSON.stringify(persistedState?.session || null)),
      }),
    },
  ),
)

configureRequestContextAdapter({
  getWorkspaceContext: () => useWorkspaceStore.getState().session,
})

export default useWorkspaceStore
