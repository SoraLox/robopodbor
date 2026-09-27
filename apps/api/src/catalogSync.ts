/**
 * Применение версии каталога роботов к базе: общий путь для сида и загрузки
 * новой версии из админки. Характеристики обновляются из каталога, кроме полей,
 * которые правил администратор (mergeCatalogVersion). Решения, которых нет в новой
 * версии, не удаляются — на них могут ссылаться проекты; они попадают в отчёт.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import type { CatalogSolution } from "./domain/catalog.js";
import { mergeCatalogVersion } from "./domain/robotCatalog.js";
import { toSolutionDto } from "./solutionDto.js";

type Named = { id: string; name: string };

export interface CatalogSyncReport {
  added: Named[];
  updated: Array<Named & { fields: string[] }>;
  unchanged: number;
  /** Были в базе из каталога, но в этой версии их нет. Не удалены. */
  missing: Named[];
  /** Решения, в которых сохранены правки администратора. */
  keptAdmin: Array<Named & { fields: string[] }>;
}

const JSON_COLUMNS = new Set(["scoreFactors", "infrastructure", "costs", "objectFit", "fieldSources"]);
const SYSTEM_COLUMNS = new Set(["id", "createdAt", "updatedAt"]);

/** Карточка → данные Prisma. Полей, которых больше нет в карточке, в базе тоже не остаётся. */
function toRowData(next: CatalogSolution, existing?: CatalogSolution): Record<string, unknown> {
  const { completeness: _completeness, confidence, ...rest } = next;
  const data: Record<string, unknown> = { ...rest, confidence: confidence === "needs-review" ? "needs_review" : "confirmed" };
  for (const key of Object.keys(existing ?? {})) {
    if (key in data || SYSTEM_COLUMNS.has(key) || key === "completeness") continue;
    const previous = (existing as unknown as Record<string, unknown>)[key];
    data[key] = Array.isArray(previous) ? [] : JSON_COLUMNS.has(key) ? Prisma.DbNull : null;
  }
  return data;
}

export async function applyCatalogVersion(
  prisma: PrismaClient,
  solutions: CatalogSolution[],
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<CatalogSyncReport> {
  const rows = await prisma.catalogSolution.findMany();
  const existing = new Map(rows.map((row) => [row.id, toSolutionDto(row)]));
  const report: CatalogSyncReport = { added: [], updated: [], unchanged: 0, missing: [], keptAdmin: [] };
  const writes: Prisma.PrismaPromise<unknown>[] = [];

  for (const incoming of solutions) {
    const before = existing.get(incoming.id);
    const { next, changed, keptAdmin } = mergeCatalogVersion(before, incoming);
    const named = { id: incoming.id, name: incoming.name };
    if (keptAdmin.length) report.keptAdmin.push({ ...named, fields: keptAdmin });
    if (!before) {
      report.added.push(named);
      writes.push(prisma.catalogSolution.create({ data: toRowData(next) as never }));
    } else if (changed.length) {
      report.updated.push({ ...named, fields: changed });
      writes.push(prisma.catalogSolution.update({ where: { id: incoming.id }, data: toRowData(next, before) as never }));
    } else {
      report.unchanged += 1;
    }
  }

  const incomingIds = new Set(solutions.map((solution) => solution.id));
  for (const solution of existing.values()) {
    // Решения, заведённые вручную (без категории каталога), к версии каталога не относятся.
    if (solution.catalogCategory && !incomingIds.has(solution.id)) {
      report.missing.push({ id: solution.id, name: solution.name });
    }
  }

  if (!dryRun && writes.length) await prisma.$transaction(writes);
  return report;
}
