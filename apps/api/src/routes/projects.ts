import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { wrap } from "../asyncHandler.js";
import { currentDataVersion } from "../changeLog.js";
import { DEFAULT_MODEL_VERSION } from "../domain/versions.js";

const router = Router();
router.use(requireAuth);

// Результат считает модуль экономики; здесь проверяем только то, без чего снимок
// не открыть повторно, остальное храним как есть.
const calculationSchema = z
  .object({ payback: z.object({ value: z.string() }).passthrough() })
  .passthrough();

const projectInputSchema = z.object({
  title: z.string().min(1).max(200),
  objectType: z.string().min(1),
  parameters: z.record(z.string()),
  processes: z.array(z.string()).optional(),
  solutionId: z.string().min(1).optional(),
  calculation: calculationSchema.optional(),
  modelVersion: z.string().min(1).max(64).optional(),
});

const projectPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    status: z.enum(["operation", "piloting", "rnd"]),
    parameters: z.record(z.string()),
    processes: z.array(z.string()),
    solutionId: z.string().min(1),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: "Нет изменений" });

const snapshotInputSchema = z.object({
  calculation: calculationSchema,
  solutionId: z.string().min(1).optional(),
  modelVersion: z.string().min(1).max(64).optional(),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

function formatMeta(id: string, createdAt: Date) {
  const date = createdAt.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `РАСЧЁТ №${id} · ${date}`;
}

type SummarySource = { id: string; title: string; createdAt: Date; status: string };

function toSummaryDto(project: SummarySource, payback: string | undefined) {
  return {
    id: project.id,
    title: project.title,
    meta: formatMeta(project.id, project.createdAt),
    payback: payback ?? "—",
    status: project.status,
  };
}

function paybackOf(calculation: unknown) {
  return (calculation as { payback?: { value?: string } } | null)?.payback?.value;
}

function toDetailDto(
  project: SummarySource & {
    objectType: string;
    parameters: unknown;
    processes: string[];
    calculation: unknown;
    solutionId: string | null;
    dataVersion: string;
    modelVersion: string | null;
    calculatedAt: Date | null;
  },
  scenarios: Array<{ id: string; title: string; subtitle: string; tco: number; share: number; delta: string; detail: string | null; recommended: boolean }>,
) {
  return {
    ...toSummaryDto(project, paybackOf(project.calculation)),
    objectType: project.objectType,
    parameters: project.parameters,
    processes: project.processes,
    scenarios,
    calculationId: project.id,
    ...(project.solutionId ? { solutionId: project.solutionId } : {}),
    ...(project.calculatedAt
      ? {
          dataVersion: project.dataVersion,
          modelVersion: project.modelVersion ?? DEFAULT_MODEL_VERSION,
          calculatedAt: project.calculatedAt.toISOString(),
        }
      : {}),
  };
}

type SnapshotRow = {
  id: string;
  createdAt: Date;
  dataVersion: string;
  modelVersion: string;
  solutionId: string | null;
  result: unknown;
};

function toSnapshotDto(row: SnapshotRow) {
  const payback = paybackOf(row.result);
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    dataVersion: row.dataVersion,
    modelVersion: row.modelVersion,
    ...(row.solutionId ? { solutionId: row.solutionId } : {}),
    ...(payback ? { payback } : {}),
  };
}

/**
 * Снимок расчёта: последняя версия лежит в Project (её открывает список),
 * все версии — в ProjectCalculation, чтобы любую можно было воспроизвести.
 */
async function saveSnapshot(
  tx: Prisma.TransactionClient,
  project: { id: string; parameters: unknown; solutionId: string | null },
  input: z.infer<typeof snapshotInputSchema>,
) {
  const dataVersion = await currentDataVersion();
  const modelVersion = input.modelVersion ?? DEFAULT_MODEL_VERSION;
  const solutionId = input.solutionId ?? project.solutionId;
  const snapshot = await tx.projectCalculation.create({
    data: {
      projectId: project.id,
      dataVersion,
      modelVersion,
      solutionId,
      parameters: project.parameters as Prisma.InputJsonValue,
      result: input.calculation as Prisma.InputJsonValue,
    },
  });
  await tx.project.update({
    where: { id: project.id },
    data: {
      calculation: input.calculation as Prisma.InputJsonValue,
      dataVersion,
      modelVersion,
      calculatedAt: snapshot.createdAt,
      solutionId,
    },
  });
  return snapshot;
}

// Список — только проекты текущего пользователя. Изоляция данных между
// пользователями (см. 4.4.3 ТЗ) обеспечивается фильтром по userId на каждом запросе,
// а не проверкой на фронте.
router.get("/", wrap(async (req, res) => {
  const query = listQuerySchema.safeParse(req.query);
  if (!query.success) return res.status(400).json({ message: "Некорректные параметры" });

  // Паспорт объекта и снапшот расчёта целиком для списка не нужны: из снапшота
  // достаём только срок окупаемости, прямо в SQL, чтобы не гонять JSON по сети.
  const items = await prisma.project.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, createdAt: true, status: true },
    take: query.data.limit,
    skip: query.data.offset,
  });
  const paybacks = items.length
    ? await prisma.$queryRaw<Array<{ id: string; payback: string | null }>>`
        SELECT id, calculation #>> '{payback,value}' AS payback
        FROM "Project"
        WHERE id IN (${Prisma.join(items.map((item) => item.id))}) AND calculation IS NOT NULL`
    : [];
  const paybackById = new Map(paybacks.map((row) => [row.id, row.payback ?? undefined]));
  res.json(items.map((item) => toSummaryDto(item, paybackById.get(item.id))));
}));

router.post("/", wrap(async (req, res) => {
  const parsed = projectInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Некорректные данные", issues: parsed.error.issues });

  const { title, objectType, parameters, processes, solutionId, calculation, modelVersion } = parsed.data;
  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        userId: req.user!.id,
        title,
        objectType,
        parameters,
        processes: processes ?? [],
        solutionId: solutionId ?? null,
      },
    });
    if (!calculation) return created;
    await saveSnapshot(tx, created, { calculation, solutionId, modelVersion });
    return tx.project.findUniqueOrThrow({ where: { id: created.id } });
  });
  res.status(201).json(toDetailDto(project, []));
}));

async function loadOwnedProject(userId: string, projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { scenarios: { orderBy: { sortOrder: "asc" } } },
  });
  if (!project || project.userId !== userId) return null;
  return project;
}

router.get("/:projectId", wrap(async (req, res) => {
  const project = await loadOwnedProject(req.user!.id, req.params.projectId);
  if (!project) return res.status(404).json({ message: "Не найден" });
  res.json(toDetailDto(project, project.scenarios));
}));

router.patch("/:projectId", wrap(async (req, res) => {
  const parsed = projectPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Некорректные данные", issues: parsed.error.issues });

  const { count } = await prisma.project.updateMany({
    where: { id: req.params.projectId, userId: req.user!.id },
    data: parsed.data,
  });
  if (count === 0) return res.status(404).json({ message: "Не найден" });
  const project = await loadOwnedProject(req.user!.id, req.params.projectId);
  if (!project) return res.status(404).json({ message: "Не найден" });
  res.json(toDetailDto(project, project.scenarios));
}));

router.get("/:projectId/calculations", wrap(async (req, res) => {
  const owned = await prisma.project.count({ where: { id: req.params.projectId, userId: req.user!.id } });
  if (!owned) return res.status(404).json({ message: "Не найден" });
  const rows = await prisma.projectCalculation.findMany({
    where: { projectId: req.params.projectId },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, dataVersion: true, modelVersion: true, solutionId: true, result: true },
  });
  res.json(rows.map(toSnapshotDto));
}));

router.post("/:projectId/calculations", wrap(async (req, res) => {
  const parsed = snapshotInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Некорректные данные", issues: parsed.error.issues });

  const project = await prisma.project.findFirst({
    where: { id: req.params.projectId, userId: req.user!.id },
    select: { id: true, parameters: true, solutionId: true },
  });
  if (!project) return res.status(404).json({ message: "Не найден" });
  const snapshot = await prisma.$transaction((tx) => saveSnapshot(tx, project, parsed.data));
  res.status(201).json(toSnapshotDto(snapshot));
}));

router.delete("/:projectId", wrap(async (req, res) => {
  // Проект и все связанные загруженные файлы удаляются вместе (см. 4.4.6 ТЗ).
  // Файлы паспорта объекта хранятся не на диске, а как значения в Project.parameters,
  // поэтому каскадное удаление строки проекта уже удаляет всё, что с ним связано.
  // Фильтр по userId в том же запросе: чужой проект не удалится, и лишнего SELECT нет.
  const { count } = await prisma.project.deleteMany({
    where: { id: req.params.projectId, userId: req.user!.id },
  });
  if (count === 0) return res.status(404).json({ message: "Не найден" });
  res.status(204).end();
}));

// Копирование проекта — используется на шаге сравнения сценариев (см. 3.1.3 ТЗ:
// пользователь должен уметь сравнивать не менее трёх сценариев внутри проекта,
// копия — самый быстрый способ завести альтернативный сценарий на основе текущего).
router.post("/:projectId/copy", wrap(async (req, res) => {
  const source = await loadOwnedProject(req.user!.id, req.params.projectId);
  if (!source) return res.status(404).json({ message: "Не найден" });

  const copy = await prisma.project.create({
    data: {
      userId: source.userId,
      title: `${source.title} (копия)`,
      objectType: source.objectType,
      parameters: source.parameters as object,
      processes: source.processes,
      calculation: source.calculation as object | undefined,
      dataVersion: source.dataVersion,
      modelVersion: source.modelVersion,
      calculatedAt: source.calculatedAt,
      solutionId: source.solutionId,
      status: source.status,
      scenarios: {
        create: source.scenarios.map((s) => ({
          title: s.title,
          subtitle: s.subtitle,
          tco: s.tco,
          share: s.share,
          delta: s.delta,
          detail: s.detail,
          recommended: s.recommended,
          sortOrder: s.sortOrder,
        })),
      },
    },
    include: { scenarios: { orderBy: { sortOrder: "asc" } } },
  });
  res.status(201).json(toDetailDto(copy, copy.scenarios));
}));

export default router;
