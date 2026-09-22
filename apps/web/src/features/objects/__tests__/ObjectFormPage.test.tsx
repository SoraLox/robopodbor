import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import ObjectWizardLayout from '@/features/objects/ObjectWizardLayout';
import { renderWithProviders } from '@/test/utils';

function renderForm(route: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/calculate/:objectType" element={<ObjectWizardLayout />}>
        <Route index element={null} />
        <Route path="form" element={null} />
      </Route>
      <Route path="/calculate/:objectType/processes" element={<div>ЭКРАН ПРОЦЕССОВ</div>} />
    </Routes>,
    { route },
  );
}

describe('ObjectFormPage', () => {
  it('состав полей зависит от типа объекта', async () => {
    renderForm('/calculate/airport/form');

    await waitFor(() => expect(screen.getByLabelText(/Пассажиропоток/)).toBeInTheDocument());
    expect(screen.getByLabelText(/Площадь перрона/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Общая площадь склада/)).not.toBeInTheDocument();
  });

  it('не пропускает значение ниже минимального', async () => {
    const user = userEvent.setup();
    renderForm('/calculate/warehouse/form');

    const area = await screen.findByLabelText(/Общая площадь склада/);
    await user.clear(area);
    await user.type(area, '5');
    await user.click(screen.getByRole('button', { name: 'Далее' }));

    await waitFor(() => expect(screen.getByText('Минимум 10000')).toBeInTheDocument());
    expect(screen.queryByText('ЭКРАН ПРОЦЕССОВ')).not.toBeInTheDocument();
  });

  it('с корректными значениями переходит к процессам', async () => {
    const user = userEvent.setup();
    renderForm('/calculate/warehouse/form');

    await screen.findByLabelText(/Общая площадь склада/);
    await user.click(screen.getByRole('button', { name: 'Далее' }));

    await waitFor(() => expect(screen.getByText('ЭКРАН ПРОЦЕССОВ')).toBeInTheDocument());
  });
});
