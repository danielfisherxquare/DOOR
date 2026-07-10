import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createOcrController } from '../src/modules/ocr/ocr.controller.js'
import { parseOcrConfig } from '../src/modules/ocr/ocr.schema.js'

describe('admin OCR compatibility module', () => {
  it('whitelists and trims upstream configuration', () => {
    assert.deepEqual(
      parseOcrConfig({
        provider: ' custom ',
        baseUrl: ' https://vision.example/v1 ',
        apiKey: ' secret ',
        modelName: ' vision-model ',
        orgId: 'forged',
      }),
      {
        provider: 'custom',
        baseUrl: 'https://vision.example/v1',
        apiKey: 'secret',
        modelName: 'vision-model',
      },
    )
  })

  it('delegates invoice recognition to the shared reimbursement OCR service', async () => {
    let received
    const controller = createOcrController({
      recognizeInvoice: async (input) => {
        received = input
        return { success: true, data: { amount: 10 }, meta: { modelCallCount: 1 } }
      },
      recognizePayment: async () => assert.fail('unexpected payment call'),
    })
    const request = {
      body: {
        provider: 'custom',
        baseUrl: 'https://vision.example/v1',
        apiKey: 'secret',
        modelName: 'vision-model',
      },
      file: {
        buffer: Buffer.from('invoice'),
        mimetype: 'image/png',
        originalname: 'invoice.png',
      },
    }
    let responseBody
    const response = {
      status(code) {
        assert.equal(code, 200)
        return response
      },
      json(body) {
        responseBody = body
        return body
      },
    }

    await controller.processInvoice(request, response, assert.fail)

    assert.equal(received.fileBuffer, request.file.buffer)
    assert.equal(received.config.apiKey, 'secret')
    assert.deepEqual(responseBody, {
      success: true,
      data: { amount: 10 },
      meta: { modelCallCount: 1 },
    })
  })

  it('returns a 400-style error before calling the model when no file is uploaded', async () => {
    const controller = createOcrController({
      recognizeInvoice: async () => assert.fail('model must not be called'),
      recognizePayment: async () => assert.fail('model must not be called'),
    })
    let captured

    await controller.processInvoice({ body: {} }, {}, (error) => {
      captured = error
    })

    assert.equal(captured.status, 400)
    assert.equal(captured.code, 'OCR_INPUT_INVALID')
  })
})
