import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { replaceAttachmentFile } from '../src/modules/reimbursement/reimbursement-attachment.storage.js'

function createFileSystem(log) {
  return {
    async writeFile(filePath) {
      log.push(['write', filePath])
    },
    async unlink(filePath) {
      log.push(['unlink', filePath])
    },
  }
}

describe('reimbursement attachment replacement storage', () => {
  it('uses a basename and deletes the old file only after metadata is durable', async () => {
    const log = []
    const result = await replaceAttachmentFile({
      attachment: { id: 'attachment-1', original_path: '/safe/original.jpg' },
      file: {
        originalname: '../../invoice.png',
        buffer: Buffer.from('next'),
        size: 4,
        mimetype: 'image/png',
      },
      now: () => 123,
      fileSystem: createFileSystem(log),
      updateRecord: async (payload) => {
        log.push(['update', payload.originalPath, payload.originalName])
        return 1
      },
    })

    assert.equal(result.originalPath, '/safe/123_invoice.png')
    assert.deepEqual(log, [
      ['write', '/safe/123_invoice.png'],
      ['update', '/safe/123_invoice.png', 'invoice.png'],
      ['unlink', '/safe/original.jpg'],
    ])
  })

  it('removes the new file and preserves the old file when metadata fails', async () => {
    const log = []

    await assert.rejects(
      () =>
        replaceAttachmentFile({
          attachment: { id: 'attachment-1', original_path: '/safe/original.jpg' },
          file: { originalname: 'next.jpg', buffer: Buffer.from('next') },
          now: () => 123,
          fileSystem: createFileSystem(log),
          updateRecord: async () => {
            throw new Error('database failed')
          },
        }),
      /database failed/,
    )

    assert.deepEqual(log, [
      ['write', '/safe/123_next.jpg'],
      ['unlink', '/safe/123_next.jpg'],
    ])
  })
})
