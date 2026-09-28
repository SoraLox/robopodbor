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

// Только то, на чём расчёт действительно стоит. Прайс-листов вендоров, тарифов по
// регионам и реестра Минпромторга в расчёте нет — раньше они значились здесь зря.
export const DEFAULT_SOURCES: DataSourceSeed[] = [
  { title: "Каталог роботов (robots_catalog v2.0.0)", scope: "Характеристики, категории и применимость 187 роботов", kind: "dataset", actualAt: "25.09.2026", confirmed: true },
  { title: "Каталог решений ФЦ БАС, выгрузка catalog_export_v4.csv", scope: "Цены изделий", kind: "price", actualAt: "21.09.2026", confirmed: true },
  { title: "Демо-датасеты объектов «Датасеты_хакатон.xlsx»", scope: "Паспорта склада, аэропорта и медучреждения, значения по умолчанию", kind: "dataset", actualAt: "2026", confirmed: true },
  { title: "Материалы организатора: ТЗ и «Дополнения для участников»", scope: "Примеры решений для объектов, недостающие характеристики", kind: "dataset", actualAt: "09.2026", confirmed: true },
  { title: "Сайты производителей и дистрибьюторов", scope: "Недостающие характеристики, сверенные со страницей модели", kind: "open", actualAt: "09.2026", confirmed: false },
  { title: "Оценки модели экономики", scope: "Внедрение 15% и обслуживание 7% цены, RaaS 2,5% цены в месяц, электроэнергия 7 ₽/кВт·ч", kind: "benchmark", actualAt: "09.2026", confirmed: false },
];
