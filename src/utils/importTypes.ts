export interface StandardField {
    id: string;
    name: string;
    required: boolean;
}

export interface ColumnMapping {
    sourceColumn: string;
    targetFieldId: string | null;
}

export interface UploadedFile {
    id: string;
    name: string;
    originalFileName: string;
    sheetName: string;
    extractedSource: string;
    extractedEvent: string;
    eventPriority: 'extracted' | 'mapped';
    headers: string[];
    previewData: Record<string, string>[];
    fullData: Record<string, string>[];
    totalRows: number;
    mappings: ColumnMapping[];
}

export interface MergedRow {
    _source: string;
    [fieldId: string]: string;
}

export interface ImportSessionSummary {
    rawCount: number;
    rawPreview: MergedRow[];
    stats: Record<string, number>;
}

export interface ImportSession {
    id: string;
    orgId: string;
    status: string;
    rawCount: number;
    totalRows: number;
    rawPreview: MergedRow[];
    stats: Record<string, number>;
    createdAt: string;
    updatedAt: string;
}

export interface JobStatusResponse {
    id: string;
    type: string;
    status: 'queued' | 'running' | 'succeeded' | 'failed';
    progress: number;
    message: string;
    result?: {
        addedCount?: number;
        updatedCount?: number;
        internalCount?: number;
        rejectedCount?: number;
        [key: string]: unknown;
    };
    error?: { message?: string } | null;
}
