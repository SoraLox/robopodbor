import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import { prisma } from "../db.js";
import { wrap } from "../asyncHandler.js";
import { currentDataVersion } from "../changeLog.js";
import { DEFAULT_MODEL_VERSION } from "../domain/versions.js";

const router = Router();

// Движок расчёта на бэкенде ещё не подключён: как и контрактный мок, для гостевого
// пути отдаём демо-расчёт. Файл одинаково лежит относительно src/ и dist/.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const demoCalculation = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../prisma/seed-data/demo-calculation.json"), "utf8"),
) as Record<string, unknown>;

// Сохранённый снапшот расчёта видит только владелец проекта (см. 4.4.3 ТЗ);
// для всех остальных id — демо-расчёт, как в гостевом сценарии мастера.
router.get("/:calculationId", wrap(async (req, res) => {
  const { calculationId } = req.params;

  if (req.user) {
    const project = await prisma.project.findFirst({
      where: { id: calculationId, userId: req.user.id },
      select: { calculation: true, dataVersion: true, modelVersion: true, calculatedAt: true },
    });
    if (project?.calculation) {
      return res.json({
        ...(project.calculation as object),
        id: calculationId,
        dataVersion: project.dataVersion,
        modelVersion: project.modelVersion ?? DEFAULT_MODEL_VERSION,
        ...(project.calculatedAt ? { calculatedAt: project.calculatedAt.toISOString() } : {}),
      });
    }
    // Снимок из истории проекта (ТЗ 3.1.5) — тоже только для владельца.
    const snapshot = await prisma.projectCalculation.findFirst({
      where: { id: calculationId, project: { userId: req.user.id } },
      select: { result: true, dataVersion: true, modelVersion: true, createdAt: true },
    });
    if (snapshot) {
      return res.json({
        ...(snapshot.result as object),
        id: calculationId,
        dataVersion: snapshot.dataVersion,
        modelVersion: snapshot.modelVersion,
        calculatedAt: snapshot.createdAt.toISOString(),
      });
    }
  }

  res.set("Cache-Control", "private, no-cache");
  res.json({
    ...demoCalculation,
    id: calculationId,
    dataVersion: await currentDataVersion(),
    modelVersion: DEFAULT_MODEL_VERSION,
  });
}));

export default router;
