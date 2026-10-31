import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { GrassLoader } from '../components/motion';
import { ToastProvider } from '../components/Toast';
import { MeadowCanvas } from '../features/meadow/MeadowCanvas';
import { MeadowProvider } from '../features/meadow/conditions';
import { AppProvider, useApp } from './store';
import { UIProvider } from './ui';
import { Welcome } from '../pages/Welcome';

// Route-level code splitting keeps the first load small on phones.
const named = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) => lazy(() => load().then((m) => ({ default: m[name] })));
const Dashboard = named(() => import('../pages/Dashboard'), 'Dashboard');
const Deadlines = named(() => import('../pages/Deadlines'), 'Deadlines');
const HelpPage = named(() => import('../pages/Help'), 'HelpPage');
const LogList = named(() => import('../pages/Log'), 'LogList');
const EntryForm = named(() => import('../pages/Log'), 'EntryForm');
const PrivacyPage = named(() => import('../pages/Misc'), 'PrivacyPage');
const NotFound = named(() => import('../pages/Misc'), 'NotFound');
const Layout = named(() => import('../components/Layout'), 'Layout');
const ParcelList = named(() => import('../pages/Parcels'), 'ParcelList');
const ParcelForm = named(() => import('../pages/Parcels'), 'ParcelForm');
const ParcelDetail = named(() => import('../pages/Parcels'), 'ParcelDetail');
const ReportPage = named(() => import('../pages/Report'), 'ReportPage');
const RulesPage = named(() => import('../pages/Rules'), 'RulesPage');
const SettingsPage = named(() => import('../pages/Settings'), 'SettingsPage');
const WeatherPage = named(() => import('../pages/Weather'), 'WeatherPage');
const AboutPage = named(() => import('../pages/About'), 'AboutPage');

function Boot() {
  const { t } = useApp();
  return (
    <div className="boot">
      <GrassLoader label={t('app.loading')} />
    </div>
  );
}

function Routed() {
  const { status, settings, t } = useApp();
  if (status === 'loading') return <Boot />;
  if (status === 'error')
    return (
      <div className="welcome">
        <div className="welcome-card glass notice-warn" role="alert">
          {t('errors.storage')}
        </div>
      </div>
    );
  if (!settings.welcomeDone) return <Welcome />;
  return (
    <Suspense fallback={<Boot />}>
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
        <Route path="about" element={<AboutPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
    </Suspense>
  );
}

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <AppProvider>
        <MeadowProvider>
            <UIProvider>
              <ToastProvider>
                <MeadowCanvas />
                <Routed />
              </ToastProvider>
            </UIProvider>
        </MeadowProvider>
      </AppProvider>
    </BrowserRouter>
  );
}
