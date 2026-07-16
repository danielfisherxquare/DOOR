export function assetError(status, publicCode, message, details) {
    const error = new Error(message);
    error.status = status;
    error.statusCode = status;
    error.publicCode = publicCode;
    error.expose = true;
    if (details !== undefined) error.details = details;
    return error;
}

export function assetNotFound(message = '素材不存在') {
    return assetError(404, 'ASSET_NOT_FOUND', message);
}

export function assetValidation(message, details) {
    return assetError(422, 'ASSET_VALIDATION_FAILED', message, details);
}
