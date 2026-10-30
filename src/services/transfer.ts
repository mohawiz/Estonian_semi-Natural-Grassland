// JSON export / import so teammates can share demo farms. Photos travel as data URLs.
import type { PhotoMeta } from '../lib/types';
import type { Snapshot } from './db';

export const EXPORT_FORMAT = 'grassland-assistant/v1';

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  exportedAt: string;
  data: Omit<Snapshot, 'photos'> & { photos: (Omit<PhotoMeta, 'blob'> & { dataUrl: string })[] };
}

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

export function dataUrlToBlob(url: string): Blob {
  const [head, body] = url.split(',');
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? 'application/octet-stream';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function toExportFile(s: Snapshot): Promise<ExportFile> {
  const photos = await Promise.all(
    s.photos.map(async ({ blob, ...meta }) => ({ ...meta, dataUrl: await blobToDataUrl(blob) })),
  );
  return { format: EXPORT_FORMAT, exportedAt: new Date().toISOString(), data: { ...s, photos } };
}

export class ImportError extends Error {}

export function fromExportFile(json: unknown): Snapshot {
  const f = json as ExportFile;
  if (!f || f.format !== EXPORT_FORMAT || !f.data) throw new ImportError('not-our-format');
  const d = f.data;
  for (const k of ['farms', 'parcels', 'entries', 'photos', 'checklists', 'reports'] as const) {
    if (!Array.isArray(d[k])) throw new ImportError(`missing-${k}`);
  }
  return {
    farms: d.farms,
    parcels: d.parcels,
    entries: d.entries,
    checklists: d.checklists,
    reports: d.reports,
    photos: d.photos.map(({ dataUrl, ...meta }) => ({ ...meta, blob: dataUrlToBlob(dataUrl) })),
  };
}
