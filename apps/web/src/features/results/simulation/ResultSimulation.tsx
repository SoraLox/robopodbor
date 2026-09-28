import { Suspense, lazy, useMemo, useState } from 'react';
import { useObjectParameters, useSolutions } from '@/api/queries';
import type { Solution } from '@/api/types';
import { useWizardStore } from '@/app/store';
import {
  DEFAULT_SHAPE,
  SIMULATION_ASSUMPTIONS,
  buildSimulationInput,
  simRobotTypeOf,
  type SimulationInput,
} from './simulationInput';
import { buildAirportInput, hasAirportScene } from './airportInput';

// three.js (~300 КБ gzip) грузится отдельным чанком: KPI и графики отчёта
// показываются сразу, сцена догружается следом.
const WarehouseScene = lazy(() => import('@/upstream/simulation/WarehouseScene.jsx'));
const AirportScene = lazy(() => import('@/upstream/simulation/AirportScene.jsx'));

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Выбранный в мастере робот; без выбора (отчёт открыт напрямую) — лучший по баллу из тех, что есть в сцене. */
function pickSolution(solutions: Solution[], selectedId: string | null): Solution | null {
  if (selectedId) return solutions.find((s) => s.id === selectedId) ?? null;
  return (
    [...solutions]
      .filter((s) => simRobotTypeOf(s) !== null)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0] ?? null
  );
}

function Note({ children, fill }: { children: string; fill?: boolean }) {
  return (
    <div
      className={
        fill
          ? 'grid h-full min-h-[240px] place-items-center bg-[#F3F8FD] p-8 text-center text-[13.5px] text-[#3A4A5C]'
          : 'grid min-h-[240px] place-items-center rounded-xl border border-border p-8 text-center text-[13.5px] text-muted-foreground'
      }
    >
      {children}
    </div>
  );
}

function SceneFallback({ fill }: { fill?: boolean }) {
  return (
    <div
      className={
        fill
          ? 'grid h-full place-items-center bg-[#F3F8FD] text-[13.5px] text-[#3A4A5C]'
          : 'grid min-h-[320px] place-items-center rounded-2xl border border-border text-[13.5px] text-muted-foreground'
      }
    >
      Загружаем 3D-сцену…
    </div>
  );
}

type Planned = { solutionId: string; count: number };

export function ResultSimulation({
  objectType = 'warehouse',
  immersive = false,
  planned,
}: {
  /** Аэропорт — своя сцена upstream; остальные объекты — складская. */
  objectType?: string;
  immersive?: boolean;
  /** Сколько роботов заложено в расчёт экономики — сцена стартует с того же числа. */
  planned?: Planned;
}) {
  if (objectType === 'airport') return <AirportSimulation immersive={immersive} {...(planned ? { planned } : {})} />;
  return <WarehouseSimulation immersive={immersive} {...(planned ? { planned } : {})} />;
}

/** Сцена аэропорта upstream: транспортировка груза и багажа между бортом и депо. */
function AirportSimulation({ immersive, planned }: { immersive: boolean; planned?: Planned }) {
  const parameters = useWizardStore((s) => s.parameters);
  const selectedId = useWizardStore((s) => s.solutionId);
  const { data: fields } = useObjectParameters('airport');
  const { data: solutions } = useSolutions('airport');
  const [webgl] = useState(hasWebGL);

  const solution = solutions
    ? selectedId
      ? solutions.find((s) => s.id === selectedId) ?? null
      : [...solutions].filter(hasAirportScene).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0] ?? null
    : null;
  const input = useMemo(
    () => (fields && solution && hasAirportScene(solution) ? buildAirportInput(fields, parameters, solution, planned) : null),
    [fields, parameters, solution, planned],
  );

  if (!fields || !solutions) return <Note fill={immersive}>Готовим симуляцию…</Note>;
  if (!solution) return <Note fill={immersive}>Не найдено решение для симуляции.</Note>;
  if (!input) {
    return (
      <Note fill={immersive}>
        {`3D-сцена аэропорта показывает транспортировку груза и багажа. Для «${solution.name}» такой сцены нет.`}
      </Note>
    );
  }
  if (!webgl) return <Note fill={immersive}>Браузер не поддерживает WebGL — 3D-симуляцию показать нельзя.</Note>;

  const note = input.substitutions.length
    ? `Нет в карточке робота, взято у демо-робота: ${input.substitutions.map((item) => `${item.field} — ${item.value}`).join(', ')}.`
    : null;

  return (
    <div className={immersive ? 'relative h-full w-full' : 'grid gap-3'}>
      <Suspense fallback={<SceneFallback fill={immersive} />}>
        <AirportScene
          key={`${solution.id}:${input.gatesCount}:${input.transportCount}`}
          gatesCount={input.gatesCount}
          transportCount={input.transportCount}
          transportThroughput={input.transportThroughput}
          groundOpsPerFlight={input.groundOpsPerFlight}
          demand={input.demand}
          scenarioLabel={`${solution.name} · ${solution.vendor}`}
          immersive={immersive}
        />
      </Suspense>
      {note ? (
        <p
          className={
            immersive
              ? 'pointer-events-none absolute right-3 top-3 z-10 max-w-[320px] rounded-[10px] border border-[#E5E5EA] bg-white/90 px-2.5 py-1.5 text-[11.5px] leading-snug text-[#3A4A5C]'
              : 'text-[12.5px] text-muted-foreground'
          }
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}

function WarehouseSimulation({ immersive, planned }: { immersive: boolean; planned?: Planned }) {
  const parameters = useWizardStore((s) => s.parameters);
  const selectedId = useWizardStore((s) => s.solutionId);
  // Сцена upstream пока только складская; для аэропорта/клиники берём складской
  // каталог и параметры — экономика демо общая, отдельной 3D-модели объекта нет.
  const { data: fields } = useObjectParameters('warehouse');
  const { data: solutions } = useSolutions('warehouse');
  const [webgl] = useState(hasWebGL);

  const solution = solutions ? pickSolution(solutions, selectedId) : null;
  const type = solution ? simRobotTypeOf(solution) : null;

  const input = useMemo(() => {
    if (!fields || !solution || !type) return null;
    const built = buildSimulationInput(fields, parameters, solution, type);
    // Экономика и сцена должны показывать один и тот же парк, иначе цифры спорят друг с другом.
    if (planned && planned.solutionId === solution.id) {
      return {
        ...built,
        requiredCount: planned.count,
        recommendedCount: Math.max(1, Math.min(built.maxCount, planned.count)),
      };
    }
    return built;
  }, [fields, parameters, solution, type, planned]);

  if (!fields || !solutions) return <Note fill={immersive}>Готовим симуляцию…</Note>;
  if (!solution) return <Note fill={immersive}>Не найдено решение для симуляции.</Note>;
  if (!input) return <Note fill={immersive}>{`Для «${solution.name}» 3D-модели в симуляции нет.`}</Note>;
  if (!webgl) {
    return <Note fill={immersive}>Браузер не поддерживает WebGL — 3D-симуляцию показать нельзя.</Note>;
  }

  return (
    <SimulationScene
      key={`${solution.id}:${JSON.stringify(input.params)}`}
      input={input}
      solution={solution}
      immersive={immersive}
    />
  );
}

function SimulationScene({
  input,
  solution,
  immersive,
}: {
  input: SimulationInput;
  solution: Solution;
  immersive: boolean;
}) {
  const [count, setCount] = useState(input.recommendedCount);
  const { params } = input;
  const counts = {
    vacuum: input.type === 'vacuum' ? count : 0,
    arm: input.type === 'arm' ? count : 0,
    loader: input.type === 'loader' ? count : 0,
  };

  const scene = (
    <Suspense fallback={<SceneFallback fill={immersive} />}>
      <WarehouseScene
        shape={DEFAULT_SHAPE}
        robotTypes={input.robotTypes}
        vacuumType={input.type === 'vacuum' ? input.model : undefined}
        armType={input.type === 'arm' ? input.model : undefined}
        loaderType={input.type === 'loader' ? input.model : undefined}
        oversizedCargoPct={params.oversizedCargoPct}
        floorAreaM2={params.floorAreaM2}
        floorsCount={1}
        vacuumCount={counts.vacuum}
        vacuumProd={input.type === 'vacuum' ? input.throughput : 0}
        armCount={counts.arm}
        armProd={input.type === 'arm' ? input.throughput / 60 : 0}
        loaderCount={counts.loader}
        recommendedVacuumCount={input.recommendedCount}
        recommendedArmCount={input.recommendedCount}
        recommendedLoaderCount={input.recommendedCount}
        loaderCapacityKg={input.capacityKg}
        loaderSpeedMps={input.speedMps}
        loaderThroughput={input.type === 'loader' ? input.throughput : 0}
        cargoWeightKg={params.cargoWeightKg}
        cargoLengthCm={params.cargoLengthCm}
        cargoWidthCm={params.cargoWidthCm}
        cargoHeightCm={params.cargoHeightCm}
        skuCount={params.skuCount}
        slotsPerLane={input.slotsPerLane}
        routeLengthM={params.routeLengthM}
        cargoPerHour={params.requiredLoadThroughput}
        outboundPerHour={params.requiredOutboundThroughput}
        truckPayload={params.truckPayloadUnits}
        workZoneShare={input.workZoneShare}
        demand={input.demand}
        scenarioLabel={`${solution.name} · ${solution.vendor}`}
        energyProfiles={input.energyProfiles}
        onManualVacuumCountChange={setCount}
        onManualArmCountChange={setCount}
        onManualLoaderCountChange={setCount}
        immersive={immersive}
      />
    </Suspense>
  );

  if (immersive) {
    return (
      <div className="relative h-full w-full">
        {scene}
        <SubstitutionNote input={input} floating />
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {scene}
      <details className="rounded-xl border border-border p-4 text-[12.5px] text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">
          Как параметры расчёта перенесены в симуляцию
        </summary>
        {input.requiredCount > input.maxCount ? (
          <p className="mt-2">
            {`По расчёту нужно ${input.requiredCount} роботов, в сцене помещается не больше ${input.maxCount}.`}
          </p>
        ) : null}
        <SubstitutionNote input={input} />
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {SIMULATION_ASSUMPTIONS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/** Какие характеристики робота сцена взяла из демо-каталога и сколько роботов не поместилось. */
function SubstitutionNote({ input, floating }: { input: SimulationInput; floating?: boolean }) {
  const lines = [
    ...(input.substitutions.length
      ? [
          `Нет в карточке робота, взято у демо-робота: ${input.substitutions
            .map((item) => `${item.field} — ${item.value}`)
            .join(', ')}.`,
        ]
      : []),
    ...(floating && input.requiredCount > input.maxCount
      ? [`По расчёту нужно ${input.requiredCount} роботов, в сцене помещается ${input.maxCount}.`]
      : []),
  ];
  if (!lines.length) return null;
  if (!floating) return <p className="mt-2 text-foreground">{lines.join(' ')}</p>;
  return (
    <div className="pointer-events-none absolute right-3 top-3 z-10 grid max-w-[320px] gap-1 rounded-[10px] border border-[#E5E5EA] bg-white/90 px-2.5 py-1.5 text-[11.5px] leading-snug text-[#3A4A5C]">
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}
