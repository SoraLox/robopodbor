import {
  ACQUISITION_LABEL,
  AVAILABILITY_LABEL,
  OBJECT_LABEL,
  OBJECT_PROCESSES,
  type FieldProvenance,
  type FieldSource,
} from '@domain/catalog';
import type { Solution } from '@/api/types';
import { categorize } from './solutionCategory';

export interface SpecRow {
  label: string;
  value: string | undefined;
  /** Значение принято как допущение, а не взято из подтверждённого источника. */
  assumption?: boolean;
  /** Откуда значение и насколько оно точное (ТЗ 3.3.4). */
  provenance?: FieldProvenance;
  /** Номера источников в списке specSources — для сносок. */
  refs?: number[];
}

/** Метка неточного значения: чем оно отличается от точного из источника. */
export function provenanceTag(provenance: FieldProvenance | undefined): string | undefined {
  if (!provenance || provenance.confirmed) return undefined;
  const kinds = provenance.sources.map((source) => source.kind);
  if (kinds.includes('admin')) return 'изменено вручную';
  if (kinds.every((kind) => kind === 'team')) return 'допущение';
  return 'приблизительно';
}

export interface SpecGroup {
  title: string;
  rows: SpecRow[];
}

const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

function n(value: number | undefined, unit: string): string | undefined {
  return value === undefined ? undefined : `${nf.format(value)} ${unit}`.trim();
}

function yesNo(value: boolean | undefined, yes: string, no: string) {
  return value === undefined ? undefined : value ? yes : no;
}

function list(values: string[] | undefined, empty = 'нет'): string | undefined {
  if (!values) return undefined;
  return values.length ? values.join('; ') : empty;
}

const PROCESS_LABEL: Record<string, string> = Object.fromEntries(
  Object.values(OBJECT_PROCESSES).flatMap((processes) => processes.map((p) => [p.id, p.label])),
);

function money(value: number | undefined) {
  return value === undefined ? undefined : `${nf.format(value)} млн ₽`;
}

/** Карточка решения по группам таблицы 3.3 ТЗ. */
export function specGroups(solution: Solution): SpecGroup[] {
  const assumed = new Set(solution.unconfirmedFields ?? []);
  const provenance = (solution.fieldSources ?? {}) as Record<string, FieldProvenance>;
  const row = (label: string, value: string | undefined, key?: string): SpecRow => ({
    label,
    value,
    assumption: assumed.has(label),
    provenance: key && value !== undefined ? provenance[key] : undefined,
  });
  const costs = solution.costs ?? {};
  const infra = solution.infrastructure ?? {};

  return [
    {
      title: 'Идентификация',
      rows: [
        row('Производитель', solution.vendor, 'vendor'),
        row('Тип решения', categorize(solution).label),
        row('Назначение', solution.useCase, 'useCase'),
        row('Страна происхождения', solution.country, 'country'),
        row('Статус доступности', solution.availability ? AVAILABILITY_LABEL[solution.availability] : undefined),
      ],
    },
    {
      title: 'Технические характеристики',
      rows: [
        row('Грузоподъёмность', solution.payloadKg === 0 ? 'не перевозит грузы' : n(solution.payloadKg, 'кг') ?? solution.payload, 'payloadKg'),
        row('Габариты', solution.dimensions, 'dimensions'),
        row('Масса', n(solution.weightKg, 'кг'), 'weightKg'),
        row('Скорость', solution.speed === '—' ? undefined : solution.speed, 'speed'),
        row(
          'Производительность',
          solution.throughput !== undefined ? `${nf.format(solution.throughput)} ${solution.throughputUnit ?? ''}`.trim() : undefined,
          'throughput',
        ),
        row('Автономность', solution.autonomyHours === 24 ? 'работа от сети' : n(solution.autonomyHours, 'ч'), 'autonomyHours'),
        row('Точность позиционирования', n(solution.positioningAccuracyMm, 'мм'), 'positioningAccuracyMm'),
        row('Тип навигации', solution.navigation, 'navigation'),
        row('Условия эксплуатации', solution.operatingConditions, 'operatingConditions'),
        row('Шум', n(solution.noiseDb, 'дБА'), 'noiseDb'),
      ],
    },
    {
      title: 'Инфраструктура',
      rows: [
        row('Покрытие и проходы', infra.floor, 'infrastructure.floor'),
        row('Мин. ширина прохода', n(solution.minAisleWidthM, 'м'), 'minAisleWidthM'),
        row('Допуск ровности пола', n(solution.maxFloorDeviationMm, 'мм/2м'), 'maxFloorDeviationMm'),
        row('Мин. высота помещения', n(solution.minCeilingHeightM, 'м'), 'minCeilingHeightM'),
        row('Зарядные станции', infra.charging, 'infrastructure.charging'),
        row('Связь', infra.connectivity, 'infrastructure.connectivity'),
        row('Интеграция', infra.integration, 'infrastructure.integration'),
        row('Лифты', yesNo(solution.elevatorIntegration, 'умеет вызывать лифт', 'без интеграции с лифтами'), 'elevatorIntegration'),
        row('Допуск на перрон', yesNo(solution.airsideCertified, 'есть', 'нет'), 'airsideCertified'),
        row('Сервисное обслуживание', infra.service, 'infrastructure.service'),
      ],
    },
    {
      title: 'Экономика',
      rows: [
        row('Цена единицы', solution.price === '—' ? undefined : `${solution.price} млн ₽`, 'price'),
        row('Оборудование', money(costs.equipment), 'costs.equipment'),
        row('ПО', money(costs.software), 'costs.software'),
        row('Внедрение', money(costs.implementation), 'costs.implementation'),
        row('Обслуживание в год', money(costs.maintenancePerYear), 'costs.maintenancePerYear'),
        row('Модель приобретения', solution.acquisitionModels?.map((m) => ACQUISITION_LABEL[m]).join(', '), 'acquisitionModels'),
        row('Срок службы', n(solution.lifespanYears, 'лет'), 'lifespanYears'),
      ],
    },
    {
      title: 'Применимость',
      rows: [
        row('Типы объектов', solution.objectTypes?.map((t) => OBJECT_LABEL[t] ?? t).join(', ')),
        row('Процессы', solution.processes?.map((p) => PROCESS_LABEL[p] ?? p).join(', ')),
        row('Ограничения', list(solution.limitations)),
        row('Реализованные кейсы', list(solution.cases, 'нет подтверждённых кейсов')),
      ],
    },
    {
      title: 'Качество данных',
      rows: [
        row('Источник', solution.source),
        row('Дата актуализации', solution.sourceDate),
        row('Подтверждённость', solution.confidence === 'confirmed' ? 'подтверждены' : 'требуют проверки'),
        row('Полнота карточки', solution.completeness !== undefined ? `${solution.completeness}%` : undefined),
        row('Допущения', list(solution.unconfirmedFields)),
      ],
    },
  ];
}

const sourceKey = (source: FieldSource) => `${source.kind}|${source.title}|${source.url ?? ''}`;

/**
 * Источники карточки одним нумерованным списком (в порядке первого упоминания)
 * и строки характеристик со сносками на него.
 */
export function withSourceRefs(groups: SpecGroup[]): { groups: SpecGroup[]; sources: FieldSource[] } {
  const sources: FieldSource[] = [];
  const index = new Map<string, number>();
  const numbered = groups.map((group) => ({
    ...group,
    rows: group.rows.map((row) => {
      const refs = (row.provenance?.sources ?? []).map((source) => {
        const key = sourceKey(source);
        if (!index.has(key)) {
          sources.push(source);
          index.set(key, sources.length);
        }
        return index.get(key)!;
      });
      return { ...row, refs: [...new Set(refs)] };
    }),
  }));
  return { groups: numbered, sources };
}

