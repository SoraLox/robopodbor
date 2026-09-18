/** Демо-данные панели управления. Считает бэкенд — фронт только отображает. */

const DAYS = [
  '1 сен', '2 сен', '3 сен', '4 сен', '5 сен', '6 сен', '7 сен', '8 сен',
  '9 сен', '10 сен', '11 сен', '12 сен', '13 сен', '14 сен', '15 сен',
];

/*
  В столбцах только потоки за день: завершённые и отклонённые расчёты.
  «В работе» — не поток, а остаток на конец периода, складывать его со
  завершёнными нельзя. Суммы сходятся со сводкой:
  11 927 завершено + 243 отклонено + 312 в работе = 12 482.
*/
const DONE = [702, 731, 744, 768, 779, 786, 794, 801, 806, 812, 818, 824, 833, 841, 888];
const REJECTED = [14, 15, 15, 16, 16, 16, 16, 16, 16, 16, 17, 17, 17, 17, 19];

export const requestFlow = DAYS.map((label, index) => ({
  label,
  done: DONE[index] ?? 0,
  rejected: REJECTED[index] ?? 0,
}));

/*
  Ряды согласованы с долями бублика: за период склады дают 32 % от 12 482
  (≈3 994), аэропорты — 21 % (≈2 621). Отсюда суточные ~266 и ~175.
*/
export const categoryTrend = DAYS.map((label, index) => ({
  label,
  warehouse: 243 + index * 3 + (index % 3) * 7,
  airport: 160 + index * 2 + (index % 4) * 5,
}));

export const kpis: Array<{
  id: string;
  label: string;
  value: string;
  unit?: string;
  delta: string;
  tone: 'up' | 'down';
  trend: number[];
}> = [
  {
    id: 'total',
    label: 'Всего расчётов',
    value: '12 482',
    delta: '+12%',
    tone: 'up' as const,
    trend: [42, 44, 45, 48, 47, 51, 53, 55, 58, 59, 62, 64, 67, 69, 72],
  },
  {
    id: 'done',
    label: 'Завершено',
    value: '11 927',
    delta: '+14%',
    tone: 'up' as const,
    trend: [38, 41, 44, 46, 49, 51, 52, 55, 57, 60, 63, 66, 69, 72, 76],
  },
  {
    id: 'payback',
    label: 'Медианная окупаемость',
    value: '3.4',
    unit: 'года',
    delta: '−0.3',
    tone: 'down' as const,
    trend: [42, 42, 41, 41, 40, 40, 39, 38, 38, 37, 37, 36, 35, 35, 34],
  },
  {
    id: 'capex',
    label: 'CAPEX за период',
    value: '537',
    unit: 'млрд ₽',
    delta: '+11%',
    tone: 'up' as const,
    trend: [30, 31, 33, 34, 35, 37, 38, 39, 40, 42, 43, 44, 45, 45, 46],
  },
];

export const categories = [
  { name: 'Склады', value: 32 },
  { name: 'Аэропорты', value: 21 },
  { name: 'Медучреждения', value: 14 },
  { name: 'Транспортные узлы', value: 11 },
  { name: 'Производство', value: 8 },
  { name: 'Прочее', value: 14 },
];

export type CalcStatus = 'active' | 'done' | 'approved' | 'rejected';

export const recentCalculations: Array<{
  id: string;
  date: string;
  org: string;
  category: string;
  status: CalcStatus;
  capex: string;
}> = [
  { id: '78452', date: '15.09.2026', org: 'ООО «Волга-Логистик»', category: 'Склады', status: 'active', capex: '80 000 000 ₽' },
  { id: '78451', date: '15.09.2026', org: 'АО «ТехноПром»', category: 'Производство', status: 'done', capex: '54 750 000 ₽' },
  { id: '78450', date: '14.09.2026', org: 'МУП «Городской центр»', category: 'Медучреждения', status: 'approved', capex: '32 200 000 ₽' },
  { id: '78449', date: '14.09.2026', org: 'ООО «Ромашка»', category: 'Склады', status: 'rejected', capex: '18 500 000 ₽' },
  { id: '78448', date: '13.09.2026', org: 'АО «ТрансСервис»', category: 'Транспортные узлы', status: 'done', capex: '64 000 000 ₽' },
];

/* Сумма = CAPEX всех расчётов организации, млн ₽; сходится с порядком
   величин в таблице последних расчётов (18–80 млн ₽ за расчёт). */
export const topOrganizations = [
  { name: 'ООО «Волга-Логистик»', count: 24, sum: '1 248' },
  { name: 'АО «ТехноПром»', count: 19, sum: '892' },
  { name: 'МУП «Городской центр»', count: 16, sum: '604' },
  { name: 'АО «ТрансСервис»', count: 13, sum: '521' },
  { name: 'ГК «Северный порт»', count: 11, sum: '438' },
];

/* CAPEX в млрд ₽; ≈ count × 45 млн ₽ среднего расчёта. */
export const regions = [
  { name: 'Москва', count: 3542, sum: '159.4' },
  { name: 'Московская область', count: 2376, sum: '106.9' },
  { name: 'Санкт-Петербург', count: 1842, sum: '82.9' },
  { name: 'Нижегородская область', count: 1205, sum: '54.2' },
  { name: 'Свердловская область', count: 987, sum: '44.4' },
];

export const events = [
  { time: '15:42', tone: 'piloting' as const, title: 'Тариф RaaS вырос на 6 %', note: 'Затронуто 9 расчётов — требуется пересчёт' },
  { time: '14:37', tone: 'rnd' as const, title: 'Обновлён справочник цен', note: 'Ронави Роботикс — 3 позиции' },
  { time: '12:26', tone: 'operation' as const, title: 'Инвесткомитет одобрил бюджет', note: 'Расчёт № 78450 — 32.2 млн ₽' },
  { time: '11:15', tone: 'confirmed' as const, title: 'Подтверждён тариф электроэнергии', note: 'Нижегородская обл., сентябрь' },
  { time: '09:48', tone: 'danger' as const, title: 'Бенчмарк 2025 устарел', note: 'Стоимость смены требует проверки' },
];

export const tasks = [
  { label: 'Назначены на меня', count: 12 },
  { label: 'Ждут моего согласования', count: 7 },
  { label: 'Возвращены на доработку', count: 5 },
  { label: 'Просрочены', count: 2 },
];
