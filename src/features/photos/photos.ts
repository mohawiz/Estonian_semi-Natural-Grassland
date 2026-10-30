// Photo intake: read EXIF date/GPS before downscaling (re-encoding strips EXIF),
// then store a compact JPEG in IndexedDB.
import type { PhotoMeta } from '../../lib/types';

function localIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export async function readPhoto(file: File, id: string): Promise<PhotoMeta> {
  let takenAt: string | undefined;
  let takenAtSource: PhotoMeta['takenAtSource'] = 'file';
  let lat: number | undefined;
  let lon: number | undefined;
  try {
    const exifr = (await import('exifr')).default;
    const exif = await exifr.parse(file, { gps: true, pick: ['DateTimeOriginal', 'CreateDate', 'latitude', 'longitude', 'GPSLatitude', 'GPSLongitude'] });
    const when: unknown = exif?.DateTimeOriginal ?? exif?.CreateDate;
    if (when instanceof Date && !isNaN(when.getTime())) {
      takenAt = localIso(when);
      takenAtSource = 'exif';
    }
    if (typeof exif?.latitude === 'number' && typeof exif?.longitude === 'number') {
      lat = exif.latitude;
      lon = exif.longitude;
    }
  } catch {
    /* no EXIF: fall back to the file timestamp */
  }
  if (!takenAt) takenAt = localIso(new Date(file.lastModified || Date.now()));
  const blob = await downscale(file, 1600);
  return { id, fileName: file.name, takenAt, takenAtSource, lat, lon, locationSource: lat !== undefined ? 'exif' : 'none', blob };
}

export async function downscale(file: Blob, max: number): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', 0.85));
}

/** Object URLs for blobs, revoked by the caller's cleanup. */
export function useObjectUrl() {
  return (b: Blob) => URL.createObjectURL(b);
}
