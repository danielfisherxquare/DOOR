import { load } from '@tauri-apps/plugin-store'

export interface PersistedQueueItem {
  id: string
  path: string
  state: 'queued' | 'uploading' | 'completed' | 'failed'
  progress: number
  fingerprint?: string
  error?: string
}

export interface LocalSyncIndex {
  serverUrl: string
  syncFolder: string
  cursor: string
  fingerprints: Record<string, string>
  assetLinks: Record<string, { assetId: string; revision: number }>
  queue: PersistedQueueItem[]
}

const defaults: LocalSyncIndex = {
  serverUrl: 'https://www.arcspro.work:18443',
  syncFolder: '',
  cursor: '0',
  fingerprints: {},
  assetLinks: {},
  queue: [],
}

const storeDefaults: Record<string, unknown> = { ...defaults }
const storePromise = load('asset-sync-v1.json', { defaults: storeDefaults, autoSave: 250 })

export async function loadLocalIndex(): Promise<LocalSyncIndex> {
  const store = await storePromise
  return {
    serverUrl: await store.get<string>('serverUrl') || defaults.serverUrl,
    syncFolder: await store.get<string>('syncFolder') || '',
    cursor: await store.get<string>('cursor') || '0',
    fingerprints: await store.get<Record<string, string>>('fingerprints') || {},
    assetLinks: await store.get<Record<string, { assetId: string; revision: number }>>('assetLinks') || {},
    queue: (await store.get<PersistedQueueItem[]>('queue') || []).map((item) => ({ ...item, state: item.state === 'failed' ? 'failed' : 'queued', progress: 0 })),
  }
}

export async function saveLocalIndex(index: LocalSyncIndex): Promise<void> {
  const store = await storePromise
  await store.set('serverUrl', index.serverUrl)
  await store.set('syncFolder', index.syncFolder)
  await store.set('cursor', index.cursor)
  await store.set('fingerprints', index.fingerprints)
  await store.set('assetLinks', index.assetLinks)
  await store.set('queue', index.queue.filter((item) => item.state !== 'completed'))
}
