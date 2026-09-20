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

    // Мок держит паузу, имитируя долгий прогон модели на бэкенде.
    expect(screen.getByText('Идёт расчёт сценариев')).toBeInTheDocument();

    await waitFor(
      () => expect(screen.getByText('Срок окупаемости')).toBeInTheDocument(),
      { timeout: 5000 },
    );

    expect(screen.getByText('3.2')).toBeInTheDocument();
    expect(screen.getByText('Рекомендуем')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Сравнение решений' })).toBeInTheDocument();
    expect(screen.getByText('Структура затрат')).toBeInTheDocument();
    expect(screen.getByText('Анализ чувствительности')).toBeInTheDocument();
    expect(screen.getByTestId('visualization-slot')).toBeInTheDocument();
  });
});
