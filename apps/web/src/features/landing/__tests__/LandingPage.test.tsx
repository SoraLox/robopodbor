import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LandingPage from '@/features/landing/LandingPage';
import { renderWithProviders } from '@/test/utils';

// Canvas в jsdom не рендерится — сам манипулятор проверяется в браузере.
vi.mock('@/features/auth/components/RobotArmHero', () => ({
  RobotArmHero: () => <div data-testid="robot-arm-hero" />,
}));

describe('LandingPage', () => {
  it('держит обещанную структуру из девяти секций', () => {
    const { container } = renderWithProviders(<LandingPage />, { route: '/' });
    expect(container.querySelectorAll('section')).toHaveLength(9);
  });

  it('ведёт по сценарию: проблема → решение → проводник → план → цены → возражения', () => {
    renderWithProviders(<LandingPage />, { route: '/' });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Окупится ли/i);
    expect(screen.getByTestId('robot-arm-hero')).toBeInTheDocument();

    // textContent не вставляет пробел на месте <br>, поэтому сверяем по смыслу
    const sectionTitles = screen
      .getAllByRole('heading', { level: 2 })
      .map((node) => node.textContent?.replace(/\s+/g, ' ').trim());

    expect(sectionTitles).toEqual([
      'Восемьдесятмиллионоввслепую',
      'Три сценарияна одном экране',
      'Мы не продаёмроботов',
      'Четыре минуты, три шага',
      'Расчёт бесплатный',
      'Вопросы',
      'Посчитайте свой объект',
    ]);
  });

  it('план состоит ровно из трёх шагов', () => {
    const { container } = renderWithProviders(<LandingPage />, { route: '/' });
    const plan = container.querySelector('ol');
    expect(plan?.querySelectorAll('li')).toHaveLength(3);
  });

  it('не содержит служебных плашек макета', () => {
    renderWithProviders(<LandingPage />, { route: '/' });
    expect(screen.queryByText(/ЛЦТ 2026/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ФЦ БАС/)).not.toBeInTheDocument();
  });
});
