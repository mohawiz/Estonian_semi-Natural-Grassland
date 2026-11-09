// Turn found meadows (PRIA register, cadastre, files) into the farmer's plots.
import { uid } from '../../app/store';
import type { Farm, Parcel } from '../../lib/types';
import { candidateToParcelFields, type MeadowCandidate } from '../../services/landData';

type T = (key: string, vars?: Record<string, string | number>) => string;

/** The farmer's own farm. The demo farm never receives real meadows. */
export function ownFarm(farms: Farm[]): Farm | undefined {
  return farms.find((f) => !f.isDemo);
}

export function defaultPlotName(c: MeadowCandidate, t: T): string {
  if (c.source === 'pria' && c.pria) return c.pria.areaNo ? t('find.defaultName', { no: c.pria.meadowNo, area: c.pria.areaNo }) : t('find.defaultNameSized', { no: c.pria.meadowNo, ha: c.areaHa });
  return c.address?.split(',')[0] || c.label;
}

export function parcelFromCandidate(c: MeadowCandidate, farmId: string, t: T, fetchedAt = new Date().toISOString()): Parcel {
  const f = candidateToParcelFields(c, fetchedAt);
  return {
    id: uid('parcel-'),
    farmId,
    name: defaultPlotName(c, t),
    code: f.code,
    communityType: f.communityType ?? 'other',
    areaHa: f.areaHa,
    lat: f.lat,
    lon: f.lon,
    plannedMethod: f.plannedMethod ?? 'mowing',
    boundary: f.boundary,
    source: f.source,
    pria: f.pria,
    cadastralId: f.cadastralId,
  };
}

/** Save each candidate as a plot of the farm; returns the new plots in order. */
export async function addCandidatesAsPlots(cands: MeadowCandidate[], farmId: string, saveParcel: (p: Parcel) => Promise<void>, t: T): Promise<Parcel[]> {
  const fetchedAt = new Date().toISOString();
  const out: Parcel[] = [];
  for (const c of cands) {
    const p = parcelFromCandidate(c, farmId, t, fetchedAt);
    await saveParcel(p);
    out.push(p);
  }
  return out;
}
