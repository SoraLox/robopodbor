import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import ObjectWizardLayout from '@/features/objects/ObjectWizardLayout';
import { renderWithProviders } from '@/test/utils';

describe('ObjectSelectPage', () => {
  it('рисует три варианта типов объектов, по умолчанию выбор не сделан', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/calculate/:objectType" element={<ObjectWizardLayout />}>
          <Route index element={null} />
          <Route path="form" element={null} />
        </Route>
      </Routes>,
      { route: '/calculate/warehouse' },
    );

    const warehouseCard = await screen.findByRole('radio', { name: /склад/i });
    expect(warehouseCard).toHaveAttribute('aria-checked', 'false');

    expect(screen.getByRole('radio', { name: /аэропорт/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /медучреждение/i })).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /продолжить/i })).toBeDisabled();
  });
});
