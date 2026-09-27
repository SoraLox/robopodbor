import type { Request } from "express";
import { prisma } from "./db.js";
import { cached, invalidateReference } from "./referenceCache.js";

type Change = {
  entity: "solution" | "source" | "parameter" | "catalog-import";
  entityId: string;
  action: "create" | "update" | "delete" | "import";
  summary: string;
  diff?: unknown;
};

/** Запись в журнал изменений справочников и сброс кеша — одним вызовом после каждой правки. */
export async function logChange(req: Request, change: Change) {
  await prisma.changeLog.create({
    data: {
      userEmail: req.user?.email ?? null,
      entity: change.entity,
      entityId: change.entityId,
      action: change.action,
      summary: change.summary,
      diff: change.diff === undefined ? undefined : (change.diff as object),
    },
  });
  invalidateReference();
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/**
 * Версия исходных данных = момент последней правки каталога, нормативов или
 * источников. Сохраняется в снапшоте расчёта (ТЗ 3.1.5): по ней видно, на каких
 * данных был сделан расчёт и менялись ли они с тех пор.
 */
export function currentDataVersion(): Promise<string> {
  return cached("data-version", async () => {
    const last = await prisma.changeLog.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    if (!last) return "data-seed";
    const d = last.createdAt;
    return `data-${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
  });
}

/** Поля, значения которых отличаются, — для журнала «было → стало». */
export function diffOf(before: Record<string, unknown>, after: Record<string, unknown>) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    if (key === "updatedAt" || key === "createdAt") continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changes[key] = { from: before[key] ?? null, to: after[key] ?? null };
    }
  }
  return changes;
}
