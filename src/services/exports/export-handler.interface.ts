import {
  ExportEntityType,
  ExportFormat,
  ExportMode,
} from '../../database/entities/export-job.entity';
import { GeneratedExportFile } from './export.types';

export interface ExportHandler {
  readonly entityType: ExportEntityType;
  readonly auditRecord: string;
  readonly storageFolder: string;
  readonly emptyMessage: string;

  resolveRecordIds(
    recordIds: string[] | null,
    filters: Record<string, unknown> | object | null,
  ): Promise<string[]>;

  loadRecords(ids: string[], mode: ExportMode): Promise<unknown[]>;

  generateFile(
    records: unknown[],
    format: ExportFormat,
    mode: ExportMode,
  ): Promise<GeneratedExportFile>;
}
