import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { calculateEconomics } from '@domain/economics';
import type { CatalogSolution } from '@domain/catalog';
import { useObjectParameters, useSolutions } from '@/api/queries';
import type { FleetGroup, Solution } from '@/api/types';
import { useWizardStore } from '@/app/store';
import {
  SIMULATION_ASSUMPTIONS,
  buildSimulationInput,
  simRobotTypeOf,
  type SimRobotType,
  type SimulationInput,
} from './simulationInput';
import { buildAirportInput, hasAirportScene } from './airportInput';

/** Столько башен СтойкаБокса помещает сцена (upstream loaders/storageCubeFleet.js MAX_TOWERS). */
const MAX_TOWERS = 64;

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
  fleet,
}: {
  /** Аэропорт — своя сцена upstream; остальные объекты — складская. */
  objectType?: string;
  immersive?: boolean;
  /** Сколько роботов заложено в расчёт экономики — сцена стартует с того же числа. */
  planned?: Planned;
  /** Парк склада из расчёта экономики: флоты, число роботов, производительность. */
  fleet?: FleetGroup[];
}) {
  if (objectType === 'airport') return <AirportSimulation immersive={immersive} {...(planned ? { planned } : {})} />;
  return <WarehouseSimulation immersive={immersive} {...(fleet ? { fleet } : {})} />;
}

/** Сцена аэропорта upstream: транспортировка груза и багажа между бортом и депо. */
/**
 * Сцена аэропорта клонирует модели сразу при построении — они должны быть
 * загружены заранее (у upstream их прогревает main.jsx, у нас — здесь).
 */
function useRobotModels(): 'loading' | 'ready' | 'error' {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    let alive = true;
    import('@/upstream/simulation/robots/models.js')
      .then(({ loadRobotModels }) => loadRobotModels())
      .then(() => alive && setState('ready'))
      .catch((error: unknown) => {
        console.error('[simulation] не удалось загрузить 3D-модели', error);
        if (alive) setState('error');
      });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

function AirportSimulation({ immersive, planned }: { immersive: boolean; planned?: Planned }) {
  const models = useRobotModels();
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
  if (models === 'error') return <Note fill={immersive}>Не удалось загрузить 3D-модели сцены.</Note>;
  if (models === 'loading') return <SceneFallback fill={immersive} />;

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

function WarehouseSimulation({ immersive, fleet }: { immersive: boolean; fleet?: FleetGroup[] }) {
  const parameters = useWizardStore((s) => s.parameters);
  const selectedId = useWizardStore((s) => s.solutionId);
  const fleetIds = useWizardStore((s) => s.fleetIds);
  const layout = useWizardStore((s) => s.layout);
  const { data: fields } = useObjectParameters('warehouse');
  const { data: solutions } = useSolutions('warehouse');
  const [webgl] = useState(hasWebGL);

  // Парк — из расчёта. Старые сохранённые расчёты без fleet пересчитываются здесь
  // той же функцией, что и на сервере (@domain/economics).
  const groups = useMemo(() => {
    if (fleet?.length) return fleet;
    if (!fields || !solutions) return null;
    const ids = fleetIds.length ? fleetIds : selectedId ? [selectedId] : [];
    const chosen = ids.map((id) => solutions.find((s) => s.id === id)).filter((s): s is Solution => Boolean(s));
    const set = chosen.length ? chosen : [pickSolution(solutions, null)].filter((s): s is Solution => Boolean(s));
    if (!set.length) return [];
    return (
      calculateEconomics({
        objectType: 'warehouse',
        parameters,
        fields,
        solution: set[0] as unknown as CatalogSolution,
        solutions: set as unknown as CatalogSolution[],
      }).fleet ?? []
    );
  }, [fleet, fields, solutions, fleetIds, selectedId, parameters]);

  const input = useMemo(
    () => (fields && groups?.length ? buildSimulationInput(fields, parameters, groups, layout) : null),
    [fields, parameters, groups, layout],
  );

  if (!fields || !groups) return <Note fill={immersive}>Готовим симуляцию…</Note>;
  if (!input || !input.robotTypes.length) {
    return <Note fill={immersive}>Для выбранных решений 3D-модели в симуляции нет.</Note>;
  }
  if (!webgl) {
    return <Note fill={immersive}>Браузер не поддерживает WebGL — 3D-симуляцию показать нельзя.</Note>;
  }

  return (
    <SimulationScene
      key={`${layout ?? 'default'}:${input.robotTypes.join(',')}:${JSON.stringify(input.params)}:${groups.map((g) => `${g.solutionId}×${g.count}`).join(',')}`}
      input={input}
      immersive={immersive}
    />
  );
}

function SimulationScene({ input, immersive }: { input: SimulationInput; immersive: boolean }) {
  const { params, fleets } = input;
  const [counts, setCounts] = useState<Record<SimRobotType, number>>({
    vacuum: fleets.vacuum?.recommendedCount ?? 0,
    arm: fleets.arm?.recommendedCount ?? 0,
    loader: fleets.loader?.recommendedCount ?? 0,
  });
  const setCount = (kind: SimRobotType) => (value: number) => setCounts((prev) => ({ ...prev, [kind]: value }));
  const label = Object.values(fleets)
    .map((f) => `${f.requiredCount} × ${f.name}`)
    .join(' + ');

  const scene = (
    <Suspense fallback={<SceneFallback fill={immersive} />}>
      <WarehouseScene
        shape={input.shape}
        robotTypes={input.robotTypes}
        vacuumType={fleets.vacuum?.model}
        armType={fleets.arm?.model}
        loaderType={fleets.loader?.model}
        oversizedCargoPct={params.oversizedCargoPct}
        floorAreaM2={params.floorAreaM2}
        floorsCount={1}
        vacuumCount={counts.vacuum}
        vacuumProd={fleets.vacuum?.throughput ?? 0}
        armCount={counts.arm}
        armProd={(fleets.arm?.throughput ?? 0) / 60}
        loaderCount={counts.loader}
        recommendedVacuumCount={fleets.vacuum?.recommendedCount ?? 0}
        recommendedArmCount={fleets.arm?.recommendedCount ?? 0}
        recommendedLoaderCount={fleets.loader?.recommendedCount ?? 0}
        loaderCapacityKg={fleets.loader?.capacityKg ?? 100}
        loaderSpeedMps={fleets.loader?.speedMps ?? 2}
        loaderThroughput={fleets.loader?.throughput ?? 0}
        storageTowers={fleets.loader?.storageTowers}
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
        scenarioLabel={label}
        energyProfiles={input.energyProfiles}
        onManualVacuumCountChange={setCount('vacuum')}
        onManualArmCountChange={setCount('arm')}
        onManualLoaderCountChange={setCount('loader')}
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

/** Какие характеристики роботов взяты у демо-робота и сколько роботов не поместилось в сцену. */
function SubstitutionNote({ input, floating }: { input: SimulationInput; floating?: boolean }) {
  const fleets = Object.values(input.fleets);
  const many = fleets.length > 1;
  const lines = [
    ...fleets
      .filter((f) => f.substitutions.length)
      .map(
        (f) =>
          `${many ? `${f.name}: н` : 'Н'}ет в карточке робота, взято у демо-робота: ${f.substitutions
            .map((item) => `${item.field} — ${item.value}`)
            .join(', ')}.`,
      ),
    ...fleets
      .filter((f) => (f.storageTowers ?? 0) > MAX_TOWERS)
      .map((f) => `Сетка ${f.name}: в сцене ${MAX_TOWERS} башен из ${f.storageTowers!.toLocaleString('ru-RU')} по расчёту ёмкости.`),
    ...fleets
      .filter((f) => f.requiredCount > f.maxCount)
      .map((f) => `${many ? `${f.name}: п` : 'П'}о расчёту нужно ${f.requiredCount}, в сцене помещается ${f.maxCount}.`),
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
