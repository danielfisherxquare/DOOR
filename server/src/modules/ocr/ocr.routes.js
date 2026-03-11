import express from 'express';
import multer from 'multer';
import { processInvoice, processPayment } from './ocr.controller.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

// Both routes expect a file via multipart form-data and JSON fields for LLM config.
router.post('/invoice', upload.single('file'), processInvoice);
router.post('/payment', upload.single('file'), processPayment);

export default router;
