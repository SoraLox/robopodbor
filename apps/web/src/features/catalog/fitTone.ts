export interface FitTone {
  id: 'best' | 'good' | 'other';
  bar: string;
  text: string;
  strip: string;
  badgeBg: string;
}

/**
 * Балл соответствия — светофор: зелёный/жёлтый/красный говорит быстрее,
 * чем число. Пороги те же, что делят каталог на группы.
 */
export function getFitTone(score: number): FitTone {
  if (score >= 85) {
    return { id: 'best', bar: 'bg-status-operation', text: 'text-status-operation', strip: 'bg-status-operation', badgeBg: 'bg-status-operation' };
  }
  if (score >= 65) {
    return { id: 'good', bar: 'bg-status-piloting', text: 'text-status-piloting', strip: 'bg-status-piloting', badgeBg: 'bg-status-piloting' };
  }
  return { id: 'other', bar: 'bg-status-danger', text: 'text-status-danger', strip: 'bg-status-danger', badgeBg: 'bg-status-danger' };
}
