import { extractFromInvoice, extractFromPayment } from './ocr.service.js';

function validateLLMConfig(provider, baseUrl, apiKey) {
    if (!provider || !baseUrl || !apiKey) {
        throw new Error('Missing LLM configuration. Please provide provider, baseUrl, and apiKey.');
    }
}

export async function processInvoice(req, res, next) {
    try {
        const { provider, baseUrl, apiKey } = req.body;
        validateLLMConfig(provider, baseUrl, apiKey);

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const result = await extractFromInvoice({
            fileBuffer: req.file.buffer,
            mimeType: req.file.mimetype,
            filename: req.file.originalname,
            provider,
            baseUrl,
            apiKey
        });

        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
}

export async function processPayment(req, res, next) {
    try {
        const { provider, baseUrl, apiKey } = req.body;
        validateLLMConfig(provider, baseUrl, apiKey);

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const result = await extractFromPayment({
            fileBuffer: req.file.buffer,
            mimeType: req.file.mimetype,
            filename: req.file.originalname,
            provider,
            baseUrl,
            apiKey
        });

        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
}
