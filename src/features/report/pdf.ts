// PDF export with jsPDF. Fonts are embedded TTFs (IBM Plex Sans, Source Serif 4)
// so Estonian letters (õ ä ö ü š ž) render correctly. The weather chart is drawn
// natively from the data, so it stays sharp and needs no screenshotting.
import plexRegular from '@expo-google-fonts/ibm-plex-sans/400Regular/IBMPlexSans_400Regular.ttf?url';
import plexBold from '@expo-google-fonts/ibm-plex-sans/600SemiBold/IBMPlexSans_600SemiBold.ttf?url';
import serifBold from '@expo-google-fonts/source-serif-4/600SemiBold/SourceSerif4_600SemiBold.ttf?url';
import type { jsPDF as JsPDF } from 'jspdf';
import { translate } from '../../i18n';
import { formatDate } from '../../lib/dates';
import type { Lang } from '../../lib/types';
import { formatArea, formatNumber } from '../../lib/units';
import { getDocument } from '../../services/library';
import type { ProofReport } from '../../services/report';
import { HEAVY_DAY_MM, summarizeWeather } from '../../services/weather';

const C = {
  ink: [29, 38, 32] as const,
  ink2: [72, 83, 75] as const,
  ink3: [106, 115, 107] as const,
  rule: [216, 209, 191] as const,
  meadow: [47, 93, 52] as const,
  hay: [183, 134, 27] as const,
  hayBand: [248, 236, 205] as const,
  rain: [45, 95, 139] as const,
  heat: [180, 83, 42] as const,
  soil: [107, 79, 42] as const,
};

async function toBase64(url: string): Promise<string> {
  const buf = await (await fetch(url)).arrayBuffer();
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}

export async function buildPdf(report: ProofReport, lang: Lang): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc: JsPDF = new jsPDF({ unit: 'mm', format: 'a4' });
  const [reg, bold, serif] = await Promise.all([toBase64(plexRegular), toBase64(plexBold), toBase64(serifBold)]);
  doc.addFileToVFS('Plex-Regular.ttf', reg);
  doc.addFont('Plex-Regular.ttf', 'Plex', 'normal');
  doc.addFileToVFS('Plex-Bold.ttf', bold);
  doc.addFont('Plex-Bold.ttf', 'Plex', 'bold');
  doc.addFileToVFS('Serif-Bold.ttf', serif);
  doc.addFont('Serif-Bold.ttf', 'Serif', 'bold');

  const tr = (k: string, v?: Record<string, string | number>) => translate(lang, k, v);
  const f = (d: string) => formatDate(d, lang);
  const W = 210;
  const M = 18;
  const CW = W - 2 * M;
  const BOTTOM = 297 - 20;
  let y = M;

  const color = (c: readonly number[]) => doc.setTextColor(c[0], c[1], c[2]);
  const ensure = (h: number) => {
    if (y + h > BOTTOM) {
      doc.addPage();
      y = M;
    }
  };
  const text = (s: string, opts: { size?: number; bold?: boolean; serif?: boolean; c?: readonly number[]; gap?: number; indent?: number } = {}) => {
    const size = opts.size ?? 10;
    doc.setFont(opts.serif ? 'Serif' : 'Plex', opts.bold || opts.serif ? 'bold' : 'normal');
    doc.setFontSize(size);
    color(opts.c ?? C.ink);
    const lines = doc.splitTextToSize(s, CW - (opts.indent ?? 0)) as string[];
    const lh = size * 0.42;
    for (const line of lines) {
      ensure(lh);
      doc.text(line, M + (opts.indent ?? 0), y + lh * 0.8);
      y += lh;
    }
    y += opts.gap ?? 1.5;
  };
  // Keep a heading together with at least `keep` mm of what follows it.
  const heading = (s: string, keep = 18) => {
    ensure(12 + keep);
    y += 3;
    text(s, { size: 12, serif: true, gap: 0.5 });
    doc.setDrawColor(...C.rule);
    doc.line(M, y, W - M, y);
    y += 3;
  };
  const kv = (k: string, v: string) => {
    doc.setFont('Plex', 'bold');
    doc.setFontSize(9.5);
    color(C.ink3);
    ensure(5);
    doc.text(k, M, y + 3.4);
    const start = y;
    y = start;
    const lines = doc.splitTextToSize(v, CW - 42) as string[];
    doc.setFont('Plex', 'normal');
    color(C.ink);
    lines.forEach((l, i) => {
      ensure(4.2);
      doc.text(l, M + 42, y + 3.4 + 0);
      y += 4.2;
      if (i === lines.length - 1) y += 0.8;
    });
  };

  // Header
  if (report.isDemo) {
    doc.setFillColor(...C.hayBand);
    doc.setDrawColor(...C.hay);
    doc.roundedRect(W - M - 62, y, 62, 7, 1, 1, 'FD');
    doc.setFont('Plex', 'bold');
    doc.setFontSize(8);
    color([138, 95, 10]);
    doc.text(tr('report.demoWatermark'), W - M - 31, y + 4.7, { align: 'center' });
    y += 10;
  }
  text(tr('app.name').toUpperCase(), { size: 8, bold: true, c: C.ink3, gap: 0.5 });
  text(tr('report.docTitle'), { size: 17, serif: true, gap: 2 });
  doc.setDrawColor(...C.meadow);
  doc.setLineWidth(0.6);
  doc.line(M, y, W - M, y);
  doc.setLineWidth(0.2);
  y += 4;
  kv(tr('report.to'), tr('report.toBoard'));
  kv(tr('report.from'), `${report.input.farmerName || report.farm.owner || '—'}, ${report.farm.name}${report.farm.registryCode ? ` (${report.farm.registryCode})` : ''}`);
  kv(tr('report.date'), f(report.generatedAt.slice(0, 10)));

  heading(tr('report.sectionParcel'));
  text(`${report.parcel.name}${report.parcel.code ? ` (${report.parcel.code})` : ''} — ${tr(`community.${report.parcel.communityType}`)}, ${formatArea(report.parcel.areaHa, lang)}. ${tr('parcels.coords')}: ${formatNumber(report.parcel.lat, lang, 4)}, ${formatNumber(report.parcel.lon, lang, 4)}.`);

  heading(tr('report.sectionPlanned'));
  report.planned.forEach((p) => kv(tr('report.plannedLabel'), `${tr(`method.${p.action}`)}, ${f(p.start)} – ${f(p.end)}`));
  kv(
    tr('report.completedLabel'),
    report.completed.length
      ? report.completed.map((e) => `${tr(`method.${e.kind}`)} ${f(e.date)}${e.endDate && e.endDate !== e.date ? ` – ${f(e.endDate)}` : ''}`).join('; ')
      : tr('report.nothingCompleted', { action: tr(`method.${report.input.plannedAction}`).toLowerCase() }),
  );

  heading(tr('report.sectionReason'));
  text(`${tr(`reason.${report.input.reason}`)}.`);
  report.missedEntries.forEach((e) => e.notes && text(`“${e.notes}” (${tr('report.missedEntry')}, ${f(e.date)})`, { size: 9, c: C.ink2 }));

  heading(tr('report.sectionWeather'), report.weather.series ? 70 : 18);
  const series = report.weather.series;
  if (series) {
    drawChart(doc, series.days, report.period, M, y, CW, 58, tr, lang);
    y += 66;
    const s = summarizeWeather(series.days.filter((d) => d.date >= report.period.start && d.date <= report.period.end), report.weather.baseline);
    const facts: [string, string][] = [
      [tr('weather.total'), `${formatNumber(s.totalPrecipMm, lang)} mm`],
      [tr('weather.wetDays'), `${s.wetDays} / ${s.daysWithData}`],
      [tr('weather.heavyDays'), String(s.heavyRainDays)],
      [tr('weather.maxDay'), `${formatNumber(s.maxDailyMm, lang)} mm${s.maxDailyDate ? ` (${f(s.maxDailyDate)})` : ''}`],
      [tr('weather.longestWet'), tr('weather.daysUnit', { n: s.longestWetSpell })],
      [tr('weather.longestDry'), tr('weather.daysUnit', { n: s.longestDrySpell })],
      [tr('weather.meanSoil'), s.meanSoilMoisture !== null ? `${formatNumber(s.meanSoilMoisture, lang, 3)} m³/m³` : '—'],
      [tr('weather.vsNormal'), s.baselineRatio !== null ? tr('weather.vsNormalValue', { pct: Math.round(s.baselineRatio * 100) }) : '—'],
    ];
    facts.forEach(([k, v]) => kv(k, v));
    text(`${tr('weather.modelNote', { lat: formatNumber(series.gridLat, lang, 3), lon: formatNumber(series.gridLon, lang, 3) })} ${tr('weather.attribution')}. ${series.source.url}`, { size: 8, c: C.ink3 });
  }
  const verdict = tr(`report.weatherVerdict.${report.weather.verdict}`);
  text(verdict, { bold: true, c: report.weather.verdict === 'supports' ? C.meadow : report.weather.verdict === 'does-not-support' ? [138, 44, 23] : [110, 79, 11], gap: 0.5 });
  text(tr('report.verdictNote'), { size: 8, c: C.ink3 });

  heading(tr('report.sectionPhotos'), report.photos.length ? ((CW - 6) / 2) * 0.75 + 14 : 18);
  if (!report.photos.length) text(tr('report.noPhotos'));
  else {
    const pw = (CW - 6) / 2;
    const ph = pw * 0.75;
    for (let i = 0; i < report.photos.length; i += 2) {
      ensure(ph + 16);
      const rowTop = y;
      let rowH = 0;
      for (let j = 0; j < 2 && i + j < report.photos.length; j++) {
        const p = report.photos[i + j];
        const x = M + j * (pw + 6);
        try {
          const dataUrl = await blobToDataUrl(p.blob);
          doc.addImage(dataUrl, 'JPEG', x, rowTop, pw, ph, undefined, 'FAST');
        } catch {
          doc.setDrawColor(...C.rule);
          doc.rect(x, rowTop, pw, ph);
        }
        doc.setFont('Plex', 'normal');
        doc.setFontSize(8);
        color(C.ink2);
        const cap = [
          `${p.takenAt ? formatDate(p.takenAt, lang, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'} (${tr(`log.photoDateFrom.${p.takenAtSource}`)})${p.lat !== undefined && p.lon !== undefined ? ` · ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}` : ''}`,
          ...(p.caption ? [p.caption] : []),
          ...(p.isDemoIllustration ? [tr('log.demoIllustration')] : []),
        ];
        const lines = cap.flatMap((c) => doc.splitTextToSize(c, pw) as string[]);
        lines.forEach((l, k) => doc.text(l, x, rowTop + ph + 4 + k * 3.4));
        rowH = Math.max(rowH, ph + 5 + lines.length * 3.4);
      }
      y = rowTop + rowH + 3;
    }
  }

  heading(tr('report.sectionAssessment'));
  kv(tr('report.severity'), tr(`report.severityOptions.${report.severity}`));
  kv(tr('report.affected'), tr('report.extentValue', { area: formatArea(report.extent.affectedHa, lang), total: formatArea(report.extent.parcelHa, lang), pct: formatNumber(report.extent.percent, lang) }));
  kv(tr('report.durationHelp').split(':')[0], tr('report.durationValue', { days: report.duration.days, start: f(report.period.start), end: f(report.period.end) }));

  heading(tr('report.sectionJustification'));
  text(report.input.justification || '—');

  heading(tr('report.sectionRules'));
  for (const p of report.rules) {
    const d = getDocument(p.docId)!;
    text(`${d.title[lang]}, ${p.section}`, { bold: true, gap: 0.5 });
    text(`„${p.text}“`, { size: 9.5, c: C.ink, indent: 4, gap: 0.8 });
    text(p.summary[lang], { size: 9, c: C.ink2, indent: 4, gap: 0.5 });
    text(`${tr('report.sources')}: ${d.url} · ${tr('report.version')}: ${d.version} · ${tr('report.retrieved')} ${f(d.retrievedAt)}${d.status !== 'verified-current' ? ` · ${tr(`rules.status.${d.status}`)}` : ''}`, { size: 7.5, c: C.ink3, indent: 4, gap: 3 });
  }

  heading(tr('report.sectionNotice'));
  text(`${tr('report.noticeText', { n: report.notice.workingDays, date: f(report.notice.deadline) })}${report.notice.passed ? ` ${tr('report.noticePassed')}` : ''}`);
  text(`${tr('report.noticeLabel')} ${tr('report.priaNote')}`, { size: 8.5, c: C.ink3 });

  y += 4;
  text(tr('report.disclaimer'), { size: 8, c: C.ink3 });

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...C.rule);
    doc.line(M, 287, W - M, 287);
    doc.setFont('Plex', 'normal');
    doc.setFontSize(7.5);
    color(C.ink3);
    doc.text(tr('report.generatedBy', { date: f(report.generatedAt.slice(0, 10)) }) + (report.isDemo ? ` · ${tr('report.demoWatermark')}` : ''), M, 291);
    doc.text(tr('report.pageOf', { n: i, total: pages }), W - M, 291, { align: 'right' });
  }
  return doc.output('blob');
}

function drawChart(doc: JsPDF, days: { date: string; precipitationMm: number | null; tMaxC: number | null; soilMoisture: number | null }[], band: { start: string; end: string }, x0: number, y0: number, w: number, h: number, tr: (k: string) => string, lang: Lang) {
  const n = days.length;
  if (!n) return;
  const left = x0 + 8;
  const right = x0 + w - 8;
  const top = y0 + 4;
  const bottom = y0 + h - 8;
  const iw = right - left;
  const ih = bottom - top;
  const step = iw / n;
  const rainTop = Math.ceil(Math.max(10, ...days.map((d) => d.precipitationMm ?? 0)) / 5) * 5;
  const temps = days.flatMap((d) => (d.tMaxC === null ? [] : [d.tMaxC]));
  const tMin = Math.floor(Math.min(0, ...temps) / 5) * 5;
  const tMax = Math.ceil(Math.max(20, ...temps) / 5) * 5;
  const xi = (i: number) => left + i * step + step / 2;

  // band
  const s = days.findIndex((d) => d.date >= band.start);
  let e = days.length - 1;
  while (e >= 0 && days[e].date > band.end) e--;
  if (s >= 0 && e >= s) {
    doc.setFillColor(...C.hayBand);
    doc.rect(left + s * step, top, (e - s + 1) * step, ih, 'F');
    doc.setDrawColor(...C.hay);
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(left + s * step, top, left + s * step, bottom);
    doc.line(left + (e + 1) * step, top, left + (e + 1) * step, bottom);
    doc.setLineDashPattern([], 0);
    doc.setFont('Plex', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(138, 95, 10);
    doc.text(tr('weather.missedBand').toUpperCase(), left + s * step + 1.5, top + 3);
  }
  // axes and grid
  doc.setDrawColor(...C.rule);
  doc.setFont('Plex', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...C.ink3);
  [0, 0.5, 1].forEach((fr) => {
    const yy = bottom - fr * ih;
    doc.line(left, yy, right, yy);
    doc.text(String(rainTop * fr), left - 1.5, yy + 1, { align: 'right' });
    const tv = tMin + fr * (tMax - tMin);
    doc.text(`${tv}°`, right + 1.5, yy + 1);
  });
  doc.text('mm', left - 1.5, top - 1, { align: 'right' });
  // bars
  const bw = Math.max(0.4, step * 0.7);
  days.forEach((d, i) => {
    if (!d.precipitationMm) return;
    const bh = (d.precipitationMm / rainTop) * ih;
    if (d.precipitationMm >= HEAVY_DAY_MM) doc.setFillColor(30, 70, 105);
    else doc.setFillColor(...C.rain);
    doc.rect(xi(i) - bw / 2, bottom - bh, bw, bh, 'F');
  });
  // lines
  const line = (vals: (number | null)[], yOf: (v: number) => number, c: readonly number[], dash?: number[]) => {
    doc.setDrawColor(c[0], c[1], c[2]);
    doc.setLineWidth(0.45);
    if (dash) doc.setLineDashPattern(dash, 0);
    let prev: [number, number] | null = null;
    vals.forEach((v, i) => {
      if (v === null) {
        prev = null;
        return;
      }
      const pt: [number, number] = [xi(i), yOf(v)];
      if (prev) doc.line(prev[0], prev[1], pt[0], pt[1]);
      prev = pt;
    });
    doc.setLineDashPattern([], 0);
    doc.setLineWidth(0.2);
  };
  line(days.map((d) => d.tMaxC), (v) => bottom - ((v - tMin) / (tMax - tMin)) * ih, C.heat);
  if (days.some((d) => d.soilMoisture && d.soilMoisture > 0)) line(days.map((d) => (d.soilMoisture && d.soilMoisture > 0 ? d.soilMoisture : null)), (v) => bottom - (v / 0.6) * ih, C.soil, [1.2, 1]);
  // x labels
  const every = n > 120 ? 30 : n > 45 ? 14 : n > 20 ? 7 : 2;
  doc.setTextColor(...C.ink3);
  days.forEach((d, i) => {
    if (i % every === 0) doc.text(formatDate(d.date, lang, { day: 'numeric', month: 'short' }), xi(i), bottom + 4, { align: 'center' });
  });
  // legend
  const ly = y0 + h + 2;
  const items: [string, readonly number[]][] = [
    [tr('weather.rain'), C.rain],
    [tr('weather.tmax'), C.heat],
    [tr('weather.soil'), C.soil],
  ];
  let lx = left;
  items.forEach(([label, c]) => {
    doc.setFillColor(c[0], c[1], c[2]);
    doc.rect(lx, ly - 2, 4, 2, 'F');
    doc.text(label, lx + 5.5, ly);
    lx += doc.getTextWidth(label) + 12;
  });
}
