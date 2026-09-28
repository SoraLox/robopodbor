import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireRole } from "../middleware/auth.js";
import { wrap } from "../asyncHandler.js";
import { diffOf, logChange } from "../changeLog.js";
import { checkValue } from "../domain/parameters.js";
import { SOURCE_KIND_LABEL, type SourceKind } from "../domain/sources.js";
import { toFieldDto } from "./catalog.js";
import { applyCatalogVersion } from "../catalogSync.js";
import { buildCatalog, type CatalogFiles, type CatalogResearch, type CatalogSupplements } from "../domain/robotCatalog.js";
import supplementsJson from "../domain/catalogSupplements.json" with { type: "json" };
import researchJson from "../domain/catalogResearch.json" with { type: "json" };

const router = Router();

const SOURCE_KINDS = Object.keys(SOURCE_KIND_LABEL) as [SourceKind, ...SourceKind[]];

const sourceSchema = z.object({
  title: z.string().trim().min(1).max(200),
  scope: z.string().trim().min(1).max(500),
  kind: z.enum(SOURCE_KINDS),
  url: z.string().trim().url().max(500).optional().or(z.literal("").transform(() => undefined)),
  actualAt: z.string().trim().min(1).max(40),
  confirmed: z.boolean(),
});

type SourceRow = Awaited<ReturnType<typeof prisma.dataSource.findFirstOrThrow>>;

function toSourceDto(row: SourceRow) {
  return {
    id: row.id,
    title: row.title,
    scope: row.scope,
    kind: row.kind,
    ...(row.url ? { url: row.url } : {}),
    actualAt: row.actualAt,
    confirmed: row.confirmed,
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Источники видны всем: на них ссылаются карточки каталога и отчёт (ТЗ 3.7.5).
router.get("/sources", wrap(async (_req, res) => {
  const rows = await prisma.dataSource.findMany({ orderBy: { createdAt: "asc" } });
  res.set("Cache-Control", "public, no-cache");
  res.json(rows.map(toSourceDto));
}));

router.post("/admin/sources", requireRole("admin"), wrap(async (req, res) => {
  const parsed = sourceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Некорректные данные", issues: parsed.error.issues });
  const row = await prisma.dataSource.create({ data: { ...parsed.data, url: parsed.data.url ?? null } });
  await logChange(req, { entity: "source", entityId: row.id, action: "create", summary: `Добавлен источник «${row.title}»` });
  res.status(201).json(toSourceDto(row));
}));

router.put("/admin/sources/:sourceId", requireRole("admin"), wrap(async (req, res) => {
  const parsed = sourceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Некорректные данные", issues: parsed.error.issues });
  const before = await prisma.dataSource.findUnique({ where: { id: req.params.sourceId } });
  if (!before) return res.status(404).json({ message: "Не найден" });
  const row = await prisma.dataSource.update({
    where: { id: before.id },
    data: { ...parsed.data, url: parsed.data.url ?? null },
  });
  const diff = diffOf(before, row);
  if (Object.keys(diff).length > 0) {
    await logChange(req, { entity: "source", entityId: row.id, action: "update", summary: `Изменён источник «${row.title}»`, diff });
  }
  res.json(toSourceDto(row));
}));

router.delete("/admin/sources/:sourceId", requireRole("admin"), wrap(async (req, res) => {
  const before = await prisma.dataSource.findUnique({ where: { id: req.params.sourceId } });
  if (!before) return res.status(404).json({ message: "Не найден" });
  await prisma.dataSource.delete({ where: { id: before.id } });
  await logChange(req, { entity: "source", entityId: before.id, action: "delete", summary: `Удалён источник «${before.title}»` });
  res.status(204).end();
}));

const parameterPatchSchema = z
  .object({
    defaultValue: z.string().max(200),
    min: z.number().finite().nullable(),
    max: z.number().finite().nullable(),
    source: z.string().trim().max(300),
    required: z.boolean(),
    hint: z.string().trim().max(500),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: "Нет изменений" });

// Нормативы и значения по умолчанию паспорта объекта (ТЗ 3.2.5, 3.8.1).
router.patch("/admin/parameters/:fieldId", requireRole("admin"), wrap(async (req, res) => {
  const parsed = parameterPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Некорректные данные", issues: parsed.error.issues });

  const before = await prisma.parameterField.findUnique({ where: { id: req.params.fieldId } });
  if (!before) return res.status(404).json({ message: "Поле не найдено" });

  const patch = parsed.data;
  const next = { ...before, ...patch };
  if (next.min !== null && next.max !== null && next.min > next.max) {
    return res.status(400).json({ message: "Минимум больше максимума — поменяйте значения местами" });
  }
  const dto = toFieldDto(next);
  if (next.defaultValue) {
    const checked = checkValue({ ...dto, required: false }, next.defaultValue);
    if ("error" in checked) return res.status(400).json({ message: `Значение по умолчанию: ${checked.error}` });
    patch.defaultValue = checked.value;
  }

  const row = await prisma.parameterField.update({
    where: { id: before.id },
    data: {
      ...patch,
      ...(patch.source !== undefined ? { source: patch.source || null } : {}),
      ...(patch.hint !== undefined ? { hint: patch.hint || null } : {}),
      ...(patch.defaultValue !== undefined ? { defaultValue: patch.defaultValue || null } : {}),
    },
  });
  const diff = diffOf(before, row);
  if (Object.keys(diff).length > 0) {
    await logChange(req, {
      entity: "parameter",
      entityId: row.id,
      action: "update",
      summary: `Норматив «${row.label}» (${row.objectTypeSlug})`,
      diff,
    });
  }
  res.json(toFieldDto(row));
}));

const changesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  entity: z.enum(["solution", "source", "parameter", "catalog-import"]).optional(),
});

router.get("/admin/changes", requireRole("admin"), wrap(async (req, res) => {
  const query = changesQuerySchema.safeParse(req.query);
  if (!query.success) return res.status(400).json({ message: "Некорректные параметры" });
  const rows = await prisma.changeLog.findMany({
    where: query.data.entity ? { entity: query.data.entity } : {},
    orderBy: { createdAt: "desc" },
    take: query.data.limit,
  });
  res.json(
    rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      ...(row.userEmail ? { userEmail: row.userEmail } : {}),
      entity: row.entity,
      entityId: row.entityId,
      action: row.action,
      summary: row.summary,
      ...(row.diff ? { diff: row.diff } : {}),
    })),
  );
}));

// ─── Новая версия каталога роботов (ТЗ 3.3.2, 3.3.6) ─────────────────────────
// Администратор выбирает папку каталога в браузере; приходят её JSON-файлы с путями
// внутри папки. ?dryRun=1 — только отчёт «что изменится», без записи.
const catalogUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 80 } });
const TOP_LEVEL = { "index.json": "index", "categories.json": "categories", "vendors.json": "vendors", "codes.json": "codes", "sources.json": "sources" } as const;

function catalogFilesOf(files: Express.Multer.File[]): { files: Partial<CatalogFiles>; errors: string[] } {
  const result: Partial<CatalogFiles> & { data: CatalogFiles["data"] } = { data: {} };
  const errors: string[] = [];
  for (const file of files) {
    // «robots_catalog/data/am_mobile_robot.json» → «data/am_mobile_robot.json»; схемы и README не нужны.
    const parts = file.originalname.replace(/\\/g, "/").split("/");
    const name = parts[parts.length - 1]!;
    const inData = parts[parts.length - 2] === "data";
    if (!name.endsWith(".json") || parts.includes("schema")) continue;
    let json: unknown;
    try {
      json = JSON.parse(file.buffer.toString("utf8"));
    } catch {
      errors.push(`${inData ? "data/" : ""}${name}: не JSON`);
      continue;
    }
    if (inData) result.data[`data/${name}`] = json as CatalogFiles["data"][string];
    else if (name in TOP_LEVEL) (result as Record<string, unknown>)[TOP_LEVEL[name as keyof typeof TOP_LEVEL]] = json;
  }
  return { files: result, errors };
}

router.post(
  "/admin/robot-catalog",
  requireRole("admin"),
  catalogUpload.array("files"),
  wrap(async (req, res) => {
    const uploaded = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!uploaded.length) return res.status(422).json({ message: "Файлы каталога не переданы — выберите папку каталога" });
    const { files, errors } = catalogFilesOf(uploaded);
    if (errors.length) return res.status(422).json({ message: `Не удалось прочитать: ${errors.join("; ")}` });

    // Фото хранятся на сайте, а не в каталоге: берём уже известные по ID решения.
    const photos = new Map(
      (await prisma.catalogSolution.findMany({ select: { id: true, photos: true } })).map((row) => [row.id, row.photos]),
    );
    let build;
    try {
      build = buildCatalog(
        files as CatalogFiles,
        supplementsJson as unknown as CatalogSupplements,
        (id) => photos.get(id) ?? [],
        researchJson as unknown as CatalogResearch,
      );
    } catch (error) {
      return res.status(422).json({ message: error instanceof Error ? error.message : "Каталог не собирается" });
    }

    const dryRun = req.query.dryRun === "1";
    const report = await applyCatalogVersion(prisma, build.solutions, { dryRun });
    if (!dryRun && (report.added.length || report.updated.length)) {
      await logChange(req, {
        entity: "catalog-import",
        entityId: `robots-catalog v${build.version.schema} от ${build.version.updated}`,
        action: "import",
        summary: `Каталог роботов v${build.version.schema} от ${build.version.updated}: добавлено ${report.added.length}, обновлено ${report.updated.length}`,
      });
    }
    res.json({
      applied: !dryRun,
      version: build.version,
      total: build.solutions.length,
      fit: build.fit,
      filled: build.filled,
      conflicts: build.conflicts,
      ...report,
    });
  }),
);

export default router;

