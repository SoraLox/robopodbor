import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from '@/mocks/server';

// findBy/waitFor по умолчанию ждут 1 с: под нагрузкой ответ мока и рендер мастера
// не успевали, и тест падал, хотя интерфейс работал. 3 с — с тем же запасом, что testTimeout.
configure({ asyncUtilTimeout: 3000 });

// Recharts ResponsiveContainer требует ResizeObserver, которого нет в jsdom.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// Скролл-анимации на лендинге используют IntersectionObserver, которого нет в jsdom.
class IntersectionObserverStub {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: ReadonlyArray<number> = [];
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

globalThis.IntersectionObserver ??=
  IntersectionObserverStub as unknown as typeof IntersectionObserver;

// jsdom не реализует matchMedia (используется для prefers-reduced-motion и т.п.).
// Анимации jsdom не проигрывает: transitionend не приходит, и мастер ждал бы
// страховочные таймеры (до ~1,5 с на шаг). Поэтому тесты идут путём без анимаций,
// который интерфейс и так поддерживает для prefers-reduced-motion.
window.matchMedia ??= (query: string) =>
  ({
    matches: query.includes('prefers-reduced-motion: reduce'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
