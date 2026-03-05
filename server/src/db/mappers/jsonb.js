/**
 * JSONB mapper helpers.
 * - serializeJsonb: normalize app data into JSON string for json/jsonb columns
 * - deserializeJsonb: tolerate both parsed objects and legacy string payloads
 */

function resolveFallback(fallback) {
    return typeof fallback === 'function' ? fallback() : fallback;
}

function normalizeSerializedFallback(fallback) {
    if (fallback === undefined || fallback === null) {
        return null;
    }

    if (typeof fallback === 'string') {
        const trimmed = fallback.trim();
        if (!trimmed) return null;
        try {
            JSON.parse(trimmed);
            return trimmed;
        } catch {
            return null;
        }
    }

    try {
        return JSON.stringify(fallback);
    } catch {
        return null;
    }
}

export function serializeJsonb(value, fallback = null) {
    const normalizedFallback = normalizeSerializedFallback(resolveFallback(fallback));

    if (value === undefined || value === null) {
        return normalizedFallback;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return normalizedFallback;
        try {
            JSON.parse(trimmed);
            return trimmed;
        } catch {
            return normalizedFallback;
        }
    }

    try {
        return JSON.stringify(value);
    } catch {
        return normalizedFallback;
    }
}

export function deserializeJsonb(value, fallback = null) {
    if (value === undefined || value === null) {
        return resolveFallback(fallback);
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return resolveFallback(fallback);
        try {
            return JSON.parse(trimmed);
        } catch {
            return resolveFallback(fallback);
        }
    }

    return value;
}
