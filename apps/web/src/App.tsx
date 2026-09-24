import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { RequireAuth } from '@/app/RequireAuth';
import { RootLayout } from '@/app/RootLayout';
import LandingPage from '@/features/landing/LandingPage';

/*
  Лендинг грузится сразу — это точка входа и самый частый первый экран.
  Все остальные маршруты уезжают в отдельные чанки: иначе гость на лендинге
  тянет three.js, recharts, jspdf и xlsx, которые нужны только в визарде,
  результатах и выгрузке. Suspense-граница стоит в RootLayout, под шапкой.
*/
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'));
const LoginPage = lazy(() => import('@/features/auth/LoginPage'));
const ObjectWizardLayout = lazy(() => import('@/features/objects/ObjectWizardLayout'));
const ResultsPage = lazy(() => import('@/features/results/ResultsPage'));
const CatalogPage = lazy(() => import('@/features/catalog/CatalogPage'));
const ComparePage = lazy(() => import('@/features/catalog/ComparePage'));
const ProjectsPage = lazy(() => import('@/features/projects/ProjectsPage'));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'));
const MethodologyPage = lazy(() => import('@/features/methodology/MethodologyPage'));
const PrivacyPage = lazy(() => import('@/features/legal/PrivacyPage'));
const AdminPage = lazy(() => import('@/features/admin/AdminPage'));
const CatalogAdminPage = lazy(() => import('@/features/admin/CatalogAdminPage'));
const ForbiddenPage = lazy(() => import('@/features/shared/ForbiddenPage'));
const NotFoundPage = lazy(() => import('@/features/shared/NotFoundPage'));

export function App() {
  return (
    <Routes>
      {/* SiteHeader один раз на все маршруты — страницы шапку не монтируют. */}
      <Route element={<RootLayout />}>
        {/* Публичное: гость проходит весь путь до результата без входа */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/methodology" element={<MethodologyPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/catalog/compare" element={<ComparePage />} />

        <Route path="/calculate/:objectType" element={<ObjectWizardLayout />}>
          <Route index element={null} />
          <Route path="form" element={null} />
          <Route path="processes" element={null} />
          <Route path="calculating" element={null} />
        </Route>
        <Route
          path="/calculate/:objectType/results/:calculationId"
          element={<ResultsPage />}
        />

        {/* Требуют сессии */}
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/projects"
          element={
            <RequireAuth>
              <ProjectsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <SettingsPage />
            </RequireAuth>
          }
        />

        {/* Требует роли администратора (см. 3.1.4 ТЗ) */}
        <Route
          path="/admin"
          element={
            <RequireAuth role="admin">
              <AdminPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/catalog"
          element={
            <RequireAuth role="admin">
              <CatalogAdminPage />
            </RequireAuth>
          }
        />

        <Route path="/forbidden" element={<ForbiddenPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default App;
