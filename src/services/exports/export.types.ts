import {
  ExportFormat,
  ExportMode,
} from '../../database/entities/export-job.entity';

export type GeneratedExportFile = {
  buffer: Buffer;
  fileName: string;
  contentType: string;
};

export type CreateExportPayload = {
  format: ExportFormat;
  mode: ExportMode;
  recordIds?: string[];
  filters?: Record<string, unknown> | object;
};
