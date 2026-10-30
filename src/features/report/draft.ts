// Draft justification text built only from the farmer's records and the weather
// numbers. The farmer is asked to rewrite it in their own words.
import { translate } from '../../i18n';
import { formatDate } from '../../lib/dates';
import type { Lang, LogEntry, Parcel, ReportInput } from '../../lib/types';
import { formatArea, formatNumber } from '../../lib/units';
import type { WeatherSummary } from '../../services/weather';

export function draftJustification(lang: Lang, input: ReportInput, parcel: Parcel, summary: WeatherSummary | null, photoCount: number, laterWork?: LogEntry): string {
  const tr = (k: string, v?: Record<string, string | number>) => translate(lang, k, v);
  const action = tr(`method.${input.plannedAction}`).toLowerCase();
  let text = tr('report.draft.intro', {
    parcel: parcel.name,
    area: formatArea(input.affectedHa || parcel.areaHa, lang),
    action,
    start: formatDate(input.start, lang),
    end: formatDate(input.end, lang),
  });
  text += ' ';
  if (input.reason === 'too-wet' && summary) {
    text += tr('report.draft.reasonWet') + tr('report.draft.weatherWet', { total: formatNumber(summary.totalPrecipMm, lang), days: summary.daysWithData, wet: summary.wetDays, heavy: summary.heavyRainDays });
  } else if (input.reason === 'drought' && summary) {
    text += tr('report.draft.reasonDry') + tr('report.draft.weatherDry', { total: formatNumber(summary.totalPrecipMm, lang), days: summary.daysWithData, dry: summary.longestDrySpell });
  } else {
    text += tr('report.draft.reasonOther', { reason: tr(`reason.${input.reason}`).toLowerCase() });
  }
  if (summary?.baselineRatio != null && (input.reason === 'too-wet' || input.reason === 'drought')) {
    text += tr('report.draft.baseline', { pct: Math.round(summary.baselineRatio * 100) });
  }
  if (photoCount) text += tr('report.draft.photos', { n: photoCount });
  text += laterWork ? tr('report.draft.completedAfter', { date: formatDate(laterWork.date, lang) }) : tr('report.draft.plan');
  return text;
}
