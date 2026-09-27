import { describe, expect, it } from 'vitest';
import { solutions } from '@/mocks/fixtures';
import { groupByProcess, robotsCount } from '@/features/objects/processGroups';

const rowsFor = (objectType: string) =>
  solutions.filter((s) => s.objectTypes?.includes(objectType)).map((solution) => ({ solution }));

describe('processGroups', () => {
  it('раскладывает роботов склада по процессам', () => {
    const groups = groupByProcess('warehouse', rowsFor('warehouse'));
    const ids = groups.map((g) => g.id);
    expect(ids).toContain('cleaning');
    expect(ids).toContain('transport');
    // процессы аэропорта в складе не появляются, даже если робот работает и там
    expect(ids).not.toContain('inspection');
    expect(ids).not.toContain('ramp');
  });

  it('уборщиков склада делит на уборщиков помещений и уличных', () => {
    const cleaning = groupByProcess('warehouse', rowsFor('warehouse')).find((g) => g.id === 'cleaning')!;
    expect(cleaning.title).toBe('Роботы-уборщики');
    expect(cleaning.subgroups.map((s) => s.label).sort()).toEqual(['Уборщики помещений', 'Уличные уборщики']);
  });

  it('группа из одной категории — без подкатегорий', () => {
    const inventory = groupByProcess('warehouse', rowsFor('warehouse')).find((g) => g.id === 'inventory')!;
    expect(inventory.subgroups).toHaveLength(1);
  });

  it('у каждого робота объекта есть группа', () => {
    const rows = rowsFor('clinic');
    const grouped = new Set(groupByProcess('clinic', rows).flatMap((g) => g.rows.map((r) => r.solution.id)));
    expect(grouped.size).toBe(rows.length);
  });

  it('склоняет «робот»', () => {
    expect(robotsCount(1)).toBe('1 робот');
    expect(robotsCount(3)).toBe('3 робота');
    expect(robotsCount(11)).toBe('11 роботов');
    expect(robotsCount(22)).toBe('22 робота');
  });
});
