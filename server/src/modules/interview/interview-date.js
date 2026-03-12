const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function normalizeInterviewDateInput(value) {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        const matched = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
        if (matched && DATE_ONLY_PATTERN.test(matched[1])) {
            return matched[1];
        }
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }

    return null;
}

export function serializeInterviewDate(value) {
    if (!value) {
        return null;
    }

    if (typeof value === 'string') {
        const matched = value.match(/^(\d{4}-\d{2}-\d{2})/);
        return matched ? matched[1] : value;
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }

    return value;
}

export function serializeInterviewRecord(record) {
    if (!record) {
        return record;
    }

    return {
        ...record,
        interview_date: serializeInterviewDate(record.interview_date)
    };
}
