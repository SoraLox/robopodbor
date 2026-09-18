import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { RequireAuth } from '@/app/RequireAuth';
import { api } from '@/api/client';
import { renderWithProviders } from '@/test/utils';

function renderGuard(role?: 'admin' | 'user') {
  return renderWithProviders(
    <Routes>
      <Route
        path="/secret"
        element={
          <RequireAuth {...(role ? { role } : {})}>
            <div>ЗАКРЫТЫЙ РАЗДЕЛ</div>
          </RequireAuth>
        }
      />
      <Route path="/login" element={<div>ЭКРАН ВХОДА</div>} />
      <Route path="/forbidden" element={<div>НЕТ ПРАВ</div>} />
    </Routes>,
    { route: '/secret' },
  );
}

describe('RequireAuth', () => {
  it('гостя уводит на вход', async () => {
    await api.POST('/auth/logout');
    renderGuard();
    await waitFor(() => expect(screen.getByText('ЭКРАН ВХОДА')).toBeInTheDocument());
  });

  it('пускает вошедшего пользователя', async () => {
    await api.POST('/auth/login', {
      body: { email: 'krylov@volga-logistic.ru', password: 'volga123' },
    });
    renderGuard();
    await waitFor(() => expect(screen.getByText('ЗАКРЫТЫЙ РАЗДЕЛ')).toBeInTheDocument());
  });

  it('обычного пользователя не пускает в админский раздел', async () => {
    await api.POST('/auth/login', {
      body: { email: 'krylov@volga-logistic.ru', password: 'volga123' },
    });
    renderGuard('admin');
    await waitFor(() => expect(screen.getByText('НЕТ ПРАВ')).toBeInTheDocument());
  });

  it('администратора пускает в админский раздел', async () => {
    await api.POST('/auth/login', {
      body: { email: 'admin@robotopodbor.ru', password: 'admin123' },
    });
    renderGuard('admin');
    await waitFor(() => expect(screen.getByText('ЗАКРЫТЫЙ РАЗДЕЛ')).toBeInTheDocument());
  });
});
