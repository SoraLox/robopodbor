import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { solutions } from '@/mocks/fixtures';
import { RobotCard } from '@/features/catalog/RobotCard';
import { categorize } from '@/features/catalog/solutionCategory';

const byId = (id: string) => solutions.find((s) => s.id === id)!;

describe('RobotCard', () => {
  it('показывает фото, если оно есть', () => {
    const solution = byId('AM0001');
    render(
      <RobotCard
        solution={solution}
        selected={false}
        previewed={false}
        onOpenPreview={vi.fn()}
        onToggleCompare={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: solution.name })).toBeInTheDocument();
    expect(document.querySelector(`img[src*="robots_photo/preview"]`)).toBeTruthy();
  });

  it('без фото — плейсхолдер категории', () => {
    const solution = solutions.find((s) => !s.photos?.length)!;
    const category = categorize(solution);
    render(
      <RobotCard
        solution={solution}
        selected={false}
        previewed={false}
        onOpenPreview={vi.fn()}
        onToggleCompare={vi.fn()}
      />,
    );
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText(category.label)).toBeInTheDocument();
  });

  it('клик открывает превью, чекбокс — сравнение', async () => {
    const user = userEvent.setup();
    const onOpenPreview = vi.fn();
    const onToggleCompare = vi.fn();
    const solution = byId('AM0001');
    render(
      <RobotCard
        solution={solution}
        selected={false}
        previewed={false}
        onOpenPreview={onOpenPreview}
        onToggleCompare={onToggleCompare}
      />,
    );

    await user.click(screen.getByRole('heading', { name: solution.name }));
    expect(onOpenPreview).toHaveBeenCalled();

    await user.click(screen.getByLabelText(`Добавить ${solution.name} в сравнение`));
    expect(onToggleCompare).toHaveBeenCalled();
  });
});
