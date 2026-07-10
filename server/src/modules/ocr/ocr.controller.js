import { sendSuccess } from '../../lib/http/response.js'
import {
  processInvoice as defaultRecognizeInvoice,
  processPayment as defaultRecognizePayment,
} from '../reimbursement/ocr.service.js'
import { parseOcrConfig, requireOcrFile } from './ocr.schema.js'

export function createOcrController({
  recognizeInvoice = defaultRecognizeInvoice,
  recognizePayment = defaultRecognizePayment,
} = {}) {
  const recognize = (service) => async (req, res, next) => {
    try {
      const file = requireOcrFile(req.file)
      const config = parseOcrConfig(req.body)
      const result = await service({ ...file, config })
      sendSuccess(res, result.data, { meta: result.meta })
    } catch (error) {
      next(error)
    }
  }

  return {
    processInvoice: recognize(recognizeInvoice),
    processPayment: recognize(recognizePayment),
  }
}

const ocrController = createOcrController()

export const { processInvoice, processPayment } = ocrController
