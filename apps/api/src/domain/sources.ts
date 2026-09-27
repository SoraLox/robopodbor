/**
 * Источники данных по умолчанию (ТЗ 3.1.4): ими заполняется пустая база и мок-бэкенд.
 * Дальше список ведёт администратор.
 */
export type SourceKind = "price" | "tariff" | "registry" | "benchmark" | "cases" | "dataset" | "open";

export interface DataSourceSeed {
  title: string;
  scope: string;
  kind: SourceKind;
  url?: string;
  actualAt: string;
  confirmed: boolean;
}

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  price: "Цены",
  tariff: "Тарифы",
  registry: "Реестр",
  benchmark: "Бенчмарк",
  cases: "Внедрения",
  dataset: "Датасет",
  open: "Открытые источники",
};

export const DEFAULT_SOURCES: DataSourceSeed[] = [
  { title: "Каталог решений организатора (PDF)", scope: "Перечень решений и характеристики", kind: "dataset", actualAt: "ожидается", confirmed: false },
  { title: "Демо-датасеты объектов «Датасеты_хакатон.xlsx»", scope: "Паспорта склада, аэропорта и медучреждения, значения по умолчанию", kind: "dataset", actualAt: "2026", confirmed: true },
  { title: "Файл цен БАС и БРС (catalog_export_v5)", scope: "Цены изделий с НДС, без доставки и пусконаладки", kind: "price", actualAt: "ожидается", confirmed: false },
  { title: "Прайс-листы вендоров", scope: "Цены на технику и системы управления парком", kind: "price", actualAt: "17.09.2026", confirmed: true },
  { title: "Тарифы электроэнергии", scope: "Стоимость кВт·ч по регионам", kind: "tariff", actualAt: "01.09.2026", confirmed: true },
  { title: "Реестр российской промышленной продукции Минпромторга", scope: "Признак российского происхождения", kind: "registry", url: "https://gisp.gov.ru/pp719v2/pub/prod/", actualAt: "28.08.2026", confirmed: true },
  { title: "Отраслевой бенчмарк", scope: "Стоимость смены, тариф RaaS, сервисный контракт", kind: "benchmark", actualAt: "2025 год", confirmed: false },
  { title: "Сайты производителей и публичные спецификации", scope: "Недостающие ТТХ решений («Дополнения», п. 3.2)", kind: "open", actualAt: "09.2026", confirmed: false },
];
