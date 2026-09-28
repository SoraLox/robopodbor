import { describe, expect, it } from 'vitest';
import { solutions } from '@/mocks/fixtures';
import { matchesSearch, normalizeSearch } from '@/features/catalog/catalogSearch';
import { buildFilterTree, matchesTreeSelection, WHOLE_CATALOG } from '@/features/catalog/catalogFilterTree';

const found = (query: string) => solutions.filter((s) => matchesSearch(s, query)).map((s) => s.name);

describe('поиск по каталогу', () => {
  it('нормализует как каталог: регистр, ё, пунктуация', () => {
    expect(normalizeSearch('РУБИ-С-03')).toBe('рубис03');
    expect(normalizeSearch('Ёж, ёлка')).toBe('ежелка');
  });

  it('примеры из README каталога', () => {
    expect(found('rubi')).toContain('РУБИ-С-03');
    expect(found('ак sc80')).toContain('АК-SC80');
  });

  it('кириллица находит латинские названия', () => {
    expect(found('ронави h1500')).toContain('Ronavi H1500');
  });

  it('все слова запроса должны найтись', () => {
    expect(found('ронави уборка')).toEqual([]);
  });

  it('по ID и категории каталога', () => {
    expect(found('AM0001')).toEqual(['Ronavi H1500']);
    expect(found('беспилотники').length).toBeGreaterThan(10);
  });
});

describe('дерево фильтров', () => {
  const tree = buildFilterTree(solutions);
  const whole = tree.find((node) => node.id === WHOLE_CATALOG)!;

  it('ветка «весь каталог» охватывает все решения, включая роботов вне трёх объектов', () => {
    expect(whole.count).toBe(solutions.length);
    expect(whole.children.reduce((sum, node) => sum + node.count, 0)).toBe(solutions.length);
    const drones = solutions.filter((s) => matchesTreeSelection(s, { objectType: WHOLE_CATALOG, category: 'UA' }));
    expect(drones.length).toBeGreaterThan(10);
    // Большинство БАС — вне склада, аэропорта и клиники: найти их можно только этой веткой.
    expect(drones.filter((s) => !s.objectTypes?.length).length).toBeGreaterThan(20);
  });

  it('объекты по-прежнему отбирают только свои решения', () => {
    const warehouse = solutions.filter((s) => matchesTreeSelection(s, { objectType: 'warehouse' }));
    expect(warehouse.every((s) => s.objectTypes?.includes('warehouse'))).toBe(true);
  });
});
