/**
 * Визуализация расчёта — WarehouseSimulation, условная 3D-иллюстрация
 * механики автоматизации (не привязана к цифрам конкретного расчёта).
 *
 * Показывается для любого типа объекта: в текущей версии продукта только
 * один рабочий сценарий расчёта (демо-данные общие для всех object type),
 * отдельных сцен под аэропорт/медучреждение пока нет — ограничивать показ
 * по objectType рано.
 *
 * Интерактивные пропсы (`sceneVariant`, `highlightZone`, ...) прокидываются
 * насквозь из ResultsPage — это отдельная от `layout`/`events` ось
 * управления (сиюминутная реакция на наведение, а не поток данных модели).
 */
import { WarehouseSimulation, type WarehouseSimulationProps } from './WarehouseSimulation';

export interface VisualizationLayout {
  /** Тип объекта, под который строится сцена. */
  objectType: string;
  /** Габариты площадки в метрах. */
  width?: number;
  height?: number;
  /** Зоны площадки: приёмка, хранение, отгрузка и т. п. */
  zones?: Array<{ id: string; label: string; x: number; y: number; w: number; h: number }>;
}

export interface VisualizationEvent {
  /** Момент события от начала прогона, секунды модельного времени. */
  t: number;
  /** Тип события симуляции: перемещение, загрузка, простой. */
  kind: string;
  /** Идентификатор единицы техники. */
  unitId?: string;
  payload?: Record<string, unknown>;
}

export interface VisualizationSlotProps extends WarehouseSimulationProps {
  layout?: VisualizationLayout;
  events?: VisualizationEvent[];
}

export function VisualizationSlot({ layout, events, ...simProps }: VisualizationSlotProps) {
  return (
    <div
      data-testid="visualization-slot"
      data-object-type={layout?.objectType ?? ''}
      data-events={events?.length ?? 0}
      // Без flex/flex-1: сцена сама себя размеряет (h-[520px] lg:h-full) —
      // flex-basis:0 от flex-1 схлопывал её до нуля, когда родитель (aside)
      // не имел собственной высоты, например на мобильном без lg:h-[...].
      className="contents"
    >
      <WarehouseSimulation {...simProps} />
    </div>
  );
}

export default VisualizationSlot;
