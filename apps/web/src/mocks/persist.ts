/**
 * Состояние мок-бэкенда в localStorage.
 *
 * На GitHub Pages сервера нет — «база» живёт в браузере. Без этого после F5
 * пропадали зарегистрированные аккаунты, проекты и расчёты, а cookie сессии
 * оставалась: пользователь видел себя разлогиненным. В тестах не сохраняем —
 * каждый тест начинает с чистого состояния.
 */
const PREFIX = 'msw:';
const enabled = import.meta.env.MODE !== 'test' && typeof localStorage !== 'undefined';

export function loadMap<V>(key: string, seed: Iterable<readonly [string, V]> = []): Map<string, V> {
  if (enabled) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw) return new Map(Object.entries(JSON.parse(raw) as Record<string, V>));
    } catch {
      // Битая запись или запрет доступа — начинаем с исходных данных.
    }
  }
  return new Map(seed);
}

export function saveMap<V>(key: string, map: Map<string, V>) {
  if (!enabled) return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(Object.fromEntries(map)));
  } catch {
    // Приватный режим или переполнение — состояние просто не переживёт F5.
  }
}
