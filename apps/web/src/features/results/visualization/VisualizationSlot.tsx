/**
 * Заглушка под визуализацию расчёта.
 *
 * Содержимое заполняет отдельный поток. Фронт держит место в сетке и
 * прокидывает контракт: раскладку и поток событий симуляции.
 */
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

export interface VisualizationSlotProps {
  layout?: VisualizationLayout;
  events?: VisualizationEvent[];
}

export function VisualizationSlot({ layout, events }: VisualizationSlotProps) {
  return (
    <div
      data-testid="visualization-slot"
      data-object-type={layout?.objectType ?? ''}
      data-events={events?.length ?? 0}
      className="flex min-h-[160px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-canvas px-5 py-8 text-center"
    >
      <span className="text-[12px] font-medium text-muted-foreground">
        Визуализация прогона
      </span>
      <span className="text-[11px] text-meta-foreground">
        {layout
          ? `Раскладка получена · событий в потоке: ${events?.length ?? 0}`
          : 'Слот подключается отдельным потоком'}
      </span>
    </div>
  );
}

export default VisualizationSlot;
