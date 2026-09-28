import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api } from '@/api/client';
import { runCalculation } from '@/api/queries';
import { server } from '@/mocks/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());

describe('POST /calculations в моках', () => {
  it('считает по выбранному решению и отдаёт тот же результат по id', async () => {
    const result = await runCalculation({
      objectType: 'warehouse',
      solutionId: 'AM0001',
      parameters: { wh_nih_operatory_pogruzchikov: '40' },
      processes: ['transport'],
    });
    expect(result.solutionId).toBe('AM0001');
    expect(result.meta).toContain('Ronavi');

    const { data } = await api.GET('/calculations/{calculationId}', {
      params: { path: { calculationId: result.id } },
    });
    expect(data?.payback).toEqual(result.payback);
  });

  it('неизвестный расчёт — 404, а не подменённый демо-результат', async () => {
    const { response } = await api.GET('/calculations/{calculationId}', {
      params: { path: { calculationId: 'no-such-id' } },
    });
    expect(response.status).toBe(404);
  });
});
