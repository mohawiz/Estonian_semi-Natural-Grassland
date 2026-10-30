import { useEffect, useState } from 'react';
import { useApp } from '../../app/store';
import { Icon } from '../../components/Icon';
import { formatDate } from '../../lib/dates';
import { formatNumber } from '../../lib/units';
import type { PhotoMeta } from '../../lib/types';

export function useBlobUrl(blob: Blob | undefined) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

export function PhotoThumb({ photo, onRemove, onLocate }: { photo: PhotoMeta; onRemove?: () => void; onLocate?: () => void }) {
  const { t, lang } = useApp();
  const url = useBlobUrl(photo.blob);
  const when = photo.takenAt ? formatDate(photo.takenAt, lang, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  return (
    <figure className="thumb" style={{ margin: 0 }}>
      {url && <img src={url} alt={photo.caption ?? photo.fileName} />}
      <figcaption className="meta">
        {photo.isDemoIllustration && <span className="badge badge-demo">{t('labels.demo')}</span>}
        <div>
          {t('log.photoDate')}: {when}
        </div>
        <div className="muted">{t(`log.photoDateFrom.${photo.takenAtSource}`)}</div>
        <div className="muted">
          {photo.lat !== undefined && photo.lon !== undefined ? `${formatNumber(photo.lat, lang, 4)}, ${formatNumber(photo.lon, lang, 4)}` : t('log.photoNoLocation')}
        </div>
        <div className="row" style={{ gap: 4, marginTop: 4 }}>
          {onLocate && photo.lat === undefined && !photo.isDemoIllustration && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onLocate} title={t('log.addLocation')} aria-label={t('log.addLocation')}>
              <Icon name="pin" size={16} />
            </button>
          )}
          {onRemove && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onRemove} aria-label={`${t('log.removePhoto')} ${photo.fileName}`}>
              <Icon name="trash" size={16} />
            </button>
          )}
        </div>
      </figcaption>
    </figure>
  );
}
