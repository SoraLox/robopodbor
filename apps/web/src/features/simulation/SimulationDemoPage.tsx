import { AppShell } from '@/app/AppShell';
// Перенесённый JS-код (allowJs, checkJs выключен) — см. src/upstream/UPSTREAM.md
import { useEconomicsState } from '@/upstream/state/useEconomicsState.js';
import { vacuumPeakDemand, armPeakDemand, loaderPeakDemand } from '@/upstream/domain/warehouseAdapter.js';
import { selectOption } from '@/upstream/domain/objectTypes.js';
import WarehouseScene from '@/upstream/simulation/WarehouseScene.jsx';

const SCENARIO_LABELS: Record<string, string> = {
  baseline: 'Как есть (текущий персонал)',
  purchase: 'Покупка роботов',
  raas: 'RaaS (аренда роботов)',
};

/**
 * Отдельная демо-страница перенесённой 3D-симуляции склада (см.
 * src/upstream/UPSTREAM.md). Использует собственную экономику и параметры
 * upstream-кода — с реальным расчётом «Роподбора» (useCalculation на
 * странице результатов) не связана, это справочный прогон поведения сцены,
 * не относящийся к цифрам конкретного расчёта пользователя.
 */
export function SimulationDemoPage() {
  const economics = useEconomicsState();
  const { params, layout, vacuumZoneAreaM2, activeSolutions, energyProfiles, counts, recommendedCounts, throughputs } =
    economics;

  const slotsPerLane = selectOption('warehouse', 'storageType', params.storageType)?.slotsPerLane ?? 1;

  const demand = {
    vacuum: layout.useVacuum ? vacuumPeakDemand(params, vacuumZoneAreaM2) : 0,
    arm: layout.useArm ? armPeakDemand(params) : 0,
    loader: layout.useLoader ? loaderPeakDemand(params) : 0,
  };

  return (
    <AppShell>
      <div className="px-[18px] pt-8">
        <div className="mx-auto max-w-site">
          <h1 className="text-[18px] font-semibold">3D-симуляция склада (демо)</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Перенесённая сцена из исходного репозитория (см. src/upstream/UPSTREAM.md). Работает на
            собственных демо-параметрах upstream-кода, а не на данных вашего расчёта.
          </p>

          <div className="mt-4">
            <WarehouseScene
              robotTypes={economics.robotTypes}
              floorAreaM2={params.floorAreaM2}
              floorsCount={economics.floors}
              vacuumCount={counts.vacuumCount}
              vacuumProd={throughputs.vacuum}
              armCount={counts.armCount}
              armProd={throughputs.arm / 60}
              loaderCount={counts.loaderCount}
              recommendedVacuumCount={recommendedCounts.vacuumCount}
              recommendedArmCount={recommendedCounts.armCount}
              recommendedLoaderCount={recommendedCounts.loaderCount}
              loaderCapacityKg={activeSolutions.loader?.technical.capacityKg ?? 100}
              loaderSpeedMps={activeSolutions.loader?.technical.speed ?? 2}
              loaderThroughput={throughputs.loader}
              cargoWeightKg={params.cargoWeightKg}
              cargoLengthCm={params.cargoLengthCm}
              cargoWidthCm={params.cargoWidthCm}
              cargoHeightCm={params.cargoHeightCm}
              skuCount={params.skuCount}
              slotsPerLane={slotsPerLane}
              routeLengthM={params.routeLengthM}
              cargoPerHour={params.requiredLoadThroughput}
              outboundPerHour={params.requiredOutboundThroughput}
              truckPayload={params.truckPayloadUnits}
              workZoneShare={economics.workZoneShare}
              demand={demand}
              scenarioLabel={SCENARIO_LABELS[economics.activeScenario] ?? economics.activeScenario}
              energyProfiles={energyProfiles}
              onManualVacuumCountChange={economics.setManualVacuumCount}
              onManualArmCountChange={economics.setManualArmCount}
              onManualLoaderCountChange={economics.setManualLoaderCount}
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default SimulationDemoPage;
