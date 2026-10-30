// Areas are stored in hectares and always shown alongside acres.
// 1 international acre = 4046.8564224 m², 1 ha = 10 000 m².
export const ACRES_PER_HECTARE = 10_000 / 4046.8564224;

export function haToAcres(ha: number): number {
  return ha * ACRES_PER_HECTARE;
}

export function acresToHa(acres: number): number {
  return acres / ACRES_PER_HECTARE;
}

function fmt(n: number, lang: string, digits: number): string {
  return new Intl.NumberFormat(lang === 'et' ? 'et-EE' : 'en-GB', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(n);
}

/** "12,5 ha (30,89 ac)" — the canonical dual-unit label used everywhere. */
export function formatArea(ha: number, lang: string): string {
  if (!Number.isFinite(ha)) return '—';
  return `${fmt(ha, lang, 2)} ha (${fmt(haToAcres(ha), lang, 2)} ac)`;
}

export function formatNumber(n: number, lang: string, digits = 1): string {
  return fmt(n, lang, digits);
}
