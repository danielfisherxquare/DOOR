import request from '../utils/request.js';

export const processInvoiceRequest = async (file, config) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('provider', config.provider);
    formData.append('baseUrl', config.baseUrl);
    formData.append('apiKey', config.apiKey);
    formData.append('modelName', config.modelName);

    const response = await request.post('/ocr/invoice', formData, {
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    });
    return response;
};

export const processPaymentRequest = async (file, config) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('provider', config.provider);
    formData.append('baseUrl', config.baseUrl);
    formData.append('apiKey', config.apiKey);
    formData.append('modelName', config.modelName);

    const response = await request.post('/ocr/payment', formData, {
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    });
    return response;
};
