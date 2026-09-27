import type { CatalogSolution as SolutionRow } from "@prisma/client";
import { withCompleteness, type CatalogSolution } from "./domain/catalog.js";

// В базе значение enum называется needs_review (идентификатор Prisma), в контракте — needs-review.
export function toSolutionDto(row: SolutionRow): CatalogSolution {
  const dto: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null || key === "createdAt" || key === "updatedAt") continue;
    dto[key] = value;
  }
  dto.confidence = row.confidence === "needs_review" ? "needs-review" : "confirmed";
  return withCompleteness(dto as unknown as CatalogSolution);
}
