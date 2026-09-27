import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import ResultsPage from '@/features/results/ResultsPage';
import { renderWithProviders } from '@/test/utils';

describe('ResultsPage', () => {
  it('показывает KPI окупаемости и сценарии с моков MSW', async () => {
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
      () => expect(screen.getAllByText('Срок окупаемости').length).toBeGreaterThan(0),
      { timeout: 5000 },
    );

    expect(screen.getAllByText('3.2').length).toBeGreaterThan(0);
    expect(screen.getByText('Рекомендуем')).toBeInTheDocument();
    expect(screen.getAllByText('Сравнение решений').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Структура затрат').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Чувствительность').length).toBeGreaterThan(0);
    expect(screen.getByTestId('visualization-slot')).toBeInTheDocument();
  });
});
