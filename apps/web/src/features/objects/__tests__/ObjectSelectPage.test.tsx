import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import ObjectSelectPage from '@/features/objects/ObjectSelectPage';
import { renderWithProviders } from '@/test/utils';

describe('ObjectSelectPage', () => {
  it('рисует три карточки типов объектов, по умолчанию выбор не сделан', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/calculate/:objectType" element={<ObjectSelectPage />} />
      </Routes>,
      { route: '/calculate/warehouse' },
    );

    await waitFor(() => expect(screen.getByText('Склад')).toBeInTheDocument());

    expect(screen.getByText('Аэропорт')).toBeInTheDocument();
    expect(screen.getByText('Медучреждение')).toBeInTheDocument();

    const warehouseCard = screen.getByText('Склад').closest('[role="button"]');
    expect(warehouseCard).toHaveAttribute('aria-pressed', 'false');

    expect(screen.getByRole('button', { name: /далее/i })).toBeDisabled();
  });
});
