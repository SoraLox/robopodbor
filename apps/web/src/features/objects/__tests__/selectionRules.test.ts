import { describe, expect, it } from 'vitest';
import { selectSolutions } from '@domain/selection';
import type { CatalogSolution } from '@domain/catalog';
import { objectParameters, solutions } from '@/mocks/fixtures';

const run = (objectType: string) =>
  selectSolutions({
    objectType,
    parameters: {},
    solutions: solutions as CatalogSolution[],
    fields: objectParameters[objectType] ?? [],
  });
const itemOf = (objectType: string, id: string) => run(objectType).items.find((item) => item.solutionId === id);

describe('правила подбора на каталоге роботов', () => {
  it('пример организатора подходит объекту наравне с заявленным', () => {
    const h1500 = itemOf('airport', 'AM0001')!;
    expect(h1500.reasons).toContain('Организатор приводит это решение как пример для такого типа объекта');
    expect(h1500.missing.some((line) => line.includes('выведена по сценариям'))).toBe(false);
  });

  it('курьера для медикаментов не сравнивают с тележкой питания', () => {
    const ronaviSd = itemOf('clinic', 'AM0004')!;
    expect(ronaviSd.status).not.toBe('excluded');
    expect(ronaviSd.blockers).toEqual([]);
  });

  it('лёгкий складской AMR — ограничение, а не исключение', () => {
    const ronaviSr = itemOf('warehouse', 'AM0002')!;
    expect(ronaviSr.status).not.toBe('excluded');
    expect(ronaviSr.limitations.some((line) => line.startsWith('Не поднимает груз'))).toBe(true);
  });

  it('PuduBot 2 из примеров организатора есть в подборе клиники', () => {
    expect(itemOf('clinic', 'EX0001')).toBeDefined();
  });
});
