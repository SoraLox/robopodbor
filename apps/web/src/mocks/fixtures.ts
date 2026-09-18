/**
 * Фикстуры повторяют цифры из референсных экранов дизайна.
 * Расчёт здесь не выполняется — значения приходят готовыми, как с бэкенда.
 */
import type {
  CalculationResult,
  ObjectType,
  ParameterField,
  Project,
  Solution,
  TaxonomyNode,
} from '@/api/types';

export const objectTypes: ObjectType[] = [
  {
    slug: 'warehouse',
    title: 'Склад',
    description:
      'Паллетное и мелкоштучное хранение, комплектация, внутренняя транспортировка.',
    solutionsCount: 148,
    solutionsCountLabel: 'решений',
    paybackRange: '2.8–4.6',
    photoCaption: 'ФОТО · AMR НА СКЛАДЕ',
  },
  {
    slug: 'airport',
    title: 'Аэропорт',
    description:
      'Обработка багажа, перронная логистика, уборка и инспекция инфраструктуры БАС.',
    solutionsCount: 63,
    solutionsCountLabel: 'решения',
    paybackRange: '4.1–6.2',
    photoCaption: 'ФОТО · ПЕРРОННАЯ ТЕХНИКА',
  },
  {
    slug: 'clinic',
    title: 'Медучреждение',
    description:
      'Транспортировка расходников и белья, дезинфекция помещений, аптечная логистика.',
    solutionsCount: 41,
    solutionsCountLabel: 'решение',
    paybackRange: '5.0–7.4',
    photoCaption: 'ФОТО · РОБОТ В КЛИНИКЕ',
  },
];

export const demoCalculation: CalculationResult = {
  id: 'demo',
  objectTitle: 'Склад «Южные Врата» · 20 000 м²',
  meta: 'РАСЧЁТ №2026-0417 · 3 СМЕНЫ · 64 ОПЕРАТОРА · ГОРИЗОНТ 7 ЛЕТ · 17.09.2026',
  payback: {
    label: 'Срок окупаемости',
    value: '3.2',
    unit: 'года',
    trend: 'down',
    note: 'Рекомендуемый сценарий — покупка с господдержкой: на 0.6 года быстрее RaaS.',
  },
  capex: {
    label: 'CAPEX',
    value: '80',
    note: 'МЛН ₽ ЕДИНОРАЗОВО',
    trend: 'none',
  },
  roi: {
    label: 'ROI, 5 лет',
    value: '148%',
    note: 'NPV 71.4 МЛН ₽',
    trend: 'up',
  },
  opexSaving: {
    series: [2.1, 4.4, 8.0, 12.6, 18.1, 24.0, 31.2],
    percent: '+24.8%',
    meta: '31.2 МЛН ₽/ГОД К 7-МУ',
  },
  warning:
    'Стоимость смены и тариф RaaS взяты из отраслевого бенчмарка 2025 года. Уточните у поставщика перед защитой бюджета.',
  assumptions: ['ДИСКОНТ 16% · ИНФЛЯЦИЯ ФОТ 9%/ГОД', 'ОКУПАЕМОСТЬ RAAS — 3.8 ГОДА'],
  scenarios: [
    {
      id: 'as-is',
      title: 'Как есть',
      subtitle: 'Без автоматизации',
      tco: 214.0,
      share: 1,
      delta: 'БАЗА',
      detail: '214.0 · ФОТ 168.0 · обслуживание 46.0',
    },
    {
      id: 'purchase',
      title: 'Покупка',
      subtitle: 'CAPEX + сервис',
      tco: 134.6,
      share: 0.63,
      delta: '−79.4',
      recommended: true,
    },
    {
      id: 'raas',
      title: 'RaaS',
      subtitle: 'Аренда, 0 CAPEX',
      tco: 154.2,
      share: 0.72,
      delta: '−59.8',
    },
  ],
  costGroups: [
    {
      id: 'capex',
      title: 'CAPEX · единоразово',
      amount: 80.0,
      share: 59,
      confidence: 'confirmed',
      lines: [
        {
          title: '12 × AMR-паллетовоз P15',
          amount: 44.4,
          share: 33,
          source: 'ПРАЙС 2026',
          confidence: 'confirmed',
        },
        {
          title: 'Система управления парком (WCS)',
          amount: 14.8,
          share: 11,
          source: 'ПРАЙС 2026',
          confidence: 'confirmed',
        },
        {
          title: 'Зарядные станции, разметка, Wi-Fi',
          amount: 12.6,
          share: 9,
          source: 'ОЦЕНКА',
          confidence: 'needs-review',
        },
        {
          title: 'Внедрение, интеграция с WMS, обучение',
          amount: 8.2,
          share: 6,
          source: 'ОЦЕНКА',
          confidence: 'needs-review',
        },
      ],
    },
    {
      id: 'opex',
      title: 'OPEX · 7 лет',
      amount: 54.6,
      share: 41,
      confidence: 'needs-review',
      lines: [
        {
          title: 'Сервисный контракт, 7% от CAPEX в год',
          amount: 28.0,
          share: 21,
          source: 'БЕНЧМАРК',
          confidence: 'needs-review',
        },
        {
          title: 'Электроэнергия и ЗИП',
          amount: 11.9,
          share: 9,
          source: 'ТАРИФ РЕГИОНА',
          confidence: 'confirmed',
        },
        {
          title: 'Остаточный ФОТ: 21 оператор, 2 инженера',
          amount: 14.7,
          share: 11,
          source: 'ОЦЕНКА',
          confidence: 'needs-review',
        },
      ],
    },
  ],
  totalTco: 134.6,
  sensitivity: [
    { id: 'shift-cost', label: 'Стоимость смены оператора', impact: 0.41, direction: 'down', low: '2.6 года', high: '4.1 года' },
    { id: 'raas-rate', label: 'Тариф RaaS', impact: 0.27, direction: 'up', low: '3.0 года', high: '3.6 года' },
    { id: 'discount', label: 'Ставка дисконтирования', impact: 0.19, direction: 'up', low: '3.1 года', high: '3.5 года' },
    { id: 'service', label: 'Сервисный контракт, % от CAPEX', impact: 0.13, direction: 'up', low: '3.1 года', high: '3.4 года' },
  ],
};

export const solutions: Solution[] = [
  {
    id: 'p15',
    name: 'AMR-паллетовоз P15',
    vendor: 'Ронави Роботикс',
    useCase: 'Транспортировка паллет между зонами',
    price: '7.4',
    payload: '1 500 кг',
    speed: '1.8 м/с',
    maturity: 'operation',
    confidence: 'confirmed',
    source: 'Прайс вендора',
    sourceDate: '12.09.2026',
    objectTypes: ['warehouse', 'clinic'],
    score: 92,
    scoreFactors: [{ label: 'Зрелость решения', weight: 32 }, { label: 'Соответствие процессам', weight: 28 }, { label: 'Цена за единицу производительности', weight: 20 }, { label: 'Российский вендор', weight: 12 }],
  },
  {
    id: 's20',
    name: 'Штабелёр AS/RS S20',
    vendor: 'Крафтвэй Робо',
    useCase: 'Высотное хранение, подача паллет на пост',
    price: '12.1',
    payload: '2 000 кг',
    speed: '1.2 м/с',
    maturity: 'operation',
    confidence: 'needs-review',
    source: 'Прайс вендора',
    sourceDate: '08.09.2026',
    objectTypes: ['warehouse'],
    score: 85,
    scoreFactors: [{ label: 'Соответствие процессам', weight: 30 }, { label: 'Зрелость решения', weight: 28 }, { label: 'Грузоподъёмность', weight: 17 }, { label: 'Российский вендор', weight: 10 }],
  },
  {
    id: 'srt8',
    name: 'Сортировщик SRT-8',
    vendor: 'Технорэд',
    useCase: 'Сортировка заказов, 8 000 посылок/ч',
    price: '5.9',
    payload: '50 кг',
    speed: '2.4 м/с',
    maturity: 'operation',
    confidence: 'confirmed',
    source: 'Прайс вендора',
    sourceDate: '12.09.2026',
    objectTypes: ['warehouse', 'airport'],
    score: 79,
    scoreFactors: [{ label: 'Производительность', weight: 31 }, { label: 'Зрелость решения', weight: 26 }, { label: 'Цена', weight: 14 }, { label: 'Российский вендор', weight: 8 }],
  },
  {
    id: 'ams',
    name: 'Манипулятор пикинга AMS-2',
    vendor: 'Аркодим',
    useCase: 'Штучный отбор, зрение и вакуумный захват',
    price: '9.6',
    payload: '25 кг',
    speed: '0.9 м/с',
    maturity: 'piloting',
    confidence: 'needs-review',
    source: 'Бенчмарк отрасли',
    sourceDate: '2025 год',
    objectTypes: ['warehouse', 'clinic'],
    score: 64,
    scoreFactors: [{ label: 'Соответствие процессам', weight: 26 }, { label: 'Цена', weight: 18 }, { label: 'Зрелость решения', weight: 12 }, { label: 'Российский вендор', weight: 8 }],
  },
  {
    id: 'drone',
    name: 'БАС-инвентаризатор DX-4',
    vendor: 'Геоскан',
    useCase: 'Пересчёт запасов по RFID в высотных стеллажах',
    price: '3.2',
    payload: '2 кг',
    speed: '4.0 м/с',
    maturity: 'rnd',
    confidence: 'needs-review',
    source: 'НИОКР вендора',
    sourceDate: '2026 год',
    objectTypes: ['warehouse', 'airport'],
    score: 48,
    scoreFactors: [{ label: 'Потенциал экономии', weight: 22 }, { label: 'Цена', weight: 14 }, { label: 'Зрелость решения', weight: 6 }, { label: 'Российский вендор', weight: 6 }],
  },
];

export const projects: Project[] = [
  {
    id: 'demo',
    title: 'Склад «Южные Врата» · 20 000 м²',
    meta: 'РАСЧЁТ №2026-0417 · 17.09.2026',
    payback: '3.2',
    status: 'operation',
  },
  {
    id: '2026-0392',
    title: 'Терминал багажа · Стригино',
    meta: 'РАСЧЁТ №2026-0392 · 04.09.2026',
    payback: '5.1',
    status: 'piloting',
  },
  {
    id: '2026-0361',
    title: 'Областная клиническая больница',
    meta: 'РАСЧЁТ №2026-0361 · 22.08.2026',
    payback: '6.4',
    status: 'rnd',
  },
];

/** Поля паспорта объекта зависят от типа: состав приходит с бэкенда. */
export const objectParameters: Record<string, ParameterField[]> = {
  warehouse: [
    { id: 'area', label: 'Площадь склада', unit: 'м²', kind: 'number', min: 100, defaultValue: '20000' },
    { id: 'shifts', label: 'Сменность', kind: 'number', min: 1, max: 3, defaultValue: '3' },
    { id: 'staff', label: 'Операторов', kind: 'number', min: 1, defaultValue: '64' },
    { id: 'flow', label: 'Грузопоток', unit: 'паллет/сут', kind: 'number', min: 1, defaultValue: '1850' },
    { id: 'racking', label: 'Тип хранения', kind: 'select', defaultValue: 'pallet',
      options: [
        { value: 'pallet', label: 'Паллетное' },
        { value: 'shelf', label: 'Мелкоштучное' },
        { value: 'mixed', label: 'Смешанное' },
      ] },
    { id: 'horizon', label: 'Горизонт расчёта', unit: 'лет', kind: 'number', min: 3, max: 10, defaultValue: '7' },
    { id: 'region', label: 'Регион', kind: 'text', defaultValue: 'Нижегородская обл.' },
  ],
  airport: [
    { id: 'passengers', label: 'Пассажиропоток', unit: 'млн/год', kind: 'number', min: 1, defaultValue: '4.2' },
    { id: 'baggage', label: 'Багажных мест', unit: 'тыс./сут', kind: 'number', min: 1, defaultValue: '18' },
    { id: 'terminals', label: 'Терминалов', kind: 'number', min: 1, max: 12, defaultValue: '2' },
    { id: 'apron', label: 'Мест стоянки', kind: 'number', min: 1, defaultValue: '24' },
    { id: 'shifts', label: 'Сменность', kind: 'number', min: 1, max: 3, defaultValue: '3' },
    { id: 'uav', label: 'Инспекция БАС', kind: 'select', defaultValue: 'planned',
      options: [
        { value: 'none', label: 'Не планируется' },
        { value: 'planned', label: 'Планируется' },
        { value: 'active', label: 'Уже применяется' },
      ] },
    { id: 'horizon', label: 'Горизонт расчёта', unit: 'лет', kind: 'number', min: 3, max: 10, defaultValue: '7' },
    { id: 'region', label: 'Регион', kind: 'text', defaultValue: 'Нижегородская обл.' },
  ],
  clinic: [
    { id: 'beds', label: 'Коечный фонд', kind: 'number', min: 10, defaultValue: '640' },
    { id: 'buildings', label: 'Корпусов', kind: 'number', min: 1, max: 20, defaultValue: '4' },
    { id: 'deliveries', label: 'Внутренних доставок', unit: 'рейсов/сут', kind: 'number', min: 1, defaultValue: '380' },
    { id: 'staff', label: 'Персонала логистики', kind: 'number', min: 1, defaultValue: '28' },
    { id: 'sterile', label: 'Зона стерилизации', kind: 'select', defaultValue: 'central',
      options: [
        { value: 'central', label: 'Централизованная' },
        { value: 'distributed', label: 'Распределённая' },
      ] },
    { id: 'horizon', label: 'Горизонт расчёта', unit: 'лет', kind: 'number', min: 3, max: 10, defaultValue: '7' },
    { id: 'region', label: 'Регион', kind: 'text', defaultValue: 'Нижегородская обл.' },
  ],
};

/** Иерархия каталога: отрасль → объект → процесс → тип решения → продукт. */
export const taxonomy: TaxonomyNode[] = [
  {
    id: 'logistics',
    label: 'Логистика и склад',
    level: 'industry',
    children: [
      {
        id: 'warehouse',
        label: 'Склад',
        level: 'object',
        children: [
          {
            id: 'transport',
            label: 'Внутренняя транспортировка',
            level: 'process',
            children: [
              {
                id: 'amr',
                label: 'AMR / транспортировка',
                level: 'solutionType',
                children: [{ id: 'p15', label: 'AMR-паллетовоз P15', level: 'product' }],
              },
            ],
          },
          {
            id: 'storage',
            label: 'Хранение и подача',
            level: 'process',
            children: [
              {
                id: 'asrs',
                label: 'AS/RS · хранение',
                level: 'solutionType',
                children: [{ id: 's20', label: 'Штабелёр AS/RS S20', level: 'product' }],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'aviation',
    label: 'Авиационная инфраструктура',
    level: 'industry',
    children: [
      {
        id: 'airport',
        label: 'Аэропорт',
        level: 'object',
        children: [
          {
            id: 'baggage',
            label: 'Обработка багажа',
            level: 'process',
            children: [
              {
                id: 'sorter',
                label: 'Сортировка',
                level: 'solutionType',
                children: [{ id: 'srt8', label: 'Сортировщик SRT-8', level: 'product' }],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'healthcare',
    label: 'Здравоохранение',
    level: 'industry',
    children: [
      {
        id: 'clinic',
        label: 'Медучреждение',
        level: 'object',
        children: [
          {
            id: 'delivery',
            label: 'Внутрибольничная доставка',
            level: 'process',
            children: [
              {
                id: 'amr-med',
                label: 'AMR / транспортировка',
                level: 'solutionType',
                children: [{ id: 'p15', label: 'AMR-паллетовоз P15', level: 'product' }],
              },
            ],
          },
        ],
      },
    ],
  },
];
