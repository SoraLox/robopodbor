/**
 * Паспорт аэропорта + выбранное решение → входы 3D-сцены аэропорта upstream
 * (AirportScene: посадка бортов, гейты, транспортировщики между бортом и депо).
 *
 * Сцена upstream показывает один процесс — транспортировку грузов и багажа,
 * поэтому подходит только для транспортных роботов процессов багажа, перрона
 * и грузового терминала.
 */
import type { ParameterField, Solution } from '@/api/types';
import { CATALOG } from '@/upstream/domain/catalog.js';
import { computeRobotCounts, transportPeakDemand } from '@/upstream/domain/airportAdapter.js';
import { defaultParamsFor } from '@/upstream/domain/objectTypes.js';
import { parseLeadingNumber, type SimSubstitution } from './simulationInput';

const TRANSPORT_PROCESSES = new Set(['baggage', 'ramp', 'cargo']);
const TRANSPORT_TYPES = new Set(['amr', 'fmr', 'tug', 'stacker', 'vehicle', 'platform']);

export const AIRPORT_ASSUMPTIONS = [
  'Сцена аэропорта показывает транспортировку груза и багажа между бортом и депо: уборки, инспекции и обслуживания пассажиров в ней нет.',
  'Потребность — пиковые рейсы в час × операций наземного обслуживания на рейс (из паспорта аэропорта).',
  'Сцена показывает не больше 10 гейтов и 16 транспортировщиков; расчёт ведётся по полному числу.',
];

/** Есть ли для решения сцена аэропорта: транспортный робот процесса багажа, перрона или грузов. */
export function hasAirportScene(solution: Solution): boolean {
  if (!TRANSPORT_TYPES.has(solution.solutionType ?? '')) return false;
  return (solution.processes ?? []).some((process) => TRANSPORT_PROCESSES.has(process));
}

export function buildAirportInput(
  fields: ParameterField[],
  values: Record<string, string>,
  solution: Solution,
  planned?: { solutionId: string; count: number },
) {
  const merged: Record<string, string> = {
    ...Object.fromEntries(fields.map((field) => [field.id, field.defaultValue ?? ''])),
    ...Object.fromEntries(Object.entries(values).filter(([, value]) => value?.trim())),
  };
  const num = (key: string, fallback: number) => parseLeadingNumber(merged[key]) ?? fallback;

  const params = {
    ...defaultParamsFor('airport'),
    gatesCount: num('ap_kolichestvo_vyhodov_posadku', 20),
    peakFlightsPerHour: num('ap_pikovoe_kolichestvo_reysov_chas', 32),
    groundOpsPerFlight: num('ap_kolichestvo_operatsiy_nazemnogo_obsluzhivaniya_1', 18),
  };

  const substitutions: SimSubstitution[] = [];
  const demo = CATALOG.find((item) => item.identification.type === 'transporter')!;
  const ownRate = solution.throughput && /\/ч/.test(solution.throughputUnit ?? '') ? solution.throughput : null;
  const throughput = ownRate ?? demo.technical.throughput;
  if (ownRate === null) {
    substitutions.push({ field: 'производительность', value: `${demo.technical.throughput} ${demo.technical.throughputUnit}` });
  }

  const counted = computeRobotCounts({ params, transportSolution: { technical: { throughput } } }).transportCount;
  const transportCount = planned && planned.solutionId === solution.id ? planned.count : counted;

  return {
    gatesCount: params.gatesCount,
    groundOpsPerFlight: params.groundOpsPerFlight,
    transportCount: Math.max(1, transportCount),
    transportThroughput: throughput,
    demand: { transport: transportPeakDemand(params) },
    substitutions,
  };
}

export type AirportInput = ReturnType<typeof buildAirportInput>;
