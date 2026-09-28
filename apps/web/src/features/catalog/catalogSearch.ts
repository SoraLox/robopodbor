import { CATALOG_CATEGORY_LABEL } from '@domain/catalog';
import type { Solution } from '@/api/types';
import { categorize } from './solutionCategory';

/*
  Поиск по правилам каталога роботов (robots-catalog/README.md): нижний регистр,
  ё → е, без пунктуации и пробелов; латиница находит кириллицу и наоборот —
  «rubi» находит «РУБИ-С-03», «ронави» — «Ronavi H1500», «ак sc80» — «АК-SC80».
*/

const TRANSLIT: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

export function normalizeSearch(text: string): string {
  return text
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function toLatin(text: string): string {
  return [...text].map((char) => TRANSLIT[char] ?? char).join('');
}

function searchTextOf(solution: Solution): string {
  return [
    solution.id,
    solution.name,
    solution.vendor,
    solution.useCase,
    categorize(solution).label,
    solution.catalogCategory
      ? CATALOG_CATEGORY_LABEL[solution.catalogCategory]
      : undefined,
    solution.navigation,
    solution.country,
    ...(solution.limitations ?? []),
  ]
    .filter(Boolean)
    .join(' ');
}

const cache = new WeakMap<Solution, { plain: string; latin: string }>();

function indexOf(solution: Solution) {
  let entry = cache.get(solution);
  if (!entry) {
    // Слова склеиваются через «|», чтобы нормализация не сливала соседние поля в ложное совпадение.
    const words = searchTextOf(solution)
      .split(/\s+/)
      .map(normalizeSearch)
      .filter(Boolean)
      .join('|');
    entry = { plain: words, latin: toLatin(words) };
    cache.set(solution, entry);
  }
  return entry;
}

/** Каждое слово запроса должно найтись в карточке — по-русски, латиницей или транслитом. */
export function matchesSearch(solution: Solution, query: string): boolean {
  const tokens = query.split(/\s+/).map(normalizeSearch).filter(Boolean);
  if (!tokens.length) return true;
  const { plain, latin } = indexOf(solution);
  return tokens.every(
    (token) =>
      plain.includes(token) ||
      latin.includes(token) ||
      latin.includes(toLatin(token)),
  );
}
