/**
 * Что снизит операционные затраты (OPEX) — рычаги из структуры затрат самого
 * расчёта, а не общие советы. У каждого — сумма в год и откуда она:
 *   «расчёт» — прямо из модели (оставшийся ФОТ по ролям, резерв парка);
 *   «оценка» — по допущению, оно названо в тексте (тариф, свой сервис).
 */
import { WAREHOUSE_NORMS, energyPerYear, type WarehouseModel } from "./warehouseEconomics.js";

export interface OpexLever {
  id: string;
  title: string;
  detail: string;
  /** Снижение затрат в год, млн ₽. */
  savingMln: number;
  basis: "calculated" | "estimate";
}

export interface OpexLeversOutput {
  /** OPEX после роботизации в год: сервис + энергия + оставшийся ФОТ, млн ₽. */
  opexYearMln: number;
  parts: Array<{ id: string; label: string; amountMln: number }>;
  levers: OpexLever[];
}

// Двухзонный тариф: ночью электроэнергия заметно дешевле; доля заряда, которую
// можно перенести на ночь при сменной работе. Обе цифры — оценка команды.
const NIGHT_CHARGE_SHARE = 0.6;
const NIGHT_DISCOUNT = 0.5;
// Свой техник после гарантии вместо сервисного контракта поставщика — оценка команды.
const IN_HOUSE_SERVICE_SAVING = 0.25;

const mln = (rub: number) => Math.round(rub / 1e5) / 10;

export function warehouseOpexLevers(model: WarehouseModel): OpexLeversOutput {
  const { purchase, labor, groups, params } = model;
  const pickersLeft = labor.pickerCost * (1 - labor.pickerFraction);
  const forkliftLeft = labor.forkliftCost * (1 - labor.forkliftFraction);
  const levers: OpexLever[] = [];

  if (pickersLeft > 0) {
    const hasArms = groups.some((g) => g.kind === "arm" || g.kind === "sorter");
    levers.push({
      id: "pickers",
      title: "Отбор остаётся за людьми",
      detail: hasArms
        ? `Роборуки и сортер закрывают ${Math.round(labor.pickerFraction * 100)}% работы отборщиков — остальное на людях. Ещё руки на этапе «Отбор» снимут эти затраты.`
        : "На этапе «Отбор» роботов нет — ФОТ отборщиков остаётся целиком. Роборуки или сортер снимут его частично или полностью.",
      savingMln: mln(pickersLeft),
      basis: "calculated",
    });
  }
  if (forkliftLeft > 0) {
    levers.push({
      id: "forklift",
      title: "Перевозка и перегрузка остаются за людьми",
      detail: `Операторы погрузчиков ещё нужны на ${Math.round((1 - labor.forkliftFraction) * 100)}% работы — перегрузка, которую не взяли роботы, или поток без транспорта. Погрузчики-роботы на приёмке и отгрузке снимут эти затраты.`,
      savingMln: mln(forkliftLeft),
      basis: "calculated",
    });
  }

  // Резерв парка: роботов закладываем с запасом WAREHOUSE_NORMS.reserveFactor на поломки и пики.
  let reserveCost = 0;
  let reserveRobots = 0;
  for (const g of groups) {
    if (g.count < 3 || g.kind === "conveyor") continue;
    const withoutReserve = Math.ceil(g.count / WAREHOUSE_NORMS.reserveFactor);
    const spare = g.count - withoutReserve;
    if (spare <= 0) continue;
    reserveRobots += spare;
    reserveCost += spare * g.costs.serviceYear + energyPerYear(g.robot, spare, params);
  }
  if (reserveCost > 0) {
    levers.push({
      id: "reserve",
      title: `Резерв парка — ${reserveRobots} ${reserveRobots === 1 ? "робот" : reserveRobots < 5 ? "робота" : "роботов"}`,
      detail: `Парк заложен с запасом ${Math.round((WAREHOUSE_NORMS.reserveFactor - 1) * 100)}% на поломки и пики. Если пиковые часы можно сгладить графиком, запас не нужен — минус его обслуживание и энергия (и вложения в эти машины).`,
      savingMln: mln(reserveCost),
      basis: "calculated",
    });
  }

  if (purchase.energy > 0) {
    levers.push({
      id: "night",
      title: "Зарядка ночью по двухзонному тарифу",
      detail: `Около ${Math.round(NIGHT_CHARGE_SHARE * 100)}% заряда можно перенести на ночные часы, когда тариф примерно вдвое ниже (оценка; проверьте свой тариф).`,
      savingMln: mln(purchase.energy * NIGHT_CHARGE_SHARE * NIGHT_DISCOUNT),
      basis: "estimate",
    });
  }
  if (purchase.service > 0) {
    levers.push({
      id: "service",
      title: "Свой техник после гарантии",
      detail: `Сервисный контракт поставщика можно заменить обученным техником склада — около ${Math.round(IN_HOUSE_SERVICE_SAVING * 100)}% стоимости обслуживания (оценка команды).`,
      savingMln: mln(purchase.service * IN_HOUSE_SERVICE_SAVING),
      basis: "estimate",
    });
  }

  levers.sort((a, b) => b.savingMln - a.savingMln);
  return {
    opexYearMln: mln(purchase.opexPerYear + purchase.residualLabor),
    parts: [
      { id: "labor", label: "Оставшийся ФОТ", amountMln: mln(purchase.residualLabor) },
      { id: "service", label: "Обслуживание", amountMln: mln(purchase.service) },
      { id: "energy", label: "Электроэнергия", amountMln: mln(purchase.energy) },
    ],
    levers: levers.filter((l) => l.savingMln > 0),
  };
}
