import { useMemo, useState } from 'react';
import { useObjectParameters, useSolutions } from '@/api/queries';
import type { Solution } from '@/api/types';
import { useWizardStore } from '@/app/store';
import WarehouseScene from '@/upstream/simulation/WarehouseScene.jsx';
import {
  SIMULATION_ASSUMPTIONS,
  buildSimulationInput,
  simRobotTypeOf,
  type SimulationInput,
} from './simulationInput';

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

function Note({ children }: { children: string }) {
  return (
    <div className="grid min-h-[240px] place-items-center rounded-xl border border-border p-8 text-center text-[13.5px] text-muted-foreground">
      {children}
    </div>
  );
}

export function ResultSimulation({ objectType }: { objectType: string }) {
  const parameters = useWizardStore((s) => s.parameters);
  const selectedId = useWizardStore((s) => s.solutionId);
  const { data: fields } = useObjectParameters(objectType);
  const { data: solutions } = useSolutions(objectType);
  const [webgl] = useState(hasWebGL);

  const solution = solutions ? pickSolution(solutions, selectedId) : null;
  const type = solution ? simRobotTypeOf(solution) : null;

  const input = useMemo(
    () => (fields && solution && type ? buildSimulationInput(fields, parameters, solution, type) : null),
    [fields, parameters, solution, type],
  );

  if (objectType !== 'warehouse') return <Note>3D-симуляция пока есть только для склада.</Note>;
  if (!fields || !solutions) return <Note>Готовим симуляцию…</Note>;
  if (!solution) return <Note>Не найдено решение для симуляции.</Note>;
  if (!input) return <Note>{`Для «${solution.name}» 3D-модели в симуляции нет.`}</Note>;
  if (!webgl) return <Note>Браузер не поддерживает WebGL — 3D-симуляцию показать нельзя.</Note>;

  return <SimulationScene key={`${solution.id}:${JSON.stringify(input.params)}`} input={input} solution={solution} />;
}

function SimulationScene({ input, solution }: { input: SimulationInput; solution: Solution }) {
  const [count, setCount] = useState(input.recommendedCount);
  const { params } = input;
  const counts = {
    vacuum: input.type === 'vacuum' ? count : 0,
    arm: input.type === 'arm' ? count : 0,
    loader: input.type === 'loader' ? count : 0,
  };

  return (
    <div className="grid gap-3">
      <WarehouseScene
        robotTypes={input.robotTypes}
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
      />

      <details className="rounded-xl border border-border p-4 text-[12.5px] text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">
          Как параметры расчёта перенесены в симуляцию
        </summary>
        {input.requiredCount > input.maxCount ? (
          <p className="mt-2">
            {`По расчёту нужно ${input.requiredCount} роботов, в сцене помещается не больше ${input.maxCount}.`}
          </p>
        ) : null}
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {SIMULATION_ASSUMPTIONS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
