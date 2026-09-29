/**
 * Оценки команды для пустых полей каталога: типовые характеристики класса
 * оборудования по открытым данным производителей и аналогов. Не заменяют
 * значения из каталога, материалов организатора и открытых источников —
 * заполняют только то, что осталось пустым после них.
 *
 * У каждого оценённого поля в fieldSources — источник «допущение команды»
 * (kind: "team", confirmed: false): в карточке оно помечено «допущение»,
 * в расчёте экономики — как требующее проверки. Реализованные кейсы не
 * оцениваем: придуманный кейс — это не допущение, а неправда.
 */
import type { AcquisitionModel, Availability, CatalogSolution, Environment, FieldProvenance, FieldSource } from "./catalog.js";

export const ESTIMATE_SOURCE: FieldSource = {
  kind: "team",
  title: "Оценка команды по типовым характеристикам класса оборудования (открытые данные производителей и аналогов)",
  date: "29.09.2026",
};

type Throughput = { value: number; unit: string };

/** Типовой профиль класса оборудования. Поля без значения не оцениваются. */
interface Profile {
  /** Как назвать класс в пояснении к оценке. */
  label: string;
  /** 0 — не перевозит грузы. */
  payloadKg?: number;
  weightKg?: number;
  /** Длина × ширина × высота, мм. */
  dims?: [number, number, number];
  dimensionsText?: string;
  /** Рабочая скорость, м/с; строка — для стационарных («скорость инструмента»). */
  speedMps?: number;
  speedText?: string;
  throughput?: Throughput;
  /** 24 — работа от сети (так читает карточка). */
  autonomyHours?: number;
  chargeHours?: number;
  batteryKwh?: number;
  powerKw?: number;
  positioningAccuracyMm?: number;
  navigation?: string;
  environment?: Environment;
  minTempC?: number;
  maxTempC?: number;
  ip?: string;
  conditionsExtra?: string;
  noiseDb?: number;
  minAisleWidthM?: number;
  maxFloorDeviationMm?: number;
  minCeilingHeightM?: number;
  elevatorIntegration?: boolean;
  airsideCertified?: boolean;
  floor?: string;
  charging?: string;
  connectivity?: string;
  integration?: string;
  service?: string;
  /** ПО: доля цены единицы. */
  softwareShare?: number;
  /** Внедрение на проект (пилотный парк): доля цены единицы и нижняя граница, млн ₽. */
  implementationShare?: number;
  implementationMin?: number;
  /** Обслуживание в год: доля цены единицы. */
  maintenanceShare?: number;
  acquisition?: AcquisitionModel[];
  lifespanYears?: number;
  limitation?: string;
  /** Крупное оборудование делают под заказ, а не держат на складе. */
  madeToOrder?: boolean;
  /** Цена единицы, млн ₽ — только для моделей без цены в каталоге (по рыночной цене аналогов). */
  priceMln?: number;
}

const BUY_LEASE_RENT: AcquisitionModel[] = ["purchase", "leasing", "raas"];
const BUY_LEASE: AcquisitionModel[] = ["purchase", "leasing"];

const MOBILE_SERVICE = "Сервисный договор производителя: плановое ТО раз в 6 месяцев, удалённая диагностика, выезд инженера";
const FIXED_SERVICE = "Сервисный договор интегратора: плановое ТО раз в год, запасные части, удалённая поддержка";

// ─── Профили категорий каталога ──────────────────────────────────────────────
const PROFILES: Record<string, Profile> = {
  FC: {
    label: "робот-уборщик помещений",
    payloadKg: 0,
    weightKg: 180,
    dims: [1000, 650, 1100],
    speedMps: 1,
    throughput: { value: 1500, unit: "м²/ч" },
    autonomyHours: 4,
    chargeHours: 3,
    batteryKwh: 2.4,
    powerKw: 0.6,
    positioningAccuracyMm: 20,
    navigation: "Лидарный SLAM, камеры глубины, ультразвуковые датчики",
    environment: "indoor",
    minTempC: 5,
    maxTempC: 40,
    ip: "IP44",
    noiseDb: 65,
    minAisleWidthM: 1,
    maxFloorDeviationMm: 10,
    minCeilingHeightM: 2.2,
    elevatorIntegration: true,
    airsideCertified: false,
    floor: "Твёрдые покрытия: бетон, плитка, наливной пол, линолеум; пороги до 20 мм, проходы от 1 м",
    charging: "Док-станция с автоподключением, розетка 220 В; на крупных моделях — автозаправка водой",
    connectivity: "Wi-Fi, 4G/LTE",
    integration: "Облачная платформа управления уборкой, API; вызов лифта через контроллер лифта",
    service: "Сервис производителя или дилера: ТО раз в 3 месяца, замена щёток, сквиджей и фильтров",
    softwareShare: 0.05,
    implementationShare: 0.3,
    implementationMin: 0.3,
    maintenanceShare: 0.1,
    acquisition: BUY_LEASE_RENT,
    lifespanYears: 5,
    limitation: "Не убирает лестницы и ковролин с длинным ворсом; нужна карта помещения",
  },
  SS: {
    label: "уличный робот-уборщик",
    payloadKg: 150,
    weightKg: 800,
    dims: [2200, 1200, 1600],
    speedMps: 1.5,
    throughput: { value: 3000, unit: "м²/ч" },
    autonomyHours: 6,
    chargeHours: 4,
    batteryKwh: 15,
    powerKw: 2.5,
    positioningAccuracyMm: 50,
    navigation: "ГНСС RTK, лидары, камеры, SLAM",
    environment: "outdoor",
    minTempC: -30,
    maxTempC: 40,
    ip: "IP65",
    noiseDb: 70,
    minAisleWidthM: 1.5,
    airsideCertified: false,
    floor: "Асфальт, плитка, брусчатка; уклон до 15%, бордюры до 100 мм",
    charging: "Зарядная станция 380 В в боксе или гараже",
    connectivity: "4G/LTE, ГНСС RTK",
    integration: "Диспетчерская платформа с маршрутами и телеметрией, API",
    service: MOBILE_SERVICE,
    softwareShare: 0.05,
    implementationShare: 0.15,
    implementationMin: 0.5,
    maintenanceShare: 0.1,
    acquisition: BUY_LEASE_RENT,
    lifespanYears: 7,
    limitation: "По снегу и льду работает с ограничениями; на дорогах общего пользования — только с сопровождением",
  },
  AM: {
    label: "автономный мобильный робот (AMR)",
    payloadKg: 600,
    weightKg: 200,
    dims: [1200, 800, 300],
    speedMps: 1.5,
    throughput: { value: 18, unit: "рейсов/ч" },
    autonomyHours: 8,
    chargeHours: 1.5,
    batteryKwh: 2,
    powerKw: 0.35,
    positioningAccuracyMm: 10,
    navigation: "Лидарный SLAM по естественным ориентирам, QR-метки в местах стыковки",
    environment: "indoor",
    minTempC: 0,
    maxTempC: 45,
    ip: "IP54",
    noiseDb: 55,
    minAisleWidthM: 1.4,
    maxFloorDeviationMm: 5,
    minCeilingHeightM: 2.5,
    elevatorIntegration: false,
    airsideCertified: false,
    floor: "Ровный бетонный или полимерный пол, уклон до 3°, зазоры и пороги до 15 мм",
    charging: "Автоматическая зарядная станция (контактная), 1 станция на 3–5 роботов",
    connectivity: "Wi-Fi 2,4/5 ГГц с бесшовным роумингом",
    integration: "Система управления парком (FMS), REST API, интеграция с WMS/MES",
    service: MOBILE_SERVICE,
    softwareShare: 0.1,
    implementationShare: 0.6,
    implementationMin: 0.8,
    maintenanceShare: 0.08,
    acquisition: BUY_LEASE_RENT,
    lifespanYears: 8,
    limitation: "Нужны ровный пол и карта помещения; при перепланировке — перекартирование",
  },
  FL: {
    label: "беспилотный погрузчик, штабелёр",
    payloadKg: 1500,
    weightKg: 1200,
    dims: [2000, 900, 2100],
    speedMps: 1.5,
    throughput: { value: 15, unit: "паллет/ч" },
    autonomyHours: 8,
    chargeHours: 2,
    batteryKwh: 12,
    powerKw: 2,
    positioningAccuracyMm: 10,
    navigation: "Лидарный SLAM, 3D-камеры для распознавания паллет",
    environment: "indoor",
    minTempC: 0,
    maxTempC: 40,
    ip: "IP54",
    noiseDb: 65,
    minAisleWidthM: 2.7,
    maxFloorDeviationMm: 5,
    minCeilingHeightM: 5,
    elevatorIntegration: false,
    airsideCertified: false,
    floor: "Бетонный пол класса FM2–FM3, проходы от 2,7 м, уклон до 5%",
    charging: "Зарядная станция с автоподключением или замена тяговой АКБ",
    connectivity: "Wi-Fi",
    integration: "Система управления парком, интеграция с WMS по API",
    service: MOBILE_SERVICE,
    softwareShare: 0.1,
    implementationShare: 0.5,
    implementationMin: 1,
    maintenanceShare: 0.08,
    acquisition: BUY_LEASE,
    lifespanYears: 8,
    limitation: "При совместной работе с людьми и ручной техникой нужна разметка и зонирование",
  },
  IN: {
    label: "робот-инвентаризатор",
    payloadKg: 0,
    weightKg: 120,
    dims: [900, 700, 1800],
    speedMps: 0.7,
    throughput: { value: 2000, unit: "ячеек/ч" },
    autonomyHours: 6,
    chargeHours: 2,
    batteryKwh: 1.5,
    powerKw: 0.25,
    positioningAccuracyMm: 20,
    navigation: "Лидарный SLAM, камеры, сканеры штрихкодов и RFID",
    environment: "indoor",
    minTempC: 0,
    maxTempC: 40,
    ip: "IP42",
    noiseDb: 50,
    minAisleWidthM: 1.2,
    maxFloorDeviationMm: 5,
    minCeilingHeightM: 3,
    elevatorIntegration: false,
    floor: "Ровный пол, проходы от 1,2 м",
    charging: "Зарядная станция с автоподключением",
    connectivity: "Wi-Fi",
    integration: "Сверка с WMS по API, выгрузка расхождений",
    service: MOBILE_SERVICE,
    softwareShare: 0.15,
    implementationShare: 0.5,
    implementationMin: 0.5,
    maintenanceShare: 0.1,
    acquisition: BUY_LEASE_RENT,
    lifespanYears: 6,
    limitation: "Нужны читаемые этикетки ячеек; сканирует на высоте до 10–12 м",
  },
  DL: {
    label: "робот-курьер",
    payloadKg: 20,
    weightKg: 60,
    dims: [800, 600, 1100],
    speedMps: 1.5,
    throughput: { value: 3, unit: "рейсов/ч" },
    autonomyHours: 8,
    chargeHours: 3,
    batteryKwh: 1,
    powerKw: 0.15,
    positioningAccuracyMm: 50,
    navigation: "Лидары, камеры, ГНСС, нейросетевое распознавание препятствий",
    environment: "both",
    minTempC: -20,
    maxTempC: 40,
    ip: "IP54",
    noiseDb: 45,
    minAisleWidthM: 1,
    maxFloorDeviationMm: 20,
    minCeilingHeightM: 2.2,
    elevatorIntegration: true,
    airsideCertified: false,
    floor: "Тротуары и полы без ступеней; бордюры до 150 мм, пандусы",
    charging: "Зарядная станция или замена аккумулятора в пункте обслуживания",
    connectivity: "4G/LTE",
    integration: "Платформа доставки: заказы, трекинг, открытие отсека по коду",
    service: MOBILE_SERVICE,
    softwareShare: 0.1,
    implementationShare: 0.5,
    implementationMin: 0.3,
    maintenanceShare: 0.12,
    acquisition: BUY_LEASE_RENT,
    lifespanYears: 5,
    limitation: "Не поднимается по лестницам; для этажей нужна интеграция с лифтом",
  },
  SC: {
    label: "охранный, патрульный робот",
    payloadKg: 0,
    weightKg: 150,
    dims: [1200, 800, 1200],
    speedMps: 1.5,
    throughput: { value: 5, unit: "км маршрута/ч" },
    autonomyHours: 8,
    chargeHours: 3,
    batteryKwh: 3,
    powerKw: 0.4,
    positioningAccuracyMm: 50,
    navigation: "ГНСС RTK, лидарный SLAM, тепловизор и PTZ-камера",
    environment: "both",
    minTempC: -30,
    maxTempC: 45,
    ip: "IP65",
    noiseDb: 55,
    minAisleWidthM: 1.5,
    maxFloorDeviationMm: 30,
    airsideCertified: false,
    floor: "Асфальт, грунтовые дороги, полы; уклон до 20%",
    charging: "Зарядная станция с автоподключением на маршруте",
    connectivity: "4G/LTE, Wi-Fi, радиоканал",
    integration: "Пульт охраны, СКУД и видеонаблюдение по API",
    service: MOBILE_SERVICE,
    softwareShare: 0.1,
    implementationShare: 0.3,
    implementationMin: 0.5,
    maintenanceShare: 0.1,
    acquisition: BUY_LEASE_RENT,
    lifespanYears: 6,
    limitation: "Не задерживает нарушителей — только обнаруживает и передаёт тревогу оператору",
  },
  ER: {
    label: "пожарный, спасательный робот",
    payloadKg: 0,
    weightKg: 500,
    dims: [1600, 900, 1100],
    speedMps: 1,
    throughput: { value: 60, unit: "л/с" },
    autonomyHours: 3,
    chargeHours: 4,
    batteryKwh: 10,
    powerKw: 3,
    positioningAccuracyMm: 100,
    navigation: "Дистанционное управление с пульта, камеры и тепловизор",
    environment: "both",
    minTempC: -40,
    maxTempC: 50,
    ip: "IP67",
    noiseDb: 75,
    minAisleWidthM: 1,
    airsideCertified: false,
    floor: "Любые твёрдые покрытия и грунт, завалы; гусеничный ход",
    charging: "Зарядное устройство 220/380 В в пожарном депо",
    connectivity: "Радиоканал, оптоволоконный кабель",
    integration: "Пульт оператора, передача видео в штаб",
    service: FIXED_SERVICE,
    softwareShare: 0.03,
    implementationShare: 0.1,
    implementationMin: 0.2,
    maintenanceShare: 0.06,
    acquisition: BUY_LEASE,
    lifespanYears: 10,
    limitation: "Работает только под управлением оператора, нужен обученный расчёт",
    madeToOrder: true,
  },
  IR: {
    label: "инспекционный робот",
    payloadKg: 0,
    weightKg: 40,
    dims: [800, 300, 300],
    speedMps: 0.1,
    throughput: { value: 200, unit: "м трубы/ч" },
    autonomyHours: 24,
    powerKw: 0.5,
    positioningAccuracyMm: 10,
    navigation: "Одометрия и инерциальная система, видеокамеры, кабель-трос с датчиком длины",
    environment: "both",
    minTempC: -10,
    maxTempC: 50,
    ip: "IP68",
    noiseDb: 50,
    floor: "Внутренняя поверхность трубы, диаметр по модели",
    charging: "Питание по кабелю от блока управления, 220 В",
    connectivity: "Кабель-трос, оптоволокно",
    integration: "Отчёт о дефектах с привязкой к метражу, экспорт в ГИС",
    service: FIXED_SERVICE,
    softwareShare: 0.1,
    implementationShare: 0.1,
    implementationMin: 0.2,
    maintenanceShare: 0.08,
    acquisition: ["purchase", "raas"],
    lifespanYears: 7,
    limitation: "Дальность ограничена длиной кабеля; требуется вывод трубы из работы",
    madeToOrder: true,
  },
  UG: {
    label: "платформа высокой проходимости",
    payloadKg: 300,
    weightKg: 600,
    dims: [2000, 1300, 1000],
    speedMps: 3,
    throughput: { value: 10, unit: "км/ч" },
    autonomyHours: 6,
    chargeHours: 4,
    batteryKwh: 10,
    powerKw: 3,
    positioningAccuracyMm: 50,
    navigation: "ГНСС RTK, лидары, камеры, режим «следуй за мной»",
    environment: "outdoor",
    minTempC: -30,
    maxTempC: 40,
    ip: "IP65",
    noiseDb: 60,
    airsideCertified: false,
    floor: "Бездорожье, грунт, снег; уклон до 30°",
    charging: "Зарядное устройство 220/380 В",
    connectivity: "Радиоканал, 4G/LTE",
    integration: "Пульт оператора, API телеметрии, сменные модули",
    service: MOBILE_SERVICE,
    softwareShare: 0.05,
    implementationShare: 0.15,
    implementationMin: 0.3,
    maintenanceShare: 0.08,
    acquisition: BUY_LEASE,
    lifespanYears: 8,
    limitation: "Автономный режим — на знакомом маршруте; в сложных условиях нужен оператор",
    madeToOrder: true,
  },
  RW: {
    label: "робот для обслуживания вагонов",
    payloadKg: 0,
    weightKg: 350,
    dims: [1500, 800, 1200],
    speedMps: 1.5,
    throughput: { value: 30, unit: "вагонов/ч" },
    autonomyHours: 8,
    chargeHours: 3,
    batteryKwh: 8,
    powerKw: 1.5,
    positioningAccuracyMm: 5,
    navigation: "Лидары, 3D-камеры, машинное зрение для поиска узлов вагона",
    environment: "outdoor",
    minTempC: -40,
    maxTempC: 40,
    ip: "IP65",
    noiseDb: 65,
    floor: "Междупутье сортировочной горки, щебень",
    charging: "Зарядная станция у путей",
    connectivity: "Радиоканал, 4G/LTE",
    integration: "АСУ сортировочной станции",
    service: FIXED_SERVICE,
    softwareShare: 0.1,
    implementationShare: 0.5,
    implementationMin: 1,
    maintenanceShare: 0.08,
    acquisition: BUY_LEASE,
    lifespanYears: 10,
    limitation: "Работает на подготовленном участке пути, нужна интеграция с АСУ станции",
    madeToOrder: true,
  },
  AG: {
    label: "беспилотный трактор, полевой робот",
    payloadKg: 0,
    weightKg: 3000,
    dims: [4000, 2000, 2700],
    speedMps: 3,
    throughput: { value: 2, unit: "га/ч" },
    autonomyHours: 10,
    powerKw: 60,
    positioningAccuracyMm: 25,
    navigation: "ГНСС RTK (2,5 см), лидары, камеры, распознавание препятствий",
    environment: "outdoor",
    minTempC: -10,
    maxTempC: 45,
    ip: "IP65",
    noiseDb: 85,
    floor: "Поле, грунтовые дороги",
    charging: "Заправка дизельным топливом или зарядка от сети 380 В",
    connectivity: "4G/LTE, ГНСС RTK-поправки",
    integration: "Система точного земледелия: карты полей, задания, телеметрия",
    service: "Сервис дилера сельхозтехники: сезонное ТО",
    softwareShare: 0.05,
    implementationShare: 0.1,
    implementationMin: 0.3,
    maintenanceShare: 0.06,
    acquisition: BUY_LEASE,
    lifespanYears: 10,
    limitation: "Нужны RTK-поправки и оцифрованные границы полей",
    madeToOrder: true,
  },
  HV: {
    label: "робот для сбора плодов",
    payloadKg: 30,
    weightKg: 300,
    dims: [1500, 900, 1800],
    speedMps: 0.5,
    throughput: { value: 600, unit: "плодов/ч" },
    autonomyHours: 8,
    chargeHours: 4,
    batteryKwh: 5,
    powerKw: 1,
    positioningAccuracyMm: 5,
    navigation: "RGB-D-камеры, машинное зрение, ГНСС или метки в теплице",
    environment: "both",
    minTempC: 5,
    maxTempC: 40,
    ip: "IP54",
    noiseDb: 55,
    floor: "Междурядья теплицы (рельсы обогрева) или сада",
    charging: "Зарядная станция 220 В",
    connectivity: "Wi-Fi, 4G/LTE",
    integration: "Учёт урожая и заданий, API",
    service: MOBILE_SERVICE,
    softwareShare: 0.1,
    implementationShare: 0.3,
    implementationMin: 0.3,
    maintenanceShare: 0.1,
    acquisition: BUY_LEASE_RENT,
    lifespanYears: 6,
    limitation: "Скорость сбора ниже ручной; нужны однородные посадки",
    madeToOrder: true,
  },
  LV: {
    label: "робот для животноводства",
    payloadKg: 0,
    weightKg: 150,
    dims: [1200, 700, 800],
    speedMps: 0.3,
    throughput: { value: 1, unit: "птичник/ч" },
    autonomyHours: 8,
    chargeHours: 3,
    batteryKwh: 2,
    powerKw: 0.3,
    positioningAccuracyMm: 50,
    navigation: "Лидар, камеры, метки",
    environment: "indoor",
    minTempC: 0,
    maxTempC: 40,
    ip: "IP65",
    noiseDb: 50,
    floor: "Подстилка, бетонный пол фермы",
    charging: "Зарядная станция в помещении фермы",
    connectivity: "Wi-Fi",
    integration: "Система управления фермой, API",
    service: MOBILE_SERVICE,
    softwareShare: 0.1,
    implementationShare: 0.3,
    implementationMin: 0.3,
    maintenanceShare: 0.08,
    acquisition: BUY_LEASE,
    lifespanYears: 8,
    limitation: "Требует дезинфекции оборудования между циклами выращивания",
  },
  AV: {
    label: "беспилотное транспортное средство",
    payloadKg: 2000,
    weightKg: 3500,
    dims: [5000, 2000, 2300],
    speedMps: 8,
    throughput: { value: 4, unit: "рейсов/ч" },
    autonomyHours: 10,
    chargeHours: 6,
    batteryKwh: 80,
    powerKw: 60,
    positioningAccuracyMm: 100,
    navigation: "Лидары, радары, камеры, ГНСС RTK, HD-карты",
    environment: "outdoor",
    minTempC: -40,
    maxTempC: 40,
    ip: "IP67",
    noiseDb: 70,
    airsideCertified: false,
    floor: "Асфальтированные дороги и площадки",
    charging: "Зарядная станция 380 В (DC) или заправка",
    connectivity: "4G/LTE, V2X",
    integration: "Диспетчерская платформа, удалённый оператор, API",
    service: "Сервисный центр производителя: ТО по пробегу, удалённая поддержка",
    softwareShare: 0.1,
    implementationShare: 0.2,
    implementationMin: 1,
    maintenanceShare: 0.06,
    acquisition: BUY_LEASE_RENT,
    lifespanYears: 8,
    limitation: "Работа на дорогах общего пользования — только в рамках экспериментального правового режима",
    madeToOrder: true,
  },
  CE: {
    label: "беспилотная строительная техника",
    payloadKg: 0,
    weightKg: 15000,
    dims: [6000, 2500, 3000],
    speedMps: 1.5,
    throughput: { value: 500, unit: "м²/ч" },
    autonomyHours: 10,
    powerKw: 100,
    positioningAccuracyMm: 20,
    navigation: "ГНСС RTK, лидары, радары, система нивелирования",
    environment: "outdoor",
    minTempC: -30,
    maxTempC: 40,
    ip: "IP65",
    noiseDb: 90,
    floor: "Строительная площадка, дорожное полотно",
    charging: "Заправка дизельным топливом",
    connectivity: "Радиоканал, 4G/LTE",
    integration: "Цифровая модель площадки (BIM), телеметрия",
    service: "Сервис дилера спецтехники: ТО по моточасам",
    softwareShare: 0.05,
    implementationShare: 0.1,
    implementationMin: 0.5,
    maintenanceShare: 0.05,
    acquisition: BUY_LEASE,
    lifespanYears: 10,
    limitation: "Нужна огороженная площадка без людей в рабочей зоне",
    madeToOrder: true,
  },
  IM: {
    label: "промышленный манипулятор",
    payloadKg: 20,
    weightKg: 250,
    dims: [1000, 800, 1800],
    speedText: "до 2 м/с (скорость инструмента)",
    throughput: { value: 600, unit: "циклов/ч" },
    autonomyHours: 24,
    powerKw: 3,
    positioningAccuracyMm: 0.05,
    navigation: "Не требуется: стационарный, программирование с пульта или офлайн",
    environment: "indoor",
    minTempC: 5,
    maxTempC: 45,
    ip: "IP54",
    noiseDb: 70,
    minCeilingHeightM: 3,
    floor: "Бетонное основание под анкерное крепление, ограждение рабочей зоны",
    charging: "Питание от сети 380 В",
    connectivity: "Ethernet, промышленные протоколы (Profinet, EtherCAT, Modbus TCP)",
    integration: "ПЛК линии, системы технического зрения, MES",
    service: FIXED_SERVICE,
    softwareShare: 0.1,
    implementationShare: 0.8,
    implementationMin: 1,
    maintenanceShare: 0.05,
    acquisition: BUY_LEASE,
    lifespanYears: 12,
    limitation: "Нужны защитное ограждение и оснастка (захват, инструмент) под задачу",
    madeToOrder: true,
  },
  CB: {
    label: "коллаборативный робот",
    payloadKg: 10,
    weightKg: 35,
    dims: [600, 600, 1300],
    speedText: "до 1 м/с (скорость инструмента)",
    throughput: { value: 400, unit: "циклов/ч" },
    autonomyHours: 24,
    powerKw: 0.5,
    positioningAccuracyMm: 0.03,
    navigation: "Не требуется: стационарный, обучение ведением руки",
    environment: "indoor",
    minTempC: 0,
    maxTempC: 45,
    ip: "IP54",
    noiseDb: 60,
    floor: "Стол или основание; работает рядом с человеком без ограждения",
    charging: "Питание от сети 220 В",
    connectivity: "Ethernet, Modbus TCP",
    integration: "ПЛК, камеры, захваты сторонних производителей",
    service: FIXED_SERVICE,
    softwareShare: 0.05,
    implementationShare: 0.3,
    implementationMin: 0.3,
    maintenanceShare: 0.04,
    acquisition: BUY_LEASE_RENT,
    lifespanYears: 10,
    limitation: "Небольшая грузоподъёмность и скорость — ради безопасной работы рядом с людьми",
  },
  MM: {
    label: "мобильный манипулятор",
    payloadKg: 15,
    weightKg: 300,
    dims: [1000, 700, 1500],
    speedMps: 1.2,
    throughput: { value: 200, unit: "шт/ч" },
    autonomyHours: 8,
    chargeHours: 2,
    batteryKwh: 3,
    powerKw: 0.6,
    positioningAccuracyMm: 5,
    navigation: "Лидарный SLAM, 3D-камеры для захвата",
    environment: "indoor",
    minTempC: 5,
    maxTempC: 40,
    ip: "IP42",
    noiseDb: 55,
    minAisleWidthM: 1.2,
    maxFloorDeviationMm: 5,
    minCeilingHeightM: 2.5,
    elevatorIntegration: false,
    floor: "Ровный пол, проходы от 1,2 м",
    charging: "Автоматическая зарядная станция",
    connectivity: "Wi-Fi",
    integration: "WMS/MES по API, система управления парком",
    service: MOBILE_SERVICE,
    softwareShare: 0.15,
    implementationShare: 0.6,
    implementationMin: 0.5,
    maintenanceShare: 0.1,
    acquisition: BUY_LEASE_RENT,
    lifespanYears: 7,
    limitation: "Производительность ниже, чем у стационарной ячейки; нужен однородный ассортимент",
  },
  RC: {
    label: "роботизированная ячейка",
    payloadKg: 10,
    weightKg: 1500,
    dims: [3000, 2500, 2200],
    speedText: "до 2 м/с (скорость инструмента)",
    throughput: { value: 60, unit: "циклов/ч" },
    autonomyHours: 24,
    powerKw: 10,
    positioningAccuracyMm: 0.05,
    navigation: "Не требуется: стационарная ячейка",
    environment: "indoor",
    minTempC: 5,
    maxTempC: 40,
    ip: "IP54",
    noiseDb: 75,
    minCeilingHeightM: 3,
    floor: "Бетонное основание, площадка под ячейку с ограждением",
    charging: "Питание от сети 380 В, сжатый воздух 6 бар",
    connectivity: "Ethernet, промышленные протоколы",
    integration: "ПЛК линии, MES",
    service: FIXED_SERVICE,
    softwareShare: 0.05,
    implementationShare: 0.3,
    implementationMin: 0.5,
    maintenanceShare: 0.05,
    acquisition: BUY_LEASE,
    lifespanYears: 12,
    limitation: "Ячейка настраивается под конкретную деталь; переналадка — отдельный проект",
    madeToOrder: true,
  },
  AS: {
    label: "автоматизированная система хранения",
    payloadKg: 50,
    weightKg: 3000,
    dimensionsText: "модульная, под объект",
    speedMps: 3,
    throughput: { value: 150, unit: "циклов/ч" },
    autonomyHours: 24,
    powerKw: 10,
    positioningAccuracyMm: 3,
    navigation: "Рельсовые направляющие, энкодеры и штрихкод-позиционирование",
    environment: "indoor",
    minTempC: 1,
    maxTempC: 40,
    ip: "IP54",
    noiseDb: 65,
    maxFloorDeviationMm: 3,
    minCeilingHeightM: 6,
    floor: "Пол FM1–FM2 (ровность до 3 мм/2 м), несущая способность от 5 т/м²",
    charging: "Питание от сети 380 В; шаттлы — суперконденсаторы или АКБ",
    connectivity: "Ethernet, Wi-Fi для шаттлов",
    integration: "WCS системы хранения, интеграция с WMS",
    service: "Сервисный договор интегратора: ТО раз в квартал, склад ЗИП на объекте",
    softwareShare: 0.12,
    implementationShare: 0.5,
    implementationMin: 2,
    maintenanceShare: 0.05,
    acquisition: BUY_LEASE,
    lifespanYears: 15,
    limitation: "Требует подготовленного пола и проекта под конкретное здание; срок внедрения 6–12 месяцев",
    madeToOrder: true,
  },
  CA: {
    label: "система автоматизации крана",
    payloadKg: 0,
    weightKg: 50,
    dimensionsText: "комплект оборудования на кран и пульт",
    speedText: "по характеристикам крана",
    throughput: { value: 20, unit: "подъёмов/ч" },
    autonomyHours: 24,
    powerKw: 0.5,
    positioningAccuracyMm: 50,
    navigation: "Лидары и камеры на кране, датчики положения груза",
    environment: "outdoor",
    minTempC: -40,
    maxTempC: 45,
    ip: "IP65",
    noiseDb: 50,
    floor: "Кран на объекте",
    charging: "Питание от электросети крана",
    connectivity: "4G/LTE, радиоканал",
    integration: "Удалённое управление, запись телеметрии, BIM-модель площадки",
    service: FIXED_SERVICE,
    softwareShare: 0.3,
    implementationShare: 0.3,
    implementationMin: 0.3,
    maintenanceShare: 0.1,
    acquisition: ["purchase", "raas"],
    lifespanYears: 8,
    limitation: "Совместимость с моделью крана подтверждается обследованием",
  },
  FB: {
    label: "робо-кафе",
    payloadKg: 0,
    weightKg: 800,
    dims: [3000, 2000, 2500],
    speedText: "не применимо (стационарный киоск)",
    throughput: { value: 60, unit: "напитков/ч" },
    autonomyHours: 24,
    powerKw: 5,
    positioningAccuracyMm: 0.1,
    navigation: "Не требуется: стационарный киоск",
    environment: "indoor",
    minTempC: 5,
    maxTempC: 35,
    ip: "IP44",
    noiseDb: 60,
    minCeilingHeightM: 2.7,
    floor: "Площадка 6–10 м², подвод воды и канализации",
    charging: "Питание от сети 220/380 В",
    connectivity: "4G/LTE, Wi-Fi",
    integration: "Эквайринг, мобильное приложение, мониторинг остатков",
    service: "Сервис производителя: ежедневная загрузка ингредиентов, ТО раз в месяц",
    softwareShare: 0.05,
    implementationShare: 0.1,
    implementationMin: 0.2,
    maintenanceShare: 0.12,
    acquisition: BUY_LEASE_RENT,
    lifespanYears: 7,
    limitation: "Нужны подвод воды, ежедневная загрузка ингредиентов и санитарная обработка",
  },
  HU: {
    label: "сервисный антропоморфный робот",
    payloadKg: 5,
    weightKg: 80,
    dims: [700, 600, 1600],
    speedMps: 0.8,
    throughput: { value: 30, unit: "консультаций/ч" },
    autonomyHours: 8,
    chargeHours: 3,
    batteryKwh: 1.2,
    powerKw: 0.15,
    positioningAccuracyMm: 50,
    navigation: "Лидарный SLAM, камеры, ультразвуковые датчики",
    environment: "indoor",
    minTempC: 5,
    maxTempC: 40,
    ip: "IP20",
    noiseDb: 45,
    minAisleWidthM: 1,
    maxFloorDeviationMm: 10,
    minCeilingHeightM: 2.2,
    elevatorIntegration: false,
    airsideCertified: false,
    floor: "Ровные полы без ступеней",
    charging: "Зарядная станция с автоподключением",
    connectivity: "Wi-Fi, 4G/LTE",
    integration: "CRM, информационные системы объекта по API",
    service: MOBILE_SERVICE,
    softwareShare: 0.1,
    implementationShare: 0.2,
    implementationMin: 0.2,
    maintenanceShare: 0.1,
    acquisition: BUY_LEASE_RENT,
    lifespanYears: 5,
    limitation: "Сценарии диалога и навигации настраиваются под площадку",
  },
  UA: {
    label: "беспилотное воздушное судно",
    payloadKg: 1,
    weightKg: 7,
    dims: [1000, 1000, 400],
    speedMps: 15,
    throughput: { value: 100, unit: "га/ч" },
    autonomyHours: 0.7,
    chargeHours: 1.5,
    batteryKwh: 0.5,
    powerKw: 1,
    positioningAccuracyMm: 30,
    navigation: "ГНСС (ГЛОНАСС/GPS) RTK/PPK, инерциальная система, автопилот",
    environment: "outdoor",
    minTempC: -20,
    maxTempC: 40,
    ip: "IP43",
    noiseDb: 75,
    airsideCertified: false,
    floor: "Взлётная площадка 5×5 м или катапульта и парашют (самолётный тип)",
    charging: "Зарядное устройство 220 В, комплект сменных аккумуляторов",
    connectivity: "Радиоканал 2,4/5,8 ГГц или 900 МГц, 4G/LTE",
    integration: "Наземная станция управления, выгрузка данных в ГИС и фотограмметрию",
    service: "Сервис производителя: ТО по налёту, ремонт после инцидентов",
    softwareShare: 0.1,
    implementationShare: 0.15,
    implementationMin: 0.2,
    maintenanceShare: 0.1,
    acquisition: BUY_LEASE_RENT,
    lifespanYears: 5,
    limitation: "Полёты требуют постановки на учёт, разрешения на использование воздушного пространства и обученного внешнего пилота",
  },
  MS: {
    label: "безэкипажное надводное судно",
    payloadKg: 100,
    weightKg: 400,
    dims: [3000, 1500, 1000],
    speedMps: 3,
    throughput: { value: 5, unit: "км²/ч" },
    autonomyHours: 8,
    chargeHours: 6,
    batteryKwh: 10,
    powerKw: 3,
    positioningAccuracyMm: 100,
    navigation: "ГНСС RTK, АИС, радар, камеры, эхолот",
    environment: "outdoor",
    minTempC: -5,
    maxTempC: 40,
    ip: "IP67",
    noiseDb: 60,
    floor: "Акватория; спуск со слипа или с борта",
    charging: "Зарядка на берегу или заправка",
    connectivity: "Радиоканал, 4G/LTE у берега, спутниковая связь",
    integration: "Береговой пункт управления, выгрузка данных съёмки",
    service: "Сервис производителя: межнавигационное ТО",
    softwareShare: 0.1,
    implementationShare: 0.15,
    implementationMin: 0.3,
    maintenanceShare: 0.08,
    acquisition: BUY_LEASE_RENT,
    lifespanYears: 8,
    limitation: "Работа ограничена волнением моря; нужен берег или судно обеспечения",
    madeToOrder: true,
  },
  MU: {
    label: "телеуправляемый подводный аппарат",
    payloadKg: 5,
    weightKg: 30,
    dims: [700, 500, 400],
    speedMps: 1,
    throughput: { value: 1, unit: "погружение/ч" },
    autonomyHours: 24,
    powerKw: 2,
    positioningAccuracyMm: 200,
    navigation: "Гидроакустическая навигация, эхолот, камеры, гирокомпас",
    environment: "outdoor",
    minTempC: -2,
    maxTempC: 35,
    ip: "IP68",
    noiseDb: 40,
    floor: "Акватория, глубина до 150–300 м по модели",
    charging: "Питание по кабель-тросу от берегового или судового блока",
    connectivity: "Кабель-трос с оптоволокном",
    integration: "Пульт оператора, запись видео и данных датчиков",
    service: "Сервис производителя: ТО после сезона, ремонт уплотнений",
    softwareShare: 0.05,
    implementationShare: 0.1,
    implementationMin: 0.2,
    maintenanceShare: 0.08,
    acquisition: BUY_LEASE_RENT,
    lifespanYears: 8,
    limitation: "Глубина и дальность ограничены длиной кабеля; нужен обученный оператор",
  },
  SW: {
    label: "программное решение",
    payloadKg: 0,
    dimensionsText: "не применимо — программный продукт",
    speedText: "не применимо",
    throughput: { value: 150, unit: "строк/ч на сотрудника" },
    navigation: "Не применимо",
    environment: "indoor",
    minTempC: 0,
    maxTempC: 40,
    floor: "Не требуется",
    charging: "Серверы или облако; гарнитуры и индикаторы — зарядка от сети",
    connectivity: "Wi-Fi, Ethernet",
    integration: "Интеграция с WMS/ERP по API",
    service: "Техническая поддержка и обновления по подписке",
    softwareShare: 0.2,
    implementationShare: 0.5,
    implementationMin: 0.3,
    maintenanceShare: 0.15,
    acquisition: ["purchase", "raas"],
    lifespanYears: 5,
    limitation: "Эффект зависит от качества данных в WMS и дисциплины персонала",
  },
  OT: {
    label: "робот специального назначения",
    payloadKg: 0,
    weightKg: 100,
    dims: [1000, 700, 1200],
    speedMps: 1,
    autonomyHours: 4,
    chargeHours: 3,
    batteryKwh: 2,
    powerKw: 0.5,
    positioningAccuracyMm: 20,
    navigation: "Лидары, камеры",
    environment: "both",
    minTempC: 0,
    maxTempC: 40,
    ip: "IP54",
    noiseDb: 55,
    floor: "Ровные покрытия",
    charging: "Зарядное устройство 220 В",
    connectivity: "Wi-Fi, 4G/LTE",
    integration: "API производителя",
    service: MOBILE_SERVICE,
    softwareShare: 0.1,
    implementationShare: 0.2,
    implementationMin: 0.2,
    maintenanceShare: 0.1,
    acquisition: BUY_LEASE,
    lifespanYears: 6,
    limitation: "Опытный образец: серийный сервис и запчасти не отлажены",
  },
};

/** Решения вне категорий каталога ФЦ БАС (исследование команды, организатор) — по типу решения. */
const PROFILE_BY_TYPE: Record<string, string> = {
  sorter: "AS",
  conveyor: "AS",
  courier: "DL",
  amr: "AM",
};

// ─── Уточнения по моделям: класс внутри категории сильно разный ─────────────
// Числа — по открытым описаниям моделей и их аналогов, округлены; это оценки.
const BY_ID: Record<string, Partial<Profile>> = {
  // AMR: тягачи и тяжёлые платформы
  AM0002: { payloadKg: 50, weightKg: 40, dims: [600, 450, 350], elevatorIntegration: true, minAisleWidthM: 0.9 },
  AM0007: { payloadKg: 100, weightKg: 60, dims: [800, 550, 300], elevatorIntegration: true, minAisleWidthM: 1 },
  AM0013: { payloadKg: 1000, weightKg: 450, dims: [1500, 800, 1300], throughput: { value: 8, unit: "рейсов/ч" }, elevatorIntegration: true, minAisleWidthM: 1.8, label: "робот-тягач" },
  AM0014: { payloadKg: 30, weightKg: 150, dims: [900, 700, 1600], throughput: { value: 300, unit: "шт/ч" }, label: "робот-комплектовщик" },
  AM0015: { weightKg: 900, dims: [2400, 1200, 400], minAisleWidthM: 2.2 },
  AM0016: { weightKg: 2500, dims: [3000, 1600, 450], minAisleWidthM: 2.5, speedMps: 1 },
  AM0017: { weightKg: 6000, dims: [6000, 2500, 600], minAisleWidthM: 3, speedMps: 0.8, batteryKwh: 40, powerKw: 6, label: "тяжёлая транспортная платформа" },
  AM0018: { weightKg: 3500, dims: [4500, 2200, 550], minAisleWidthM: 2.8, speedMps: 1, batteryKwh: 25, powerKw: 4 },
  AM0019: { payloadKg: 300, weightKg: 250, dims: [1300, 900, 500] },
  // Погрузчики
  FL0003: { payloadKg: 1400, weightKg: 1100, throughput: { value: 12, unit: "паллет/ч" } },
  // Курьеры
  DL0001: { payloadKg: 20, weightKg: 70, dims: [800, 600, 1100], speedMps: 1.4, environment: "outdoor" },
  DL0002: { payloadKg: 10, weightKg: 40, dims: [700, 500, 1000], environment: "indoor", minTempC: 5, maxTempC: 40 },
  // Пожарные и спасательные
  ER0001: {
    label: "роботизированный лафетный ствол",
    batteryKwh: undefined,
    chargeHours: undefined,
    weightKg: 60,
    dims: [700, 500, 700],
    speedText: "не применимо (стационарный ствол, поворот 0–360°)",
    throughput: { value: 60, unit: "л/с" },
    autonomyHours: 24,
    powerKw: 0.5,
    navigation: "ИК-извещатели и видеокамеры наведения на очаг",
    floor: "Стационарная установка на опоре или кровле",
    charging: "Питание 24/220 В от системы пожаротушения",
  },
  ER0002: { weightKg: 800, throughput: { value: 1, unit: "эвакуация/рейс" }, payloadKg: 150 },
  // Инспекция
  IR0001: { weightKg: 25, dims: [600, 500, 300], speedMps: 0.05, throughput: { value: 20, unit: "м шва/ч" }, floor: "Стальные поверхности сосудов и конструкций (магнитные колёса)", environment: "indoor" },
  IR0004: { weightKg: 150, dims: [1500, 500, 500], throughput: { value: 500, unit: "м трубы/ч" } },
  IR0007: {
    weightKg: 250,
    dims: [1500, 1000, 900],
    speedMps: 1,
    throughput: { value: 1, unit: "га/ч" },
    autonomyHours: 6,
    chargeHours: 3,
    batteryKwh: 3,
    navigation: "ГНСС RTK, георадар, лидар",
    environment: "outdoor",
    minTempC: -20,
    ip: "IP65",
    floor: "Грунт, асфальт, уклон до 20°",
    charging: "Зарядное устройство 220 В",
    connectivity: "4G/LTE, радиоканал",
  },
  // Платформы
  UG0001: { payloadKg: 200, weightKg: 450 },
  UG0003: { payloadKg: 500, weightKg: 900 },
  // Полевые
  AG0001: { weightKg: 1400, dims: [2800, 1400, 2100], powerKw: 25, throughput: { value: 0.8, unit: "га/ч" } },
  AG0003: { weightKg: 970, powerKw: 15, batteryKwh: 30, autonomyHours: 8, chargeHours: 6, throughput: { value: 0.5, unit: "га/ч" }, charging: "Зарядка от сети 380 В" },
  AG0004: { weightKg: 4500, powerKw: 90 },
  AG0005: { weightKg: 13000, dims: [7400, 2900, 3700], powerKw: 300, throughput: { value: 8, unit: "га/ч" } },
  // Сбор урожая
  HV0001: { weightKg: 200, speedMps: 1 },
  // Животноводство
  LV0001: { weightKg: 60, dims: [800, 500, 600] },
  LV0003: {
    label: "доильный робот",
    weightKg: 1500,
    dims: [3000, 1500, 2500],
    speedText: "не применимо (стационарный доильный бокс)",
    throughput: { value: 8, unit: "коров/ч" },
    autonomyHours: 24,
    powerKw: 5,
    navigation: "3D-камера и лазеры поиска сосков",
    floor: "Бетонное основание в коровнике, подвод воды и вакуума",
    charging: "Питание от сети 380 В",
  },
  // Беспилотный транспорт
  AV0001: { payloadKg: 500, weightKg: 1500, dims: [3500, 1500, 2200], speedMps: 5, throughput: { value: 30, unit: "продаж/ч" } },
  AV0002: { payloadKg: 2000, weightKg: 3000, speedMps: 7 },
  AV0003: { payloadKg: 20000, weightKg: 8000, dims: [6500, 2500, 3500], speedMps: 7, powerKw: 250, batteryKwh: undefined, charging: "Заправка дизельным топливом" },
  AV0004: { payloadKg: 5000, weightKg: 10000, dims: [7500, 2500, 3300], speedMps: 10, powerKw: 200, batteryKwh: undefined, charging: "Заправка дизельным топливом" },
  AV0005: { payloadKg: 1500, weightKg: 6000, dims: [6000, 2200, 2800], speedMps: 5, throughput: { value: 4, unit: "рейсов/ч" }, batteryKwh: 150, powerKw: 100 },
  AV0006: { label: "беспилотный поезд метро", payloadKg: 110000, weightKg: 280000, dims: [140000, 2700, 3700], speedMps: 22, throughput: { value: 40, unit: "рейсов/ч" }, autonomyHours: 24, powerKw: 2000, batteryKwh: undefined, charging: "Контактный рельс 825 В", positioningAccuracyMm: 200 },
  AV0007: { weightKg: 18000, dims: [7000, 2550, 3900], speedMps: 22, powerKw: 330, batteryKwh: undefined, throughput: { value: 1, unit: "рейс/сутки" }, charging: "Заправка дизельным топливом" },
  AV0008: { payloadKg: 400, weightKg: 1800, dims: [4700, 1800, 1700], speedMps: 14, throughput: { value: 3, unit: "поездки/ч" }, batteryKwh: undefined, powerKw: 110, charging: "Заправка АЗС" },
  // Строительная техника
  CE0001: { weightKg: 20000 },
  CE0002: { weightKg: 10000, dims: [4500, 2000, 3000], throughput: { value: 1500, unit: "м²/ч" } },
  CE0004: { label: "строительный 3D-принтер", weightKg: 2500, dims: [8000, 6000, 4000], speedMps: 0.2, throughput: { value: 1, unit: "м³/ч" }, autonomyHours: 24, powerKw: 15, charging: "Питание от сети 380 В" },
  CE0005: { weightKg: 2434, dims: [2600, 800, 1500], powerKw: 22, speedMps: 0.8, throughput: { value: 3, unit: "м³/ч" }, autonomyHours: 24, charging: "Питание от сети 380 В по кабелю" },
  // Манипуляторы: грузоподъёмность и вылет — из обозначения модели (А25-1720: 25 кг, 1720 мм)
  IM0001: { payloadKg: 25, weightKg: 260 },
  IM0002: { payloadKg: 12, weightKg: 150 },
  IM0003: { payloadKg: 6, weightKg: 60, dims: [600, 400, 1200] },
  IM0004: { payloadKg: 95, weightKg: 600 },
  IM0005: { payloadKg: 6, weightKg: 150 },
  IM0006: { payloadKg: 220, weightKg: 1200, dims: [1800, 1200, 2800], powerKw: 8 },
  IM0007: { label: "дельта-робот", payloadKg: 3, weightKg: 120, dims: [1200, 1200, 1000], speedText: "до 10 м/с (скорость инструмента)", throughput: { value: 6000, unit: "шт/ч" }, positioningAccuracyMm: 0.1 },
  CB0001: { payloadKg: 5, weightKg: 25 },
  CB0002: { payloadKg: 10, weightKg: 35 },
  // Ячейки
  RC0004: { label: "учебная роботизированная ячейка", weightKg: 500, dims: [2000, 1500, 2000], throughput: { value: 30, unit: "циклов/ч" } },
  RC0006: { throughput: { value: 600, unit: "заготовок/ч" } },
  RC0007: { throughput: { value: 900, unit: "заготовок/ч" } },
  RC0009: { label: "робот-лаборант", payloadKg: 1, throughput: { value: 20, unit: "проб/ч" } },
  RC0010: { label: "мобильный строительный комплекс", environment: "outdoor", minTempC: -20, ip: "IP65" },
  // Хранение
  AS0001: { payloadKg: 30 },
  AS0002: { payloadKg: 1000 },
  AS0003: { payloadKg: 50 },
  // Сервисные
  HU0001: { environment: "outdoor", payloadKg: 20, minTempC: -20, ip: "IP54" },
  HU0003: { weightKg: 70, dims: [500, 400, 1800] },
  HU0004: { weightKg: 70, dims: [500, 400, 1800] },
  HU0005: { weightKg: 60, dims: [500, 400, 1750] },
  // БАС: грузовые и самолётного типа
  UA0001: { payloadKg: 1, weightKg: 8 },
  UA0004: { speedMps: 25, autonomyHours: 4, payloadKg: 3, weightKg: 25, dims: [2000, 3000, 600], throughput: { value: 500, unit: "га/ч" } },
  UA0006: { speedMps: 18, autonomyHours: 2, weightKg: 9, dims: [1400, 2200, 300], throughput: { value: 400, unit: "га/ч" } },
  UA0007: { speedMps: 18, autonomyHours: 2, weightKg: 9, dims: [1400, 2200, 300], throughput: { value: 400, unit: "га/ч" } },
  UA0008: { payloadKg: 50, weightKg: 45, dims: [2400, 2400, 700], throughput: { value: 15, unit: "га/ч" }, autonomyHours: 0.25, batteryKwh: 1.5, powerKw: 12 },
  UA0009: { payloadKg: 10, weightKg: 40, throughput: { value: 200, unit: "м² фасада/ч" }, autonomyHours: 0.5 },
  UA0010: { payloadKg: 10, weightKg: 35, throughput: { value: 200, unit: "м² фасада/ч" }, autonomyHours: 0.5 },
  UA0012: { payloadKg: 5, weightKg: 20, throughput: { value: 150, unit: "м² окон/ч" }, autonomyHours: 24, charging: "Питание по кабелю с земли" },
  UA0015: { speedMps: 25, autonomyHours: 5, weightKg: 30, dims: [2000, 3500, 500], throughput: { value: 800, unit: "га/ч" } },
  UA0017: { speedMps: 25, autonomyHours: 3, weightKg: 20, throughput: { value: 600, unit: "га/ч" } },
  UA0019: { weightKg: 2, dims: [400, 400, 200], throughput: { value: 500, unit: "м² обследования/ч" }, autonomyHours: 0.3 },
  UA0020: { speedMps: 22, autonomyHours: 2, weightKg: 10, throughput: { value: 500, unit: "га/ч" } },
  UA0023: { speedMps: 25, autonomyHours: 4, weightKg: 12, throughput: { value: 700, unit: "га/ч" } },
  UA0024: { payloadKg: 30, weightKg: 60, throughput: { value: 2, unit: "рейсов/ч" } },
  UA0025: { payloadKg: 20, weightKg: 45, throughput: { value: 2, unit: "рейсов/ч" } },
  UA0027: { speedMps: 25, autonomyHours: 4, weightKg: 20, throughput: { value: 700, unit: "га/ч" } },
  UA0029: { speedMps: 25, autonomyHours: 4, payloadKg: 3, weightKg: 25, throughput: { value: 500, unit: "га/ч" } },
  UA0030: { payloadKg: 15, weightKg: 40, throughput: { value: 2, unit: "рейсов/ч" }, speedMps: 20, autonomyHours: 0.7 },
  UA0031: { payloadKg: 3, weightKg: 12, throughput: { value: 3, unit: "рейсов/ч" } },
  UA0032: { payloadKg: 10, weightKg: 30, throughput: { value: 2, unit: "рейсов/ч" } },
  UA0033: { batteryKwh: undefined, chargeHours: undefined, charging: "Заправка авиатопливом или бензином", payloadKg: 120, weightKg: 300, dims: [4000, 5000, 1500], throughput: { value: 1, unit: "рейсов/ч" }, speedMps: 25, autonomyHours: 2, powerKw: 60 },
  UA0034: { batteryKwh: undefined, chargeHours: undefined, charging: "Заправка авиатопливом или бензином", payloadKg: 300, weightKg: 700, dims: [5000, 5000, 1800], throughput: { value: 1, unit: "рейсов/ч" }, speedMps: 20, autonomyHours: 1, powerKw: 150 },
  UA0035: { batteryKwh: undefined, chargeHours: undefined, charging: "Заправка авиатопливом", payloadKg: 440, weightKg: 1500, dims: [8000, 10000, 2500], throughput: { value: 1, unit: "рейсов/ч" }, speedMps: 40, autonomyHours: 4, powerKw: 150 },
  UA0036: { speedMps: 22, autonomyHours: 2, weightKg: 12, throughput: { value: 500, unit: "га/ч" } },
  UA0037: { payloadKg: 5, weightKg: 20, throughput: { value: 2, unit: "рейсов/ч" } },
  UA0038: { payloadKg: 5, weightKg: 20, throughput: { value: 2, unit: "рейсов/ч" } },
  UA0039: { payloadKg: 15, weightKg: 40, throughput: { value: 2, unit: "рейсов/ч" } },
  UA0040: { speedMps: 25, autonomyHours: 3, weightKg: 15, throughput: { value: 600, unit: "га/ч" } },
  // Надводные и подводные
  MS0010: { weightKg: 30, dims: [1200, 600, 400], payloadKg: 5 },
  MS0015: { payloadKg: 500, weightKg: 1500, dims: [6000, 2200, 1500] },
  MS0016: { payloadKg: 300, weightKg: 1000, dims: [5000, 2000, 1300] },
  MU0001: { weightKg: 120, dims: [1500, 900, 700] },
  // Робот доставки в помещении из материалов организатора: цена — по рыночной цене аналогов (~16–18 тыс. $).
  EX0001: { priceMln: 1.5, payloadKg: 40, weightKg: 45, dims: [560, 500, 1100], speedMps: 1.2, autonomyHours: 10, chargeHours: 4.5 },
  // Сортеры: интеграция в линию дешевле доли цены самой машины.
  SR0001: { softwareShare: 0.08, implementationShare: 0.25 },
  SR0002: { softwareShare: 0.08, implementationShare: 0.25 },
  // Прочие
  OT0001: { label: "мобильная зарядная станция", weightKg: 1200, dims: [2000, 1200, 1300], batteryKwh: 60, powerKw: 50, throughput: { value: 2, unit: "электромобилей/ч" }, autonomyHours: 12, chargeHours: 6 },
  OT0002: { label: "реабилитационный комплекс", payloadKg: 0, dims: [500, 400, 1100], environment: "indoor", speedText: "не применимо (носимый комплекс)" },
};

// ─── Помощники ───────────────────────────────────────────────────────────────
const round = (value: number, digits = 0) => Math.round(value * 10 ** digits) / 10 ** digits;
/** Округление «как в паспорте»: 2 значащие цифры. */
function nice(value: number): number {
  if (!Number.isFinite(value) || value === 0) return value;
  const magnitude = 10 ** (Math.floor(Math.log10(Math.abs(value))) - 1);
  return round(Math.round(value / magnitude) * magnitude, 6);
}
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const priceOf = (solution: CatalogSolution) => {
  const value = solution.costs?.equipment ?? Number(String(solution.price).replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : undefined;
};
const isEmpty = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === "—" ||
  (typeof value === "string" && value.trim() === "") ||
  (Array.isArray(value) && value.length === 0);

function getPath(target: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((value, part) => (value as Record<string, unknown> | undefined)?.[part], target);
}

function setPath(target: Record<string, unknown>, key: string, value: unknown) {
  const parts = key.split(".");
  let node = target;
  for (const part of parts.slice(0, -1)) {
    node[part] = { ...((node[part] as Record<string, unknown> | undefined) ?? {}) };
    node = node[part] as Record<string, unknown>;
  }
  node[parts[parts.length - 1]!] = value;
}

const nf = (value: number) => value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
const sign = (value: number) => (value > 0 ? `+${value}` : `${value}`);
const ENV_TEXT: Record<Environment, string> = { indoor: "в помещении", outdoor: "на улице", both: "в помещении и на улице" };

export function profileOf(solution: CatalogSolution): Profile | undefined {
  const code = solution.catalogCategory ?? PROFILE_BY_TYPE[solution.solutionType ?? ""];
  const base = code ? PROFILES[code] : undefined;
  if (!base) return undefined;
  const own = BY_ID[solution.id];
  return own ? { ...base, ...own } : base;
}

/**
 * Во сколько раз эта модель «больше» типовой: по грузоподъёмности, массе или цене,
 * что известно. Нужен, чтобы оценки массы, габаритов и энергетики не были
 * одинаковыми для 10-килограммовой тележки и 35-тонного тягача.
 */
function scaleOf(solution: CatalogSolution, profile: Profile, own: Partial<Profile> | undefined): number {
  if (solution.weightKg && profile.weightKg && !own?.weightKg) return clamp(solution.weightKg / profile.weightKg, 0.05, 30);
  if (solution.payloadKg && profile.payloadKg && !own?.payloadKg) return clamp(solution.payloadKg / profile.payloadKg, 0.05, 30);
  return 1;
}

/**
 * Оценённые значения пустых полей решения: ключ — поле карточки
 * (как в fieldSources), значение — то, что записать.
 */
export function estimateFields(solution: CatalogSolution): Record<string, unknown> {
  const profile = profileOf(solution);
  if (!profile) return {};
  const own = BY_ID[solution.id];
  const scale = scaleOf(solution, profile, own);
  // Масса растёт как грузоподъёмность, габариты — как кубический корень, энергетика — почти линейно.
  const massK = own?.weightKg ? 1 : scale;
  const dimK = own?.dims ? 1 : Math.cbrt(scale);
  const energyK = own?.powerKw || own?.batteryKwh ? 1 : Math.pow(scale, 0.8);
  const out: Record<string, unknown> = {};
  const put = (key: string, value: unknown) => {
    if (value === undefined || value === null || (typeof value === "number" && !Number.isFinite(value))) return;
    if (isEmpty(getPath(solution, key))) out[key] = value;
  };

  // Идентификация
  const heavy = profile.madeToOrder || (priceOf(solution) ?? 0) >= 10;
  put("availability", (solution.maturity === "operation" ? (heavy ? "on-order" : "available") : "pilot") as Availability);
  put("trl", solution.maturity === "operation" ? 8 : solution.maturity === "piloting" ? 6 : 4);

  // Технические характеристики
  if (profile.payloadKg !== undefined) {
    const payload = own?.payloadKg ?? (profile.payloadKg === 0 ? 0 : nice(profile.payloadKg * (solution.weightKg && !own?.weightKg && profile.weightKg ? solution.weightKg / profile.weightKg : 1)));
    put("payloadKg", payload);
    if (isEmpty(solution.payload)) put("payload", payload === 0 ? "не перевозит грузы" : `${nf(payload)} кг`);
  }
  if (profile.weightKg !== undefined) put("weightKg", nice(profile.weightKg * massK));
  if (profile.dims) {
    const [l, w, h] = profile.dims.map((d) => Math.round((d * dimK) / 10) * 10) as [number, number, number];
    put("dimensions", `${l}×${w}×${h} мм`);
  } else if (profile.dimensionsText) {
    put("dimensions", profile.dimensionsText);
  }
  // Своя строка модели («стационарный ствол») важнее скорости класса.
  const speedText = own?.speedText ?? (profile.speedMps !== undefined ? `${nf(profile.speedMps)} м/с` : profile.speedText);
  put("speed", speedText);
  if (profile.throughput && isEmpty(solution.throughput)) {
    put("throughput", profile.throughput.value);
    put("throughputUnit", profile.throughput.unit);
  }
  put("autonomyHours", profile.autonomyHours);
  if (profile.autonomyHours !== undefined && profile.autonomyHours < 24) put("chargeHours", profile.chargeHours);
  if (profile.batteryKwh !== undefined) put("batteryKwh", nice(profile.batteryKwh * energyK));
  if (profile.powerKw !== undefined) put("powerKw", nice(profile.powerKw * energyK));
  put("positioningAccuracyMm", profile.positioningAccuracyMm);
  put("navigation", profile.navigation);

  const environment = solution.environment ?? profile.environment;
  put("environment", profile.environment);
  // В отапливаемом помещении мороза нет: нижняя граница класса «−20 °C» тут не к месту.
  const minTempEstimate = environment === "indoor" && (profile.minTempC ?? 0) < 0 ? 0 : profile.minTempC;
  const minTemp = solution.minTempC ?? minTempEstimate;
  const maxTemp = solution.maxTempC ?? profile.maxTempC;
  put("minTempC", minTempEstimate);
  put("maxTempC", profile.maxTempC);
  if (isEmpty(solution.operatingConditions)) {
    const parts = [
      minTemp !== undefined && maxTemp !== undefined ? `${sign(minTemp)}…${sign(maxTemp)} °C` : undefined,
      profile.ip,
      environment ? ENV_TEXT[environment] : undefined,
      profile.conditionsExtra,
    ].filter(Boolean);
    if (parts.length) put("operatingConditions", parts.join(", "));
  }
  put("noiseDb", profile.noiseDb);

  // Инфраструктура: ограничения объекта — только для тех, кому они важны.
  put("minAisleWidthM", profile.minAisleWidthM);
  put("maxFloorDeviationMm", profile.maxFloorDeviationMm);
  put("minCeilingHeightM", profile.minCeilingHeightM);
  // Лифты: роботы для больниц, работающие в здании, вызывают лифт через контроллер —
  // это типично для класса. Уличному курьеру лифт не нужен, поэтому не оцениваем.
  if (environment !== "outdoor") {
    const clinic = solution.objectTypes?.includes("clinic") ?? false;
    put("elevatorIntegration", clinic && profile.elevatorIntegration !== undefined ? true : profile.elevatorIntegration);
  }
  // Допуск на перрон: «есть» — если производитель заявил решение для аэропорта;
  // «нет» — только для техники, работающей в помещении. Уличную технику без заявления
  // оставляем неизвестной: отсутствие допуска — не то, что можно оценить.
  if (profile.airsideCertified !== undefined) {
    const declared = solution.objectFit?.airport === "declared" || solution.objectFit?.airport === "example";
    // Грузовой терминал и терминал — помещения: на перрон такая техника не выезжает.
    if (environment === "indoor") put("airsideCertified", false);
    else if (declared) put("airsideCertified", true);
  }
  put("infrastructure.floor", profile.floor);
  put("infrastructure.charging", profile.charging);
  put("infrastructure.connectivity", profile.connectivity);
  put("infrastructure.integration", profile.integration);
  put("infrastructure.service", profile.service);

  // Экономика: доли цены единицы; внедрение — на проект (пилотный парк).
  if (profile.priceMln !== undefined && priceOf(solution) === undefined) {
    put("price", String(profile.priceMln));
    put("costs.equipment", profile.priceMln);
  }
  const price = priceOf(solution) ?? profile.priceMln;
  if (price !== undefined) {
    if (profile.softwareShare !== undefined) put("costs.software", round(price * profile.softwareShare, 2));
    if (profile.implementationShare !== undefined) {
      put("costs.implementation", round(Math.max(price * profile.implementationShare, profile.implementationMin ?? 0), 2));
    }
    if (profile.maintenanceShare !== undefined) put("costs.maintenancePerYear", round(price * profile.maintenanceShare, 2));
  }
  if (profile.acquisition && !solution.acquisitionModels?.length) put("acquisitionModels", profile.acquisition);
  put("lifespanYears", profile.lifespanYears);
  if (profile.limitation && !solution.limitations?.length) put("limitations", [profile.limitation]);

  return out;
}

/** Поля, у которых отдельного происхождения не ведём (служебные или производные строки). */
const NO_PROVENANCE = new Set(["payload", "throughputUnit"]);

/**
 * Дополняет пустые поля решения оценками команды. Возвращает список оценённых
 * полей (для отчёта сборки). Непустые значения не трогает.
 */
export function applyEstimates(solution: CatalogSolution): string[] {
  const values = estimateFields(solution);
  const keys = Object.keys(values);
  if (!keys.length) return [];
  const record = solution as unknown as Record<string, unknown>;
  const profile = profileOf(solution)!;
  for (const key of keys) {
    setPath(record, key, values[key]);
    if (NO_PROVENANCE.has(key)) continue;
    const provenance: FieldProvenance = {
      confirmed: false,
      sources: [ESTIMATE_SOURCE],
      note: `Оценка по типовым характеристикам класса «${profile.label}» — уточнить у производителя`,
    };
    (solution.fieldSources ??= {})[key] = provenance;
  }
  // Точность «костов» и граница проектных затрат видны в происхождении, а в
  // источнике карточки — что часть полей оценена.
  if (solution.source && !solution.source.includes("оценки команды")) solution.source = `${solution.source}; оценки команды`;
  return keys;
}
