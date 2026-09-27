import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdaptivePixelRatio } from '@/lib/perf/adaptivePixelRatio';

const target = () => {
  let value = 0;
  return {
    getPixelRatio: () => value,
    setPixelRatio: vi.fn((next: number) => {
      value = next;
    }),
  };
};

// Одно окно контроллера — 90 отрисованных кадров с заданным интервалом.
const feed = (quality: ReturnType<typeof createAdaptivePixelRatio>, intervalMs: number, frames = 91) => {
  let ts = 1000;
  for (let i = 0; i < frames; i++) {
    ts += intervalMs;
    quality.onRenderedFrame(ts);
  }
  quality.onSkippedFrame();
};

const warmUp = (quality: ReturnType<typeof createAdaptivePixelRatio>) => feed(quality, 16.7, 180);

describe('adaptivePixelRatio', () => {
  beforeEach(() => vi.stubGlobal('devicePixelRatio', 2));
  afterEach(() => vi.unstubAllGlobals());

  it('стартует с DPR устройства, ограниченного maxRatio', () => {
    const t = target();
    const quality = createAdaptivePixelRatio(t, { maxRatio: 1.5 });
    expect(quality.current).toBe(1.5);
    expect(t.getPixelRatio()).toBe(1.5);
  });

  it('первые кадры после открытия не снижают качество', () => {
    const quality = createAdaptivePixelRatio(target());
    // 180 кадров прогрева — медленные, как при загрузке страницы
    feed(quality, 80, 180);
    for (let i = 0; i < 2; i++) feed(quality, 16.7);
    expect(quality.current).toBe(2);
  });

  it('снижает разрешение только при устойчиво медленных кадрах и не ниже 1.5', () => {
    const quality = createAdaptivePixelRatio(target());
    warmUp(quality);
    feed(quality, 50);
    feed(quality, 50);
    expect(quality.current).toBe(2);
    feed(quality, 50);
    expect(quality.current).toBe(1.75);
    for (let i = 0; i < 20; i++) feed(quality, 50);
    expect(quality.current).toBe(1.5);
  });

  it('30 fps — не повод терять качество', () => {
    const quality = createAdaptivePixelRatio(target());
    warmUp(quality);
    for (let i = 0; i < 10; i++) feed(quality, 33);
    expect(quality.current).toBe(2);
  });

  it('быстрое окно сбрасывает серию медленных', () => {
    const quality = createAdaptivePixelRatio(target());
    warmUp(quality);
    for (let i = 0; i < 5; i++) {
      feed(quality, 50);
      feed(quality, 50);
      feed(quality, 16.7);
    }
    expect(quality.current).toBe(2);
  });

  it('не трогает разрешение, пока кадры укладываются в бюджет', () => {
    const t = target();
    const quality = createAdaptivePixelRatio(t);
    warmUp(quality);
    for (let i = 0; i < 10; i++) feed(quality, 16.7);
    expect(quality.current).toBe(2);
    expect(t.setPixelRatio).toHaveBeenCalledTimes(1);
  });

  it('единичный фриз не снижает качество', () => {
    const quality = createAdaptivePixelRatio(target());
    warmUp(quality);
    for (let w = 0; w < 5; w++) {
      let ts = 1000;
      for (let i = 0; i < 91; i++) {
        ts += i === 40 ? 900 : 16.7;
        quality.onRenderedFrame(ts);
      }
      quality.onSkippedFrame();
    }
    expect(quality.current).toBe(2);
  });
});
