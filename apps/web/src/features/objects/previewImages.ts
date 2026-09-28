import type { Solution } from '@/api/types';

/**
 * Превью фото робота из каталога (scripts/build-robot-previews.sh) — первое из его фото.
 * Кадры до 800 px шириной: полноразмерные исходники декодируются заметно дольше.
 * Нет фото — undefined: в карточке показываем плейсхолдер категории.
 */
export function robotPhoto(solution: Solution): string | undefined {
  const file = solution.photos?.[0];
  if (!file) return undefined;
  return `${import.meta.env.BASE_URL}robots_photo/preview/${file.replace(/\.[^.]+$/, '')}.webp`;
}

const decoded = new Set<string>();

/**
 * Декодирует фото заранее. Иначе первое открытие карточки ждёт
 * декодирования в кадре выезда — фриз на сотни мс на слабых машинах.
 */
export function predecodePreviewImages(solutions: Solution[]) {
  for (const src of new Set(solutions.map(robotPhoto))) {
    if (!src || decoded.has(src)) continue;
    decoded.add(src);
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
    img.decode?.().catch(() => decoded.delete(src));
  }
}
