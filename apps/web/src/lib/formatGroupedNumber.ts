/** Узкий неразрывный пробел — разделитель тысяч по типографике. */
const THIN_SPACE = '\u202f';

const GROUPING = /[\s\u00a0\u202f]/g;

/** Сколько цифр стоит до позиции caret в строке (пробелы и знак не считаем). */
function digitsBefore(value: string, caret: number): number {
  let count = 0;
  const end = Math.max(0, Math.min(caret, value.length));
  for (let i = 0; i < end; i += 1) {
    if (/\d/.test(value[i]!)) count += 1;
  }
  return count;
}

/** Позиция caret после N-й цифры; если цифр меньше — в конец (с учётом хвоста «,»). */
function caretAfterDigits(value: string, digitCount: number): number {
  if (digitCount <= 0) {
    return value.startsWith('-') ? 1 : 0;
  }
  let seen = 0;
  for (let i = 0; i < value.length; i += 1) {
    if (/\d/.test(value[i]!)) {
      seen += 1;
      if (seen >= digitCount) return i + 1;
    }
  }
  return value.length;
}

/**
 * Формат числа для ввода: пробелы только в целой части.
 * «10000» → «10 000», «10000,5» / «10000.5» → «10 000,5».
 * Дробная часть не группируется.
 */
export function formatGroupedNumber(input: string): string {
  let raw = input.replace(GROUPING, '');
  if (!raw) return '';

  const neg = raw.startsWith('-');
  if (neg) raw = raw.slice(1);

  // Оставляем цифры и один десятичный разделитель (первая «,» или «.»).
  let intDigits = '';
  let fracDigits = '';
  let hasSep = false;
  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') {
      if (hasSep) fracDigits += ch;
      else intDigits += ch;
      continue;
    }
    if ((ch === ',' || ch === '.') && !hasSep) {
      hasSep = true;
    }
  }

  const groupedInt = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, THIN_SPACE);
  const body = hasSep ? `${groupedInt},${fracDigits}` : groupedInt;
  return neg ? `-${body}` : body;
}

/**
 * Канон для хранения/API: без пробелов, десятичный знак — точка.
 * «10 000,5» → «10000.5»
 */
export function normalizeGroupedNumber(input: string): string {
  const formatted = formatGroupedNumber(input);
  if (!formatted) return '';
  return formatted.replace(GROUPING, '').replace(',', '.');
}

/** Форматирует и возвращает новую позицию caret (по числу цифр слева). */
export function formatGroupedNumberAtCaret(
  input: string,
  caret: number,
): { value: string; caret: number } {
  const digitCount = digitsBefore(input, caret);
  const value = formatGroupedNumber(input);
  return { value, caret: caretAfterDigits(value, digitCount) };
}
