import createClient from 'openapi-fetch';
import type { paths } from './schema';

/**
 * Базовый URL держим абсолютным: fetch в Node (vitest + jsdom) не умеет
 * разрешать относительный '/api' сам, в отличие от браузерного.
 */
const origin =
  typeof globalThis.location === 'undefined'
    ? 'http://localhost'
    : globalThis.location.origin;

/**
 * Типизированный клиент; запросы перехватывает MSW в dev и в тестах.
 *
 * fetch берём лениво через globalThis: MSW подменяет глобальный fetch уже
 * после импорта модулей, а openapi-fetch иначе запомнил бы исходную ссылку
 * и мимо моков ушёл бы реальный сетевой запрос.
 */
export const api = createClient<paths>({
  baseUrl: `${origin}/api`,
  // Сессия живёт в httpOnly-cookie: без include её не отправит браузер,
  // а читать её из JS нельзя и не нужно.
  credentials: 'include',
  fetch: (request) => globalThis.fetch(request),
});
