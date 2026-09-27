/*
  Покадровый профилировщик анимаций: сколько миллисекунд кадра уходит на логику
  (step), на отрисовку (render) и какой получается реальный интервал между кадрами.

  Включается ?perf=1 в адресе или localStorage.perf = '1'. Выключенный профилировщик
  ничего не пишет и не выделяет память — вызовы можно оставлять в горячем цикле.
  Снимок доступен из консоли: window.__perf.<имя>.snapshot().
*/

const BUFFER_SIZE = 600; // ~10 секунд при 60 fps
const FRAME_BUDGET_MS = 1000 / 60;

export type FrameMetric = 'interval' | 'step' | 'render' | 'total';

export interface MetricSummary {
  avg: number;
  p50: number;
  p95: number;
  max: number;
}

export interface FrameSnapshot {
  name: string;
  frames: number;
  /** Кадров в секунду по реальным интервалам rAF. */
  fps: number;
  /** Кадры, где работа (step + render) не уложилась в 16.7 мс. */
  overBudget: number;
  /** Интервалы > 50 мс — пользователь видит рывок. */
  longFrames: number;
  /** Кадры, в которые рендер был пропущен (сцена вне экрана или в покое). */
  skippedRenders: number;
  metrics: Record<FrameMetric, MetricSummary>;
  extra?: Record<string, unknown>;
}

export interface FrameProfiler {
  readonly enabled: boolean;
  /** Начало кадра: timestamp из requestAnimationFrame. */
  frameStart(timestamp: number): void;
  /** Замер одного участка кадра. */
  time<T>(metric: 'step' | 'render', fn: () => T): T;
  /** Кадр, в котором рендер сознательно пропущен. */
  skipRender(): void;
  frameEnd(): void;
  snapshot(): FrameSnapshot;
  reset(): void;
}

function isPerfEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).has('perf') || window.localStorage.getItem('perf') === '1';
  } catch {
    return false;
  }
}

function summarize(values: Float64Array, count: number): MetricSummary {
  if (count === 0) return { avg: 0, p50: 0, p95: 0, max: 0 };
  const sorted = Array.from(values.subarray(0, count)).sort((a, b) => a - b);
  const pick = (q: number) => sorted[Math.min(count - 1, Math.floor(q * count))] ?? 0;
  const round = (v: number) => Math.round(v * 100) / 100;
  return {
    avg: round(sorted.reduce((sum, v) => sum + v, 0) / count),
    p50: round(pick(0.5)),
    p95: round(pick(0.95)),
    max: round(sorted[count - 1] ?? 0),
  };
}

const NOOP: FrameProfiler = {
  enabled: false,
  frameStart() {},
  time: (_metric, fn) => fn(),
  skipRender() {},
  frameEnd() {},
  snapshot: () => ({
    name: 'disabled',
    frames: 0,
    fps: 0,
    overBudget: 0,
    longFrames: 0,
    skippedRenders: 0,
    metrics: {
      interval: { avg: 0, p50: 0, p95: 0, max: 0 },
      step: { avg: 0, p50: 0, p95: 0, max: 0 },
      render: { avg: 0, p50: 0, p95: 0, max: 0 },
      total: { avg: 0, p50: 0, p95: 0, max: 0 },
    },
  }),
  reset() {},
};

declare global {
  interface Window {
    __perf?: Record<string, FrameProfiler>;
    __perfHooks?: Record<string, unknown>;
  }
}

/** Даёт бенчмарку доступ к состоянию (например, стору мастера) — только в perf-режиме. */
export function exposeForPerf(name: string, value: unknown) {
  if (!isPerfEnabled()) return;
  window.__perfHooks = { ...window.__perfHooks, [name]: value };
}

/**
 * @param extra — дополнительные показатели в снимок (например, renderer.info у three.js).
 */
export function createFrameProfiler(name: string, extra?: () => Record<string, unknown>): FrameProfiler {
  if (!isPerfEnabled()) return NOOP;

  const buffers: Record<FrameMetric, Float64Array> = {
    interval: new Float64Array(BUFFER_SIZE),
    step: new Float64Array(BUFFER_SIZE),
    render: new Float64Array(BUFFER_SIZE),
    total: new Float64Array(BUFFER_SIZE),
  };
  let cursor = 0;
  let filled = 0;
  let lastTimestamp = 0;
  let current = { interval: 0, step: 0, render: 0 };
  let skippedRenders = 0;

  const profiler: FrameProfiler = {
    enabled: true,
    frameStart(timestamp) {
      current = { interval: lastTimestamp ? timestamp - lastTimestamp : 0, step: 0, render: 0 };
      lastTimestamp = timestamp;
    },
    time(metric, fn) {
      const startedAt = performance.now();
      const result = fn();
      current[metric] += performance.now() - startedAt;
      return result;
    },
    skipRender() {
      skippedRenders++;
    },
    frameEnd() {
      buffers.interval[cursor] = current.interval;
      buffers.step[cursor] = current.step;
      buffers.render[cursor] = current.render;
      buffers.total[cursor] = current.step + current.render;
      cursor = (cursor + 1) % BUFFER_SIZE;
      filled = Math.min(filled + 1, BUFFER_SIZE);
    },
    snapshot() {
      let overBudget = 0;
      let longFrames = 0;
      for (let i = 0; i < filled; i++) {
        if ((buffers.total[i] ?? 0) > FRAME_BUDGET_MS) overBudget++;
        if ((buffers.interval[i] ?? 0) > 50) longFrames++;
      }
      const interval = summarize(buffers.interval, filled);
      return {
        name,
        frames: filled,
        fps: interval.avg > 0 ? Math.round(1000 / interval.avg) : 0,
        overBudget,
        longFrames,
        skippedRenders,
        metrics: {
          interval,
          step: summarize(buffers.step, filled),
          render: summarize(buffers.render, filled),
          total: summarize(buffers.total, filled),
        },
        extra: extra?.(),
      };
    },
    reset() {
      cursor = 0;
      filled = 0;
      lastTimestamp = 0;
      skippedRenders = 0;
    },
  };

  window.__perf = { ...window.__perf, [name]: profiler };
  return profiler;
}
