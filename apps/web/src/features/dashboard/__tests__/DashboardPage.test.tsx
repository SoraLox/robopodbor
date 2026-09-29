import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DashboardPage from '@/features/dashboard/DashboardPage';
import { renderWithProviders } from '@/test/utils';

describe('DashboardPage', () => {
  it('без проектов показывает пустое состояние, а не демо-цифры', async () => {
    renderWithProviders(<DashboardPage />, { route: '/dashboard' });
    expect(await screen.findByText('Здесь появятся сохранённые расчёты.')).toBeInTheDocument();
    expect(screen.queryByText(/Волга-Логистик/)).not.toBeInTheDocument();
    expect(screen.queryByText(/12 482|к прошлому месяцу/)).not.toBeInTheDocument();
  });

  it('число роботов в подборе — из каталога', async () => {
    renderWithProviders(<DashboardPage />, { route: '/dashboard' });
    expect(await screen.findByText('из 192 в каталоге')).toBeInTheDocument();
  });
});
