import { Route, Routes } from 'react-router-dom';
import { RequireAuth } from '@/app/RequireAuth';
import LandingPage from '@/features/landing/LandingPage';
import DashboardPage from '@/features/dashboard/DashboardPage';
import LoginPage from '@/features/auth/LoginPage';
import ObjectSelectPage from '@/features/objects/ObjectSelectPage';
import ObjectFormPage from '@/features/objects/ObjectFormPage';
import ProcessesPage from '@/features/objects/ProcessesPage';
import ResultsPage from '@/features/results/ResultsPage';
import CatalogPage from '@/features/catalog/CatalogPage';
import ComparePage from '@/features/catalog/ComparePage';
import ProjectsPage from '@/features/projects/ProjectsPage';
import MethodologyPage from '@/features/methodology/MethodologyPage';
import AdminPage from '@/features/admin/AdminPage';
import CatalogAdminPage from '@/features/admin/CatalogAdminPage';
import ForbiddenPage from '@/features/shared/ForbiddenPage';
import NotFoundPage from '@/features/shared/NotFoundPage';

export function App() {
  return (
    <Routes>
      {/* Публичное: гость проходит весь путь до результата без входа */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/methodology" element={<MethodologyPage />} />
      <Route path="/catalog" element={<CatalogPage />} />
      <Route path="/catalog/compare" element={<ComparePage />} />
      <Route path="/admin" element={<AdminPage />} />

      <Route path="/calculate/:objectType" element={<ObjectSelectPage />} />
      <Route path="/calculate/:objectType/form" element={<ObjectFormPage />} />
      <Route path="/calculate/:objectType/processes" element={<ProcessesPage />} />
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

      {/* Требует роли администратора */}
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
    </Routes>
  );
}

export default App;
