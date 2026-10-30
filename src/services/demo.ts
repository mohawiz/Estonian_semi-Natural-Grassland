// The demo farm. Every record is flagged isDemo and shown with a "Demo data" label.
// Parcels sit in the Matsalu / Lihula / Muhu area so the REAL weather API returns
// real data for them; the farm, people and photos are invented. Photos are drawn
// illustrations, labelled as such, never presented as real photographs.
import type { ChecklistState, Farm, LogEntry, Parcel, PhotoMeta } from '../lib/types';
import type { Snapshot } from './db';

export const DEMO_FARM_ID = 'demo-farm';
export const DEMO_SCENARIO = {
  parcelId: 'demo-parcel-b',
  start: '2026-07-01',
  end: '2026-07-31',
  plannedAction: 'mowing' as const,
  reason: 'too-wet' as const,
};

export function demoRecords(now = new Date().toISOString()): Omit<Snapshot, 'photos'> & { photoSpecs: { id: string; entryId: string; parcelId: string; takenAt: string; caption: string; variant: 'flooded' | 'rutted' }[] } {
  const farm: Farm = { id: DEMO_FARM_ID, name: 'Kadakaniidu talu (näidis)', owner: 'Mari Maasikas (demo)', isDemo: true, createdAt: now };
  const parcels: Parcel[] = [
    { id: 'demo-parcel-a', farmId: farm.id, name: 'Rannaniit A', communityType: 'coastal-meadow', areaHa: 12.4, lat: 58.7, lon: 23.8, plannedMethod: 'grazing', isDemo: true, notes: 'Demo parcel near Matsalu Bay.' },
    { id: 'demo-parcel-b', farmId: farm.id, name: 'Luhaniit B', communityType: 'floodplain-meadow', areaHa: 6.8, lat: 58.7346, lon: 23.853, plannedMethod: 'mowing', isDemo: true, notes: 'Demo floodplain meadow. Lower half floods after heavy rain.' },
    { id: 'demo-parcel-c', farmId: farm.id, name: 'Loopealne C', communityType: 'alvar', areaHa: 4.2, lat: 58.595, lon: 23.24, plannedMethod: 'grazing', isDemo: true, notes: 'Demo alvar on Muhu.' },
  ];
  const e = (x: Omit<LogEntry, 'createdAt' | 'isDemo' | 'photoIds'> & { photoIds?: string[] }): LogEntry => ({ photoIds: [], createdAt: now, isDemo: true, ...x });
  const entries: LogEntry[] = [
    e({ id: 'demo-e1', parcelId: 'demo-parcel-a', kind: 'grazing', date: '2026-05-20', endDate: '2026-09-20', animals: '24 lihaveist / beef cattle', notes: 'Season-long grazing.' }),
    e({ id: 'demo-e2', parcelId: 'demo-parcel-c', kind: 'grazing', date: '2026-05-28', endDate: '2026-08-31', animals: '40 lammast / sheep' }),
    e({
      id: 'demo-e3',
      parcelId: 'demo-parcel-b',
      kind: 'missed',
      date: DEMO_SCENARIO.start,
      endDate: DEMO_SCENARIO.end,
      plannedAction: 'mowing',
      reason: 'too-wet',
      areaHa: 6.8,
      notes: 'Standing water in the lower half; tractor sank on 9 July test run. / Alumises pooles seisis vesi.',
      photoIds: ['demo-photo-1', 'demo-photo-2'],
    }),
    e({ id: 'demo-e4', parcelId: 'demo-parcel-b', kind: 'mowing', date: '2026-08-14', method: 'Trummelniiduk, niide koristati 18.08 / drum mower, hay removed 18 Aug', areaHa: 6.8 }),
  ];
  const checklists: ChecklistState[] = [
    { parcelId: 'demo-parcel-b', updatedAt: now, answers: { registered: 'yes', maintainedThisYear: 'yes', hayRemoved: 'yes', noFertiliser: 'yes', records: 'yes', photos: 'yes', missedLogged: 'yes', shrubControl: 'unsure' } },
  ];
  const photoSpecs = [
    { id: 'demo-photo-1', entryId: 'demo-e3', parcelId: 'demo-parcel-b', takenAt: '2026-07-09T10:42:00', caption: 'Standing water in the lower meadow / Seisev vesi', variant: 'flooded' as const },
    { id: 'demo-photo-2', entryId: 'demo-e3', parcelId: 'demo-parcel-b', takenAt: '2026-07-22T16:05:00', caption: 'Wheel ruts filled with water / Veega täitunud rattarööpad', variant: 'rutted' as const },
  ];
  return { farms: [farm], parcels, entries, checklists, reports: [], photoSpecs };
}

/** An SVG drawing of a waterlogged meadow, clearly stamped as a demo illustration. */
export function demoIllustrationSvg(variant: 'flooded' | 'rutted', dateLabel: string): string {
  const water =
    variant === 'flooded'
      ? `<path d="M0 330 Q200 300 400 325 T800 315 V600 H0Z" fill="#7d9cab"/><path d="M60 380 Q220 360 380 385 M420 420 Q560 400 740 430" stroke="#c9dbe3" stroke-width="5" fill="none" opacity=".7"/><ellipse cx="560" cy="480" rx="150" ry="22" fill="#9db7c3" opacity=".8"/>`
      : `<path d="M250 600 L360 300 M450 600 L400 300" stroke="#5b4a32" stroke-width="40" fill="none"/><path d="M262 590 L362 310 M438 590 L398 310" stroke="#7d9cab" stroke-width="18" fill="none"/>`;
  const tufts = Array.from({ length: 26 }, (_, i) => {
    const x = (i * 97) % 800;
    const y = 300 + ((i * 53) % 280);
    return `<path d="M${x} ${y} l6 -26 l4 26 l7 -20 l3 20" stroke="#4d6b3a" stroke-width="3" fill="none"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <rect width="800" height="600" fill="#cfd8d3"/>
  <rect y="0" width="800" height="300" fill="#b9c6c9"/>
  <path d="M0 250 Q120 215 260 240 T520 230 T800 238 V300 H0Z" fill="#53704a"/>
  <path d="M0 300 H800 V600 H0Z" fill="#7e9a5a"/>
  ${water}
  ${tufts}
  <rect x="0" y="540" width="800" height="60" fill="#1f2a24" opacity=".82"/>
  <text x="24" y="578" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#f6d77a">DEMO ILLUSTRATION · NÄIDISILLUSTRATSIOON</text>
  <text x="776" y="578" text-anchor="end" font-family="Arial, sans-serif" font-size="22" fill="#ffffff">${dateLabel}</text>
</svg>`;
}

async function svgToPngBlob(svg: string): Promise<Blob> {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('svg render failed'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    canvas.getContext('2d')!.drawImage(img, 0, 0);
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/jpeg', 0.86));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function buildDemoSnapshot(): Promise<Snapshot> {
  const { photoSpecs, ...rest } = demoRecords();
  const photos: PhotoMeta[] = await Promise.all(
    photoSpecs.map(async (p) => ({
      id: p.id,
      entryId: p.entryId,
      parcelId: p.parcelId,
      fileName: `${p.id}.jpg`,
      takenAt: p.takenAt,
      takenAtSource: 'demo' as const,
      locationSource: 'none' as const,
      caption: p.caption,
      isDemoIllustration: true,
      blob: await svgToPngBlob(demoIllustrationSvg(p.variant, p.takenAt.slice(0, 10))),
    })),
  );
  return { ...rest, photos };
}
