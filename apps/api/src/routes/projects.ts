import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const projectInputSchema = z.object({
  title: z.string().min(1),
  objectType: z.string().min(1),
  parameters: z.record(z.string()),
  processes: z.array(z.string()).optional(),
});

function formatMeta(id: string, createdAt: Date) {
  const date = createdAt.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `РАСЧЁТ №${id} · ${date}`;
}

function toSummaryDto(project: { id: string; title: string; createdAt: Date; status: string; calculation: unknown }) {
  const calc = project.calculation as { payback?: { value?: string } } | null;
  return {
    id: project.id,
    title: project.title,
    meta: formatMeta(project.id, project.createdAt),
    payback: calc?.payback?.value ?? "—",
    status: project.status,
  };
}

function toDetailDto(
  project: {
    id: string;
    title: string;
    createdAt: Date;
    status: string;
    objectType: string;
    parameters: unknown;
    processes: string[];
    calculation: unknown;
  },
  scenarios: Array<{ id: string; title: string; subtitle: string; tco: number; share: number; delta: string; detail: string | null; recommended: boolean }>,
) {
  return {
    ...toSummaryDto(project),
    objectType: project.objectType,
    parameters: project.parameters,
    processes: project.processes,
    scenarios,
    calculationId: project.id,
  };
}

// Список — только проекты текущего пользователя. Изоляция данных между
// пользователями (см. 4.4.3 ТЗ) обеспечивается фильтром по userId на каждом запросе,
// а не проверкой на фронте.
router.get("/", async (req, res) => {
  const items = await prisma.project.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" },
  });
  res.json(items.map(toSummaryDto));
});

router.post("/", async (req, res) => {
  const parsed = projectInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Некорректные данные", issues: parsed.error.issues });

  const { title, objectType, parameters, processes } = parsed.data;
  const project = await prisma.project.create({
    data: {
      userId: req.user!.id,
      title,
      objectType,
      parameters,
      processes: processes ?? [],
    },
  });
  res.status(201).json(toDetailDto(project, []));
});

async function loadOwnedProject(userId: string, projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { scenarios: { orderBy: { sortOrder: "asc" } } },
  });
  if (!project || project.userId !== userId) return null;
  return project;
}

router.get("/:projectId", async (req, res) => {
  const project = await loadOwnedProject(req.user!.id, req.params.projectId);
  if (!project) return res.status(404).json({ message: "Не найден" });
  res.json(toDetailDto(project, project.scenarios));
});

router.delete("/:projectId", async (req, res) => {
  const project = await loadOwnedProject(req.user!.id, req.params.projectId);
  if (!project) return res.status(404).json({ message: "Не найден" });
  // Проект и все связанные загруженные файлы удаляются вместе (см. 4.4.6 ТЗ).
  // Файлы паспорта объекта хранятся не на диске, а как значения в Project.parameters,
  // поэтому каскадное удаление строки проекта уже удаляет всё, что с ним связано.
  await prisma.project.delete({ where: { id: project.id } });
  res.status(204).end();
});

// Копирование проекта — используется на шаге сравнения сценариев (см. 3.1.3 ТЗ:
// пользователь должен уметь сравнивать не менее трёх сценариев внутри проекта,
// копия — самый быстрый способ завести альтернативный сценарий на основе текущего).
router.post("/:projectId/copy", async (req, res) => {
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
});

export default router;
