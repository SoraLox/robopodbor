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

  it('показатели кабинета понятны без расчётов: сохранённые расчёты и избранные роботы', async () => {
    renderWithProviders(<DashboardPage />, { route: '/dashboard' });
    expect(await screen.findByText('Сохранённые расчёты')).toBeInTheDocument();
    expect(screen.getByText('нажмите ♥ на карточке в каталоге')).toBeInTheDocument();
    expect(screen.getByText('сохраните расчёт с экрана результатов')).toBeInTheDocument();
  });
});
