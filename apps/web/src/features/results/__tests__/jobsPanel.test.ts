import { describe, expect, it } from 'vitest';
import { recommendationsOf } from '@/upstream/simulation/JobsPanel.jsx';

const jobs = (groups: Array<{ label: string; role: string; count: number; load: number }>, simSeconds = 1200) => ({
  doneIn: 10,
  doneOut: 5,
  donePick: 0,
  cartons: 0,
  inFlight: 3,
  groups,
  simSeconds,
});

describe('рекомендации панели «Задания»', () => {
  it('узкое место — добавить робота, простой — убрать; по одному действию на роль', () => {
    const advice = recommendationsOf(
      jobs([
        { label: 'погрузчики у стеллажей', role: 'forklift', count: 2, load: 100 },
        { label: 'погрузчики у ворот', role: 'forklift', count: 2, load: 95 },
        { label: 'AMR', role: 'amr', count: 6, load: 20 },
      ]),
    );
    expect(advice.map((a) => [a.action.role, a.action.delta])).toEqual([
      ['forklift', 1],
      ['amr', -1],
    ]);
  });

  it('первые 10 минут симуляции — без рекомендаций, сбалансированный парк — без действий', () => {
    expect(recommendationsOf(jobs([{ label: 'AMR', role: 'amr', count: 4, load: 99 }], 120))).toEqual([]);
    expect(recommendationsOf(jobs([{ label: 'AMR', role: 'amr', count: 4, load: 70 }]))).toEqual([]);
  });
});
