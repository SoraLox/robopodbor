import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/*
  Шкала шрифта в tailwind.config.ts — ролевая (text-display…text-micro), а не
  размерная (text-sm/text-lg). Стандартный tailwind-merge таких ключей не знает
  и относит их к группе цвета текста: в связке cn('text-primary-foreground',
  'text-body') он выбрасывал цвет как «переопределённый размером». Из-за этого
  любая кнопка с size="lg"/"sm" теряла белый текст и рисовалась чёрным по
  чёрному. Объявляем роли явно как группу font-size.
*/
const FONT_SIZE_ROLES = [
  'display',
  'h1',
  'h2',
  'h3',
  'body-lg',
  'body',
  'control',
  'label',
  'meta',
  'micro',
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [...FONT_SIZE_ROLES] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Форматирует число в русской локали с фиксированной точностью. */
export function fmt(value: number, digits = 1): string {
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
