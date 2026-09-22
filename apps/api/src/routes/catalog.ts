import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();

router.get("/catalog/solutions", async (req, res) => {
  const objectType = typeof req.query.objectType === "string" ? req.query.objectType : undefined;
  const items = await prisma.catalogSolution.findMany({
    where: objectType ? { objectTypes: { has: objectType } } : undefined,
    orderBy: { score: "desc" },
  });
  res.json(items);
});

const solutionSchema = z.object({
  name: z.string().min(1),
  vendor: z.string().min(1),
  useCase: z.string().min(1),
  price: z.string().min(1),
  payload: z.string().min(1),
  speed: z.string().min(1),
  maturity: z.enum(["operation", "piloting", "rnd"]),
  confidence: z.enum(["confirmed", "needs-review"]),
  source: z.string().optional(),
  sourceDate: z.string().optional(),
  objectTypes: z.array(z.string()).optional(),
  score: z.number().optional(),
  scoreFactors: z.array(z.object({ label: z.string(), weight: z.number() })).optional(),
});

// Изменение каталога — только администратор (см. 3.1.4, 3.3.5 ТЗ: ручное управление
// каталогом через админский интерфейс остаётся основным способом, автопарсинг опционален).
router.put("/catalog/solutions/:solutionId", requireRole("admin"), async (req, res) => {
  const parsed = solutionSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Некорректные данные" });

  const existing = await prisma.catalogSolution.findUnique({ where: { id: req.params.solutionId } });
  if (!existing) return res.status(404).json({ message: "Не найдено" });

  const updated = await prisma.catalogSolution.update({
    where: { id: req.params.solutionId },
    data: parsed.data as never,
  });
  res.json(updated);
});

router.delete("/catalog/solutions/:solutionId", requireRole("admin"), async (req, res) => {
  await prisma.catalogSolution.deleteMany({ where: { id: req.params.solutionId } });
  res.status(204).end();
});

router.post("/catalog/solutions", requireRole("admin"), async (req, res) => {
  const parsed = solutionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Некорректные данные", issues: parsed.error.issues });
  const created = await prisma.catalogSolution.create({ data: parsed.data as never });
  res.status(201).json(created);
});

function buildTaxonomyTree(nodes: Array<{ id: string; label: string; level: string; parentId: string | null }>) {
  const byParent = new Map<string | null, typeof nodes>();
  for (const node of nodes) {
    const bucket = byParent.get(node.parentId) ?? [];
    bucket.push(node);
    byParent.set(node.parentId, bucket);
  }
  function attach(parentId: string | null): unknown[] {
    return (byParent.get(parentId) ?? []).map((node) => ({
      id: node.id,
      label: node.label,
      level: node.level,
      children: attach(node.id),
    }));
  }
  return attach(null);
}

router.get("/catalog/taxonomy", async (_req, res) => {
  const nodes = await prisma.taxonomyNode.findMany();
  res.json(buildTaxonomyTree(nodes));
});

router.get("/object-types", async (_req, res) => {
  const items = await prisma.objectTypeDef.findMany({ include: { parameters: false } });
  const withCounts = await Promise.all(
    items.map(async (item) => {
      const solutionsCount = await prisma.catalogSolution.count({ where: { objectTypes: { has: item.slug } } });
      return {
        slug: item.slug,
        title: item.title,
        description: item.description,
        photoCaption: item.photoCaption ?? "",
        paybackRange: item.paybackRange ?? "",
        solutionsCount,
        solutionsCountLabel: item.solutionsCountLabel ?? `${solutionsCount} решений`,
      };
    }),
  );
  res.json(withCounts);
});

router.get("/object-types/:slug/parameters", async (req, res) => {
  const fields = await prisma.parameterField.findMany({
    where: { objectTypeSlug: req.params.slug },
    orderBy: { sortOrder: "asc" },
  });
  res.json(
    fields.map((f) => ({
      id: f.id,
      label: f.label,
      hint: f.hint ?? undefined,
      unit: f.unit ?? undefined,
      section: f.section ?? undefined,
      kind: f.kind,
      min: f.min ?? undefined,
      max: f.max ?? undefined,
      defaultValue: f.defaultValue ?? undefined,
      options: f.options ?? undefined,
    })),
  );
});

export default router;
