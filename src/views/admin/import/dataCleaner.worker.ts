import { applyMappings } from '../../../utils/excelProcessor';
import { applyCleaningRules, type CleaningRules } from '../../../utils/dataCleaners';
import type { SurnamePinyinOverrides } from '../../../utils/namePinyin';
import type { MergedRow, StandardField, UploadedFile } from '../../../utils/importTypes';

type WorkerInput = {
  uploadedFiles: Array<
    Pick<
      UploadedFile,
      'fullData' | 'mappings' | 'name' | 'extractedSource' | 'extractedEvent' | 'eventPriority'
    >
  >;
  standardFields: StandardField[];
  rules: CleaningRules;
  surnameOverrides: SurnamePinyinOverrides;
};

type WorkerSummaryOutput = {
  type: 'summary';
  rawCount: number;
  rawPreview: MergedRow[];
  stats: Record<string, number>;
  totalRows: number;
};

type WorkerChunkOutput = {
  type: 'chunk';
  rows: MergedRow[];
};

type WorkerDoneOutput = {
  type: 'done';
  totalRows: number;
};

type WorkerOutput = WorkerSummaryOutput | WorkerChunkOutput | WorkerDoneOutput;

const CHUNK_SIZE = 2000;

self.onmessage = (ev: MessageEvent<WorkerInput>) => {
  const { uploadedFiles, standardFields, rules } = ev.data;
  const { surnameOverrides } = ev.data;

  const rawPreview: MergedRow[] = [];
  const stats: Record<string, number> = {
    pinyin: 0,
    country: 0,
    idCard: 0,
    clothingSize: 0,
    address: 0,
    idCardAddress: 0,
  };

  let rawCount = 0;
  let totalRows = 0;
  const referenceDate = new Date();

  for (const file of uploadedFiles) {
    const mappedRows = applyMappings(
      file.fullData,
      file.mappings,
      file.name,
      standardFields,
      file.extractedSource,
      file.extractedEvent,
      file.eventPriority
    );

    rawCount += mappedRows.length;
    if (rawPreview.length < 50) {
      rawPreview.push(...mappedRows.slice(0, 50 - rawPreview.length));
    }

    for (let i = 0; i < mappedRows.length; i += CHUNK_SIZE) {
      const chunk = mappedRows.slice(i, i + CHUNK_SIZE);
      const { cleanedData, stats: chunkStats } = applyCleaningRules(
        chunk,
        rules,
        standardFields,
        referenceDate,
        { surnameOverrides }
      );
      totalRows += cleanedData.length;

      stats.pinyin += chunkStats.pinyin;
      stats.country += chunkStats.country;
      stats.idCard += chunkStats.idCard;
      stats.clothingSize += chunkStats.clothingSize;
      stats.address += chunkStats.address;
      stats.idCardAddress += chunkStats.idCardAddress;

      const chunkOut: WorkerChunkOutput = {
        type: 'chunk',
        rows: cleanedData,
      };
      self.postMessage(chunkOut);
    }
  }

  const summaryOut: WorkerSummaryOutput = {
    type: 'summary',
    rawCount,
    rawPreview,
    stats,
    totalRows,
  };

  const doneOut: WorkerDoneOutput = {
    type: 'done',
    totalRows,
  };

  self.postMessage(summaryOut as WorkerOutput);
  self.postMessage(doneOut as WorkerOutput);
};
