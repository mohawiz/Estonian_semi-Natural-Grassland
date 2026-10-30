import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Skeleton } from '../components/ui';
import { ToastProvider } from '../components/Toast';
import { Dashboard } from '../pages/Dashboard';
import { Deadlines } from '../pages/Deadlines';
import { HelpPage } from '../pages/Help';
import { EntryForm, LogList } from '../pages/Log';
import { NotFound, PrivacyPage, Welcome } from '../pages/Misc';
import { ParcelDetail, ParcelForm, ParcelList } from '../pages/Parcels';
import { ReportPage } from '../pages/Report';
import { RulesPage } from '../pages/Rules';
import { SettingsPage } from '../pages/Settings';
import { WeatherPage } from '../pages/Weather';
import { AppProvider, useApp } from './store';
import { UIProvider } from './ui';

function Routed() {
  const { status, settings, t } = useApp();
  if (status === 'loading')
    return (
      <div style={{ padding: 24, display: 'grid', gap: 12, maxWidth: 720, margin: '0 auto' }} aria-busy="true">
        <span className="sr-only">{t('app.loading')}</span>
        <Skeleton height={34} width="50%" />
        <Skeleton height={120} />
        <Skeleton height={200} />
      </div>
    );
  if (status === 'error')
    return (
      <div className="welcome">
        <div className="notice notice-warn" role="alert">
          {t('errors.storage')}
        </div>
      </div>
    );
  if (!settings.welcomeDone) return <Welcome />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="parcels" element={<ParcelList />} />
        <Route path="parcels/new" element={<ParcelForm />} />
        <Route path="parcels/:id" element={<ParcelDetail />} />
        <Route path="parcels/:id/edit" element={<ParcelForm />} />
        <Route path="log" element={<LogList />} />
        <Route path="log/new" element={<EntryForm />} />
        <Route path="log/:id" element={<EntryForm />} />
        <Route path="weather" element={<WeatherPage />} />
        <Route path="report" element={<ReportPage />} />
        <Route path="rules" element={<RulesPage />} />
        <Route path="deadlines" element={<Deadlines />} />
        <Route path="help" element={<HelpPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="privacy" element={<PrivacyPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <AppProvider>
        <UIProvider>
          <ToastProvider>
            <Routed />
          </ToastProvider>
        </UIProvider>
      </AppProvider>
    </BrowserRouter>
  );
}
