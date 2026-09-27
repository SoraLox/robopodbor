import { describe, expect, it } from 'vitest';
import { changedFields, withAdminEdits, type CatalogSolution } from '@domain/catalog';
import { solutions } from '@/mocks/fixtures';
import { provenanceTag, specGroups, withSourceRefs } from '@/features/catalog/solutionSpecs';

const byId = (id: string) => solutions.find((s) => s.id === id)!;
const rowOf = (id: string, label: string) =>
  withSourceRefs(specGroups(byId(id)))
    .groups.flatMap((group) => group.rows)
    .find((row) => row.label === label)!;

describe('происхождение характеристик', () => {
  it('у точного значения есть сноски на источники', () => {
    const payload = rowOf('AM0001', 'Грузоподъёмность');
    expect(payload.provenance?.confirmed).toBe(true);
    expect(payload.refs?.length).toBeGreaterThan(0);
    expect(provenanceTag(payload.provenance)).toBeUndefined();
  });

  it('приблизительное значение помечено и объяснено', () => {
    const throughput = rowOf('AM0001', 'Производительность');
    expect(provenanceTag(throughput.provenance)).toBe('приблизительно');
    expect(throughput.provenance?.note).toContain('на зону');
  });

  it('страна по производителю — допущение команды', () => {
    expect(provenanceTag(rowOf('AS0004', 'Страна происхождения').provenance)).toBe('допущение');
  });

  it('источники карточки нумеруются без повторов', () => {
    const { sources } = withSourceRefs(specGroups(byId('AM0001')));
    const keys = sources.map((s) => `${s.kind}|${s.title}|${s.url ?? ''}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('правка администратора заменяет источник изменённого поля, остальные не трогает', () => {
    const before = byId('AM0001') as CatalogSolution;
    const changed = changedFields(before, { payloadKg: 1200, speed: before.speed, infrastructure: { ...before.infrastructure, charging: 'ручная' } });
    expect(changed).toEqual(['payloadKg', 'infrastructure.charging']);
    const next = withAdminEdits(before.fieldSources, changed, '28.09.2026')!;
    expect(provenanceTag(next.payloadKg)).toBe('изменено вручную');
    expect(next.weightKg).toEqual(before.fieldSources?.weightKg);
  });
});
