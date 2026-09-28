import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import ResultsPage from '@/features/results/ResultsPage';
import { renderWithProviders } from '@/test/utils';

describe('ResultsPage', () => {
  it('показывает KPI окупаемости и категории отчёта с предпросмотром', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route
          path="/calculate/:objectType/results/:calculationId"
          element={<ResultsPage />}
        />
      </Routes>,
      { route: '/calculate/warehouse/results/demo' },
    );

    expect(screen.getByText('Считаем экономику')).toBeInTheDocument();

    await waitFor(
      () => expect(screen.getAllByText('Окупаемость').length).toBeGreaterThan(0),
      { timeout: 5000 },
    );

    expect(screen.getByText(/3\.2/)).toBeInTheDocument();
    expect(screen.getByText('Рекомендуем')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Сравнение решений/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Структура затрат/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Чувствительность/i })).toBeInTheDocument();
    expect(screen.getByTestId('visualization-slot')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Сравнение решений/i }));
    expect(await screen.findByRole('region', { name: /Сравнение решений/i })).toBeInTheDocument();
  });
});
