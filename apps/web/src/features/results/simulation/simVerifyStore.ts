import { useSyncExternalStore } from 'react';

/**
 * Строки «Подтверждение расчёта симуляцией» (upstream verification.js buildVerifyRows):
 * сцена отчёта работает в режиме immersive и своей панели не рисует — публикует
 * строки сюда, а раздел отчёта показывает их. Отдельное хранилище, а не контекст:
 * строки обновляются вместе со статистикой сцены, и перерисовывать весь отчёт
 * ради них не нужно.
 */
export interface VerifyRow {
  label: string;
  unit: string;
  required: number | null;
  calculated: number | null;
  simulated: number | null;
  note?: string;
}

export interface VerifySnapshot {
  rows: VerifyRow[];
  simSeconds: number;
}

const EMPTY: VerifySnapshot = { rows: [], simSeconds: 0 };
let snapshot = EMPTY;
const listeners = new Set<() => void>();

export function publishVerifyRows(next: VerifySnapshot | null) {
  snapshot = next ?? EMPTY;
  listeners.forEach((listener) => listener());
}

export function useVerifyRows(): VerifySnapshot {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
    () => EMPTY,
  );
}
