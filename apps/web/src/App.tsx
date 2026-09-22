import { Route, Routes } from 'react-router-dom';
import { RequireAuth } from '@/app/RequireAuth';
import { RootLayout } from '@/app/RootLayout';
import LandingPage from '@/features/landing/LandingPage';
import DashboardPage from '@/features/dashboard/DashboardPage';
import LoginPage from '@/features/auth/LoginPage';
import ObjectWizardLayout from '@/features/objects/ObjectWizardLayout';
import ResultsPage from '@/features/results/ResultsPage';
import CatalogPage from '@/features/catalog/CatalogPage';
import ComparePage from '@/features/catalog/ComparePage';
import ProjectsPage from '@/features/projects/ProjectsPage';
import SettingsPage from '@/features/settings/SettingsPage';
import MethodologyPage from '@/features/methodology/MethodologyPage';
import PrivacyPage from '@/features/legal/PrivacyPage';
import AdminPage from '@/features/admin/AdminPage';
import CatalogAdminPage from '@/features/admin/CatalogAdminPage';
import ForbiddenPage from '@/features/shared/ForbiddenPage';
import NotFoundPage from '@/features/shared/NotFoundPage';

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
