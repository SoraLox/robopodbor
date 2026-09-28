import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { wrap } from "../asyncHandler.js";
import { currentDataVersion } from "../changeLog.js";
import { DEFAULT_MODEL_VERSION } from "../domain/versions.js";
import { ECONOMICS_MODEL_VERSION, calculateEconomics } from "../domain/economics.js";
import { toSolutionDto } from "../solutionDto.js";
import { loadParameterFields } from "./catalog.js";

const router = Router();

// Демо-расчёт остаётся только под id "demo" (пример на лендинге и в документации).
// Файл одинаково лежит относительно src/ и dist/.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const demoCalculation = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../prisma/seed-data/demo-calculation.json"), "utf8"),
) as Record<string, unknown>;

const requestSchema = z.object({
  objectType: z.string().min(1).max(40),
  solutionId: z.string().min(1).max(64),
  parameters: z.record(z.string(), z.string().max(500)).default({}),
  processes: z.array(z.string().max(40)).max(20).optional(),
});

// Расчёт мастера: паспорт объекта + выбранное решение → экономика (src/domain/economics.ts).
// Результат сохраняется, чтобы ссылка /results/{id} открывалась и после перезагрузки.
router.post("/", wrap(async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Некорректный запрос: нужны objectType и solutionId" });
  const { objectType, solutionId, parameters, processes } = parsed.data;

  const [row, fields] = await Promise.all([
    prisma.catalogSolution.findUnique({ where: { id: solutionId } }),
    loadParameterFields(objectType),
  ]);
  if (!row) return res.status(404).json({ message: "Решение не найдено в каталоге" });
  if (fields.length === 0) return res.status(404).json({ message: "Тип объекта не найден" });

  const economics = calculateEconomics({
    objectType,
    parameters,
    fields,
    solution: toSolutionDto(row),
    ...(processes ? { processes } : {}),
  });
  const dataVersion = await currentDataVersion();
  const saved = await prisma.calculation.create({
    data: {
      userId: req.user?.id ?? null,
      objectType,
      solutionId,
      processes: processes ?? [],
      parameters: parameters as Prisma.InputJsonValue,
      dataVersion,
      modelVersion: ECONOMICS_MODEL_VERSION,
      result: { ...economics, solutionId } as unknown as Prisma.InputJsonValue,
    },
  });
  res.status(201).json({
    ...economics,
    solutionId,
    id: saved.id,
    dataVersion,
    modelVersion: ECONOMICS_MODEL_VERSION,
    calculatedAt: saved.createdAt.toISOString(),
  });
}));

// Сохранённый снапшот проекта видит только владелец (см. 4.4.3 ТЗ). Расчёт мастера —
// по ссылке, как гостевой результат; расчёт вошедшего пользователя — только ему.
router.get("/:calculationId", wrap(async (req, res) => {
  const { calculationId } = req.params;

  const calculation = await prisma.calculation.findUnique({ where: { id: calculationId } });
  if (calculation && (!calculation.userId || calculation.userId === req.user?.id)) {
    res.set("Cache-Control", "private, no-cache");
    return res.json({
      ...(calculation.result as object),
      id: calculation.id,
      dataVersion: calculation.dataVersion,
      modelVersion: calculation.modelVersion,
      calculatedAt: calculation.createdAt.toISOString(),
    });
  }

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

  if (calculationId !== "demo") return res.status(404).json({ message: "Расчёт не найден" });

  res.set("Cache-Control", "private, no-cache");
  res.json({
    ...demoCalculation,
    id: calculationId,
    dataVersion: await currentDataVersion(),
    modelVersion: DEFAULT_MODEL_VERSION,
  });
}));

export default router;
