/**
 * Паспорт склада + парк из расчёта экономики (CalculationResult.fleet) → входы
 * 3D-симуляции склада (src/upstream, см. UPSTREAM.md).
 *
 * Сколько роботов, какая у них производительность и какой пиковый спрос —
 * считает экономика (apps/api/src/domain/warehouseEconomics.ts); сцена берёт
 * те же числа и только переводит паспорт в геометрию склада. Поэтому «Нужно /
 * Расчёт парка / В симуляции» не спорят друг с другом.
 */
import type { FleetGroup, ParameterField, Solution } from '@/api/types';
import { fleetKindOf, fleetModelOf, leadingNumber, type FleetKind } from '@domain/fleet';
import { OBJECT_TYPES, defaultParamsFor, selectOption } from '@/upstream/domain/objectTypes.js';
import { MAX_VACUUM_COUNT, computeLayout } from '@/upstream/simulation/layout.js';
import { maxSorterCount } from '@/upstream/simulation/sorters/sorterFleet.js';
import { buildDefaultShape } from '@/upstream/simulation/shape/shapeTypes.js';
import { decodeShape, layoutMetrics, rackStorage } from '@/features/objects/layout/warehouseLayout';

/** Форма склада — стандартный прямоугольник upstream: своей формы в паспорте нет. */
export const DEFAULT_SHAPE = buildDefaultShape();

export type SimRobotType = FleetKind;

export const SIMULATION_ASSUMPTIONS = [
  'Тип робота в сцене определяется по типу решения каталога: уборщики — пылесосы (поломоечные — моделью мойщика), манипуляторы и ячейки — роборуки, AMR и тягачи — низкой платформой-транспортировщиком, погрузчики и штабелёры — погрузчиком, системы хранения — сеткой башен с шаттлами, сортировочные системы — петлёй с каретками, конвейеры — линиями от ворот вглубь склада.',
  'Число роботов, их производительность и пиковый спрос сцена берёт из расчёта экономики — тех же чисел, что в отчёте.',
  'Склад в сцене — планировка из шага «Планировка»: нарисованный контур равен площади склада из паспорта; без своей планировки — стандартный прямоугольник с пятью воротами.',
  'Потоки приёмки, отгрузки и отбора переведены из суточных в часовые делением на часы работы (смены × длительность смены); сцена работает на пиковом потоке (× пиковый коэффициент) — так видно, успевает ли парк в самый загруженный час.',
  'Путь погрузчика от ворот до места хранения — средний путь по планировке от ближайших ворот до стеллажа; без своей планировки — половина стороны квадратного склада.',
  'Скорость, грузоподъёмность, производительность, время работы, время зарядки и мощность берутся из карточки робота. Чего в карточке нет — подставляется из демо-робота того же типа, и в расчёте, и в сцене; такие поля перечислены у сцены.',
  'Фура в сцене вмещает не больше 18 паллет (предел модели ворот), реальная еврофура — 33.',
];

export function simRobotTypeOf(solution: Solution): SimRobotType | null {
  return fleetKindOf(solution);
}

/** Ключ 3D-модели upstream (washer, stacker, transporter, storagecube); undefined — модель флота по умолчанию. */
export function simModelOf(solution: Solution, type: SimRobotType): string | undefined {
  return fleetModelOf(solution, type);
}

/** «1 500 кг» → 1500, «1.8 м/с» → 1.8, «—» → null. */
export const parseLeadingNumber = leadingNumber;

/** «1200» мм → см; запасной разбор старого «1200×800×1600». */
function dimensionsCm(values: Record<string, string>): number[] {
  const fromParts = [
    parseLeadingNumber(values.wh_pallet_length),
    parseLeadingNumber(values.wh_pallet_width),
    parseLeadingNumber(values.wh_pallet_height),
  ];
  if (fromParts.every((value): value is number => value !== null)) {
    return fromParts.map((mm) => mm / 10);
  }
  return (values.wh_pallet_dimensions ?? '')
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
  const [lengthCm = 120, widthCm = 80, heightCm = 100] = dimensionsCm(values);
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
    oversizedCargoPct: withinSchema('oversizedCargoPct', num('wh_dolya_negabaritnyh_nestandartnyh_gruzov', 5)),
    cargoWeightKg: num('wh_massa_gruzovoy_edinitsy', 50),
    cargoLengthCm: withinSchema('cargoLengthCm', lengthCm),
    cargoWidthCm: withinSchema('cargoWidthCm', widthCm),
    cargoHeightCm: withinSchema('cargoHeightCm', heightCm),
    truckPayloadUnits: withinSchema('truckPayloadUnits', EURO_TRUCK_PALLETS),
    routeLengthM: withinSchema('routeLengthM', Math.round(Math.sqrt(floorAreaM2) / 2)),
    storageType: STORAGE_OF_RACK[values.wh_rack_type ?? ''] ?? 'block',
  };
}

/** Поле паспорта робота, которое взято у демо-робота, потому что в карточке его нет. */
export interface SimSubstitution {
  field: string;
  value: string;
}

/** Флот сцены: те же числа, что в расчёте, плюс предел сцены. */
export interface SimFleet {
  kind: SimRobotType;
  name: string;
  model: string | undefined;
  /** Сколько роботов в расчёте. */
  requiredCount: number;
  /** Сколько помещается в сцене. */
  maxCount: number;
  /** Стартовое число в сцене: расчётное, но не больше maxCount. */
  recommendedCount: number;
  /** СтойкаБокс: башен в сетке (ёмкость); count — шаттлы. */
  storageTowers: number | undefined;
  /** Эффективная производительность одного робота: м²/ч, строк/ч, паллет/ч. */
  throughput: number;
  capacityKg: number;
  speedMps: number;
  substitutions: FleetGroup['substitutions'];
}

export function buildSimulationInput(
  fields: ParameterField[],
  values: Record<string, string>,
  fleet: FleetGroup[],
  /** Планировка из конструктора; нет — стандартный прямоугольник. */
  layout?: string | null,
) {
  const merged = {
    ...Object.fromEntries(fields.map((field) => [field.id, field.defaultValue ?? ''])),
    ...values,
  };
  const params = toUpstreamParams(merged);
  const custom = decodeShape(layout);
  // Ярусы стеллажей в 3D — те же, что в расчёте ёмкости (потолок / высота паллеты).
  if (custom) (custom as { rackTiers?: number }).rackTiers = rackStorage(custom, merged)?.levels;
  const shape = custom ?? DEFAULT_SHAPE;
  if (custom) {
    // Контур — вся площадь склада: сцена масштабирует по площади всей сетки.
    const metrics = layoutMetrics(custom, params.floorAreaM2);
    params.floorAreaM2 = metrics.sceneAreaM2;
    params.routeLengthM = metrics.routeLengthM;
  }
  const groups = fleet as Array<FleetGroup & { kind: SimRobotType }>;
  const robotTypes = groups.map((group) => group.kind);
  const workZoneShare = params.workZonePct / 100;
  // Масштаб сцены: сетка 100 ед. на сторону = площадь склада (сцены), отсюда метров в единице.
  const metersPerUnit = Math.sqrt(params.floorAreaM2) / 100;
  const toUnits = (m: number) => m / metersPerUnit;
  const footprintOf = (kind: SimRobotType) => groups.find((group) => group.kind === kind)?.footprint;
  const armFp = footprintOf('arm');
  const loaderFp = footprintOf('loader');
  const sorterFp = footprintOf('sorter');
  const conveyorFp = footprintOf('conveyor');
  const robotSizes = {
    aisleUnits: toUnits(1.5),
    ...(armFp ? { arm: { lengthUnits: toUnits(armFp.lengthM), widthUnits: toUnits(armFp.widthM) } } : {}),
    ...(loaderFp ? { loader: { lengthUnits: toUnits(loaderFp.lengthM) } } : {}),
    ...(sorterFp ? { sorter: { lengthUnits: toUnits(sorterFp.lengthM), widthUnits: toUnits(sorterFp.widthM) } } : {}),
    ...(conveyorFp ? { conveyor: { widthUnits: toUnits(Math.max(conveyorFp.widthM, 0.9)) } } : {}),
  };
  const sceneLayout = computeLayout(shape, robotTypes, workZoneShare, robotSizes);
  const maxOf: Record<SimRobotType, number> = {
    vacuum: MAX_VACUUM_COUNT,
    arm: sceneLayout.maxArmCount,
    loader: sceneLayout.maxLoaderCount,
    sorter: sceneLayout.sorterZone ? maxSorterCount(sceneLayout.sorterZone, robotSizes.sorter ?? null) : 1,
    // Линии тянутся от ворот — до трёх на ворота.
    conveyor: Math.max(1, sceneLayout.gates.length * 3),
  };

  const fleets: Partial<Record<SimRobotType, SimFleet>> = {};
  for (const group of groups) {
    // Шаттлы СтойкаБокса ездят по сетке, а не через ворота — предел свой.
    const maxCount = group.model === 'storagecube' ? 16 : maxOf[group.kind];
    fleets[group.kind] = {
      kind: group.kind,
      name: group.name,
      model: group.model,
      requiredCount: group.count,
      maxCount,
      recommendedCount: Math.max(1, Math.min(maxCount, group.count)),
      storageTowers: group.storageTowers,
      throughput: group.throughputPerRobot,
      capacityKg: group.capacityKg ?? 100,
      speedMps: group.speedMps ?? 2,
      substitutions: group.substitutions,
    };
  }
  const demandOf = (kind: SimRobotType) => groups.find((group) => group.kind === kind)?.peakDemand ?? 0;
  const energyOf = (kind: SimRobotType) => {
    const group = groups.find((item) => item.kind === kind);
    return {
      runtimeHours: group?.autonomyHours ?? null,
      chargeHours: group?.chargeHours ?? null,
      workPowerKw: group?.workPowerKw ?? 0,
      idlePowerKw: group?.idlePowerKw ?? 0,
    };
  };

  return {
    shape,
    robotSizes,
    params,
    robotTypes,
    workZoneShare,
    fleets,
    slotsPerLane: selectOption('warehouse', 'storageType', params.storageType)?.slotsPerLane ?? 1,
    demand: {
      vacuum: demandOf('vacuum'),
      arm: demandOf('arm'),
      loader: demandOf('loader'),
      sorter: demandOf('sorter'),
      conveyor: demandOf('conveyor'),
    },
    energyProfiles: {
      vacuum: energyOf('vacuum'),
      arm: energyOf('arm'),
      loader: energyOf('loader'),
      sorter: energyOf('sorter'),
      conveyor: energyOf('conveyor'),
    },
  };
}

export type SimulationInput = ReturnType<typeof buildSimulationInput>;
