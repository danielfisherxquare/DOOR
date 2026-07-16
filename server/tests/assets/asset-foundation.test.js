import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tempRoot = path.join(os.tmpdir(), `arcspro-assets-${process.pid}`)
process.env.ASSET_LIBRARY_STORAGE_PATH = tempRoot
process.env.ASSET_OBJECT_STORAGE_PROVIDER = 'filesystem'

const storage = await import('../../src/modules/assets/asset.storage.js')

after(async () => {
  await storage.cleanupUpload('upload-1')
})

describe('asset library foundation', () => {
  it('assembles deterministic upload parts and computes the final SHA-256', async () => {
    const first = await storage.saveUploadPart({ uploadId: 'upload-1', partNumber: 1, buffer: Buffer.from('Arc') })
    const second = await storage.saveUploadPart({ uploadId: 'upload-1', partNumber: 2, buffer: Buffer.from('Spro') })
    const result = await storage.assembleUpload({
      uploadId: 'upload-1',
      parts: [
        { partNumber: 1, tempPath: first.tempPath },
        { partNumber: 2, tempPath: second.tempPath },
      ],
    })
    assert.equal((await readFile(result.filePath)).toString(), 'ArcSpro')
    assert.equal(result.size, 7)
    assert.equal(result.sha256, '5979f332dc26d5c973a200c6e878372260f5b095c89fe49e1b3ec605426664cb')
  })

  it('keeps object keys inside an organization namespace', () => {
    assert.equal(
      storage.buildObjectKey({ orgId: 'org-1', sha256: 'a'.repeat(64) }),
      `orgs/org-1/aa/${'a'.repeat(64)}/original`,
    )
    assert.throws(() => storage.buildObjectKey({ orgId: '../outside', sha256: 'a'.repeat(64) }))
  })
})
