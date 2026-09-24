/**
 * Параметры расчёта (форма мастера) + выбранное решение каталога → входы
 * перенесённой 3D-симуляции склада (src/upstream, см. UPSTREAM.md).
 *
 * Число роботов, пиковая потребность и производительность считаются теми же
 * функциями upstream (warehouseAdapter), что и в исходном проекте, — здесь
 * только перевод наших полей в его формат. Допущения перевода собраны в
 * SIMULATION_ASSUMPTIONS и показываются рядом со сценой.
 */
import type { ParameterField, Solution } from '@/api/types';
import { CATALOG } from '@/upstream/domain/catalog.js';
import { OBJECT_TYPES, defaultParamsFor, selectOption } from '@/upstream/domain/objectTypes.js';
import {
  armPeakDemand,
  computeRobotCounts,
  effectiveThroughput,
  loaderCycleSeconds,
  loaderPeakDemand,
  vacuumPeakDemand,
} from '@/upstream/domain/warehouseAdapter.js';
import { energyProfileOf } from '@/upstream/simulation/energy.js';
import {
  MAX_LOADER_COUNT,
  MAX_VACUUM_COUNT,
  computeLayout,
  computeVacuumZoneAreaM2,
} from '@/upstream/simulation/layout.js';

export type SimRobotType = 'vacuum' | 'arm' | 'loader';

export const SIMULATION_ASSUMPTIONS = [
  'Тип робота в сцене определяется по назначению решения: уборка — пылесосы, сортировка и пикинг — роборуки, паллеты и штабелирование — погрузчики.',
  'Потоки приёмки, отгрузки и отбора переведены из суточных в часовые делением на часы работы (смены × длительность смены).',
  'Путь погрузчика от ворот до места хранения — половина стороны склада, если считать его квадратным.',
  'Энергопрофиль (время на зарядке, мощность) взят из демо-каталога симуляции для того же типа робота: в нашем каталоге этих данных нет.',
  'Фура в сцене вмещает не больше 18 паллет (предел модели ворот), реальная еврофура — 33.',
];

const TYPE_KEYWORDS: ReadonlyArray<readonly [SimRobotType, RegExp]> = [
  ['vacuum', /уборк|клининг|мойк|дезинфекц/i],
  ['arm', /манипулятор|сортир|сортер|пикинг/i],
  ['loader', /паллет|штабел|погрузчик|agv|буксир|тележ|транспорт/i],
];

export function simRobotTypeOf(solution: Solution): SimRobotType | null {
  const text = `${solution.name} ${solution.useCase}`;
  return TYPE_KEYWORDS.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

/** «1 500 кг» → 1500, «1.8 м/с» → 1.8, «—» → null. */
export function parseLeadingNumber(text: string | undefined): number | null {
  const match = text?.replace(/\s/g, '').replace(',', '.').match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

/** «Сортировка заказов, 8 000 посылок/ч» → 8000. */
function hourlyRateFrom(useCase: string): number | null {
  const match = useCase.match(/(\d[\d\s]*)\s*[^\d,/]*\/ч/);
  return match?.[1] ? parseLeadingNumber(match[1]) : null;
}

/** «1200×800×1600» (мм) → [120, 80, 160] (см). */
function dimensionsCm(text: string | undefined): number[] {
  return (text ?? '')
    .split(/[×xх*]/i)
    .map((part) => parseLeadingNumber(part))
    .filter((value): value is number => value !== null)
    .map((mm) => mm / 10);
}

const EURO_TRUCK_PALLETS = 33;

const STORAGE_OF_RACK: Record<string, string> = {
  selective: 'front',
  miniload: 'front',
  autostore: 'block',
  shuttle: 'deep',
  drive_in: 'deep',
  push_back: 'deep',
};

type UpstreamParams = ReturnType<typeof defaultParamsFor>;

/** Значение в пределах, на которые рассчитана геометрия сцены. */
function withinSchema(key: string, value: number): number {
  const field = OBJECT_TYPES.warehouse.paramSchema.find((f: { key: string }) => f.key === key) as
    | { min?: number; max?: number }
    | undefined;
  return Math.min(field?.max ?? value, Math.max(field?.min ?? value, value));
}

export function toUpstreamParams(values: Record<string, string>): UpstreamParams {
  const num = (key: string, fallback: number) => parseLeadingNumber(values[key]) ?? fallback;

  const totalArea = num('wh_obschaya_ploschad_sklada', 20000);
  const activeArea = num('wh_ploschad_aktivnoy_zony', totalArea);
  const shiftHours = num('wh_prodolzhitelnost_smeny', 8);
  const shifts = num('wh_kolichestvo_rabochih_smen_sutki', 1);
  const hoursPerDay = Math.max(1, shiftHours * shifts);
  const [lengthCm = 120, widthCm = 80, heightCm = 100] = dimensionsCm(values.wh_pallet_dimensions);
  const floorAreaM2 = withinSchema('floorAreaM2', totalArea);

  return {
    ...defaultParamsFor('warehouse'),
    floorAreaM2,
    workZonePct: withinSchema('workZonePct', Math.round((activeArea / totalArea) * 20) * 5),
    shiftHoursPerDay: shiftHours,
    shiftsPerDay: shifts,
    daysPerYear: num('wh_rabochih_dney_godu', 305),
    peakLoadFactor: num('wh_pikovyy_koeffitsient_nagruzki', 1.5),
    requiredLoadThroughput: num('wh_obem_priemki', 0) / hoursPerDay,
    requiredOutboundThroughput: num('wh_obem_otgruzki', 0) / hoursPerDay,
    requiredSortThroughput: num('wh_obem_otbora', 0) / hoursPerDay,
    skuCount: num('wh_kolichestvo_sku', 40),
    cargoWeightKg: num('wh_massa_gruzovoy_edinitsy', 50),
    cargoLengthCm: withinSchema('cargoLengthCm', lengthCm),
    cargoWidthCm: withinSchema('cargoWidthCm', widthCm),
    cargoHeightCm: withinSchema('cargoHeightCm', heightCm),
    truckPayloadUnits: withinSchema('truckPayloadUnits', EURO_TRUCK_PALLETS),
    routeLengthM: withinSchema('routeLengthM', Math.round(Math.sqrt(floorAreaM2) / 2)),
    storageType: STORAGE_OF_RACK[values.wh_rack_type ?? ''] ?? 'block',
  };
}

type CatalogItem = (typeof CATALOG)[number];
type UpstreamSolution = Omit<CatalogItem, 'technical'> & {
  technical: Omit<CatalogItem['technical'], 'speed' | 'capacityKg'> & {
    speed: number | null;
    capacityKg?: number | undefined;
  };
};

/** Наше решение в формате каталога upstream: паспорт — наш, энергопрофиль — демо того же типа. */
export function toUpstreamSolution(
  solution: Solution,
  type: SimRobotType,
  params: UpstreamParams,
): UpstreamSolution {
  const reference = CATALOG.find((item) => item.identification.type === type)!;
  const speed = parseLeadingNumber(solution.speed) ?? reference.technical.speed;
  const capacityKg = parseLeadingNumber(solution.payload) ?? reference.technical.capacityKg;
  const technical = { ...reference.technical, speed, capacityKg };

  if (type === 'vacuum' && reference.technical.speed && speed) {
    technical.throughput = (reference.technical.throughput * speed) / reference.technical.speed;
  } else if (type === 'arm') {
    technical.throughput = hourlyRateFrom(solution.useCase) ?? reference.technical.throughput;
  } else if (type === 'loader') {
    technical.throughput = 3600 / loaderCycleSeconds({ technical }, params);
  }

  return {
    ...reference,
    id: solution.id,
    identification: { ...reference.identification, name: solution.name, vendor: solution.vendor },
    technical,
  };
}

export function buildSimulationInput(
  fields: ParameterField[],
  values: Record<string, string>,
  solution: Solution,
  type: SimRobotType,
) {
  const merged = {
    ...Object.fromEntries(fields.map((field) => [field.id, field.defaultValue ?? ''])),
    ...values,
  };
  const params = toUpstreamParams(merged);
  const simSolution = toUpstreamSolution(solution, type, params);
  const robotTypes = [type];
  const workZoneShare = params.workZonePct / 100;
  const layout = computeLayout(robotTypes, workZoneShare);
  const vacuumZoneAreaM2 = computeVacuumZoneAreaM2(layout, params.floorAreaM2);
  const only = (t: SimRobotType) => (type === t ? simSolution : null);

  const counts = computeRobotCounts({
    params,
    vacuumZoneAreaM2,
    vacuumSolution: only('vacuum'),
    armSolution: only('arm'),
    loaderSolution: only('loader'),
  });
  const maxCount = { vacuum: MAX_VACUUM_COUNT, arm: layout.maxArmCount, loader: MAX_LOADER_COUNT }[type];
  const rawRecommended = { vacuum: counts.vacuumCount, arm: counts.armCount, loader: counts.loaderCount }[type];

  return {
    type,
    params,
    robotTypes,
    workZoneShare,
    maxCount,
    /** Сколько роботов нужно по расчёту; сцена показывает не больше maxCount. */
    requiredCount: rawRecommended,
    recommendedCount: Math.max(1, Math.min(maxCount, rawRecommended)),
    throughput: effectiveThroughput(simSolution, params),
    capacityKg: simSolution.technical.capacityKg ?? 100,
    speedMps: simSolution.technical.speed ?? 2,
    slotsPerLane: selectOption('warehouse', 'storageType', params.storageType)?.slotsPerLane ?? 1,
    demand: {
      vacuum: type === 'vacuum' ? vacuumPeakDemand(params, vacuumZoneAreaM2) : 0,
      arm: type === 'arm' ? armPeakDemand(params) : 0,
      loader: type === 'loader' ? loaderPeakDemand(params) : 0,
    },
    energyProfiles: {
      vacuum: energyProfileOf(only('vacuum')),
      arm: energyProfileOf(only('arm')),
      loader: energyProfileOf(only('loader')),
    },
  };
}

export type SimulationInput = ReturnType<typeof buildSimulationInput>;
