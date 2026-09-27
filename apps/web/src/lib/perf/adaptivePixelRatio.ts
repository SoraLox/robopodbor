/*
  Адаптивное разрешение WebGL-канваса — страховка только для действительно
  слабых машин. Качество по умолчанию максимальное (DPR устройства, но не больше
  maxRatio), как в исходной сцене разработчика; снижается, лишь если сцена
  устойчиво идёт медленнее ~25 fps.

  Решение принимается по окнам из WINDOW_FRAMES подряд отрисованных кадров по
  p90 интервала rAF: он учитывает и CPU, и GPU (кадр не придёт раньше, чем GPU
  закончит предыдущий), в отличие от замера времени вызова render().

  Чтобы не терять качество зря:
  - первые WARMUP_FRAMES кадров не считаются: при открытии страницы грузятся
    модели, шрифты и графики, и кадры медленные у всех;
  - шаг вниз — только после SLOW_WINDOWS медленных окон подряд (~10 с), единичные
    фризы и короткие рывки (поворот камеры, пересборка сцены) его не вызывают;
  - на экранах высокой плотности не ниже 1.5 — при 1 картинка заметно мылится.

  Разрешение только понижается, обратно не растёт: смена DPR пересоздаёт
  drawing buffer, а это фриз до ~1 с на больших канвасах. Контроллер, который
  пробует вернуть качество, качается между двумя ступенями и фризит каждые
  несколько секунд. Сцена создаётся заново при смене решения — там качество
  снова стартует с максимума.
*/

const WINDOW_FRAMES = 90;
const WARMUP_FRAMES = 180;
const SLOW_P90_MS = 40; // медленнее ~25 fps у 10% кадров
const SLOW_WINDOWS = 3;
const STEP = 0.25;

export interface PixelRatioTarget {
  getPixelRatio(): number;
  setPixelRatio(value: number): void;
}

export interface AdaptivePixelRatio {
  /** Вызывать на каждом отрисованном кадре; true — разрешение сменилось. */
  onRenderedFrame(timestamp: number): boolean;
  /** Кадр без отрисовки разрывает серию: интервал до следующего кадра не показателен. */
  onSkippedFrame(): void;
  readonly current: number;
}

export function createAdaptivePixelRatio(
  target: PixelRatioTarget,
  { maxRatio = 2, minRatio = 1.5 }: { maxRatio?: number; minRatio?: number } = {},
): AdaptivePixelRatio {
  const deviceMax = Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1, maxRatio);
  const floor = Math.min(minRatio, deviceMax);
  let ratio = deviceMax;
  target.setPixelRatio(ratio);

  const intervals = new Float64Array(WINDOW_FRAMES);
  let count = 0;
  let last = 0;
  let warmup = WARMUP_FRAMES;
  let slowWindows = 0;

  const p90 = () => {
    const sorted = Array.from(intervals).sort((a, b) => a - b);
    return sorted[Math.floor(WINDOW_FRAMES * 0.9)] ?? 0;
  };

  return {
    get current() {
      return ratio;
    },
    onSkippedFrame() {
      last = 0;
    },
    onRenderedFrame(timestamp) {
      if (warmup > 0) {
        warmup--;
        last = timestamp;
        return false;
      }
      if (last > 0) intervals[count++] = timestamp - last;
      last = timestamp;
      if (count < WINDOW_FRAMES) return false;
      count = 0;

      if (ratio <= floor) return false;
      slowWindows = p90() > SLOW_P90_MS ? slowWindows + 1 : 0;
      if (slowWindows < SLOW_WINDOWS) return false;

      slowWindows = 0;
      ratio = Math.max(floor, ratio - STEP);
      target.setPixelRatio(ratio);
      // Смена буфера сама даёт длинный кадр — он не должен попасть в следующее окно.
      last = 0;
      return true;
    },
  };
}
