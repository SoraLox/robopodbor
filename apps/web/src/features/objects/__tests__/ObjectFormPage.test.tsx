import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import ObjectFormPage from '@/features/objects/ObjectFormPage';
import { renderWithProviders } from '@/test/utils';

function renderForm(route: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/calculate/:objectType/form" element={<ObjectFormPage />} />
      <Route path="/calculate/:objectType/processes" element={<div>ЭКРАН ПРОЦЕССОВ</div>} />
    </Routes>,
    { route },
  );
}

describe('ObjectFormPage', () => {
  it('состав полей зависит от типа объекта', async () => {
    renderForm('/calculate/airport/form');

    // Поля аэропорта приходят из контракта, складских среди них нет.
    await waitFor(() => expect(screen.getByLabelText(/Пассажиропоток/)).toBeInTheDocument());
    expect(screen.getByLabelText(/Багажных мест/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Площадь склада/)).not.toBeInTheDocument();
  });

  it('не пропускает значение ниже минимального', async () => {
    const user = userEvent.setup();
    renderForm('/calculate/warehouse/form');

    const area = await screen.findByLabelText(/Площадь склада/);
    await user.clear(area);
    await user.type(area, '5');
    await user.click(screen.getByRole('button', { name: /Далее: процессы/ }));

    await waitFor(() => expect(screen.getByText('Минимум 100')).toBeInTheDocument());
    expect(screen.queryByText('ЭКРАН ПРОЦЕССОВ')).not.toBeInTheDocument();
  });

  it('с корректными значениями переходит к процессам', async () => {
    const user = userEvent.setup();
    renderForm('/calculate/warehouse/form');

    await screen.findByLabelText(/Площадь склада/);
    await user.click(screen.getByRole('button', { name: /Далее: процессы/ }));

    await waitFor(() => expect(screen.getByText('ЭКРАН ПРОЦЕССОВ')).toBeInTheDocument());
  });
});
