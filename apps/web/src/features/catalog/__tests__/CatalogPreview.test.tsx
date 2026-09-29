import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { solutions } from '@/mocks/fixtures';
import { renderWithProviders } from '@/test/utils';
import { CatalogPreview } from '@/features/catalog/CatalogPreview';
import { categorize } from '@/features/catalog/solutionCategory';

const byId = (id: string) => solutions.find((s) => s.id === id)!;
const show = (id: string) =>
  renderWithProviders(<CatalogPreview solution={byId(id)} open compared={false} onClose={vi.fn()} onToggleCompare={vi.fn()} />);

describe('CatalogPreview', () => {
  it('показывает источники характеристик и неточные значения', () => {
    show('AM0001');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const sources = screen.getByRole('heading', { name: 'Источники' }).parentElement!;
    expect(within(sources).getAllByRole('listitem').length).toBeGreaterThan(1);
    expect(within(sources).getByRole('link', { name: /Ronavi/ })).toHaveAttribute('href', expect.stringMatching(/^https:/));
    expect(screen.getAllByText('приблизительно').length).toBeGreaterThan(0);
    expect(screen.getByText(/на зону, не на робота/)).toBeInTheDocument();
  });

  it('без фото показывает плейсхолдер категории', () => {
    const noPhoto = solutions.find((s) => !s.photos?.length && s.objectTypes?.length)!;
    show(noPhoto.id);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getAllByText(categorize(noPhoto).label).length).toBeGreaterThan(0);
  });
});
