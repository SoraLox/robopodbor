import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LandingPage from '@/features/landing/LandingPage';
import { renderWithProviders } from '@/test/utils';

describe('LandingPage', () => {
  it('держит структуру секций лендинга', () => {
    const { container } = renderWithProviders(<LandingPage />, { route: '/' });
    expect(container.querySelectorAll('section')).toHaveLength(7);
  });

  it('на первом экране объясняет продукт и ведёт в расчёт одной кнопкой', () => {
    renderWithProviders(<LandingPage />, { route: '/' });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /Сколько стоят роботы и когда они окупятся/i,
    );
    // Держимся за обещание продукта, а не за точную формулировку:
    // прослеживаемость каждой цифры — то, чем лендинг отличается от
    // калькулятора вендора, и терять это из первого экрана нельзя.
    expect(
      screen.getByText(/источник(а|у)? каждой цифры/i),
    ).toBeInTheDocument();

    const cta = screen.getByRole('link', { name: /Рассчитать окупаемость/i });
    expect(cta).toHaveAttribute('href', '/calculate/warehouse');
  });

  it('не содержит служебных плашек макета', () => {
    renderWithProviders(<LandingPage />, { route: '/' });
    expect(screen.queryByText(/ЛЦТ 2026/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ФЦ БАС/)).not.toBeInTheDocument();
  });
});
