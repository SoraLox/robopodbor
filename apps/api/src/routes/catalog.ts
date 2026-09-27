import { Prisma, type CatalogSolution as SolutionRow, type ParameterField as FieldRow } from "@prisma/client";
import { Router, type Response } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireRole } from "../middleware/auth.js";
import { wrap } from "../asyncHandler.js";
import { cached } from "../referenceCache.js";
import { diffOf, logChange } from "../changeLog.js";
import {
  buildTaxonomy,
  changedFields,
  syncApplicability,
  withAdminEdits,
  withCompleteness,
  type CatalogSolution,
} from "../domain/catalog.js";
import { catalogToRows, rowsToCatalog } from "../domain/catalogTable.js";
import { parseCsv, parseParameterRows, templateRows, toCsv } from "../domain/parameters.js";
import { selectSolutions } from "../domain/selection.js";
import { toSolutionDto } from "../solutionDto.js";

export { toSolutionDto };

const router = Router();

// Справочники отдаются с ETag (express ставит его сам) и no-cache: браузер каждый раз
// перепроверяет ответ и получает дешёвый 304 из кеша процесса. max-age здесь нельзя —
// после правки в админке браузер показал бы старый каталог из своего кеша.
function referenceHeaders(res: Response) {
  res.set("Cache-Control", "public, no-cache");
}

const today = () => new Date().toLocaleDateString("ru-RU");

/** Данные для обновления решения: правленые характеристики получают источник «правка администратора». */
/** Новое решение: всё, что заполнил администратор, — его правка без внешнего источника. */
function createData(input: SolutionInput) {
  const solution = syncApplicability(input as Partial<CatalogSolution>);
  const fieldSources = withAdminEdits(undefined, changedFields({} as CatalogSolution, solution), today());
  return {
    ...toData(solution as Partial<SolutionInput>),
    ...(input.id ? { id: input.id } : {}),
    ...(fieldSources ? { fieldSources: fieldSources as unknown as Prisma.InputJsonValue } : {}),
  };
}

function updateData(existing: SolutionRow, input: Partial<SolutionInput>) {
  const before = toSolutionDto(existing);
  const patch = syncApplicability(input as Partial<CatalogSolution>, before);
  const fieldSources = withAdminEdits(before.fieldSources, changedFields(before, patch), today());
  return {
    ...toData(patch as Partial<SolutionInput>),
    ...(fieldSources ? { fieldSources: fieldSources as unknown as Prisma.InputJsonValue } : {}),
  };
}

const optionalText = z.string().trim().optional();
const optionalNumber = z.number().finite().optional();

const solutionSchema = z.object({
  id: z.string().trim().min(1).max(64).regex(/^[\w-]+$/).optional(),
  name: z.string().trim().min(1),
  vendor: z.string().trim().min(1),
  useCase: z.string().trim().min(1),
  price: z.string().trim().min(1),
  payload: z.string().trim().min(1),
  speed: z.string().trim().min(1),
  maturity: z.enum(["operation", "piloting", "rnd"]),
  confidence: z.enum(["confirmed", "needs-review"]),
  source: optionalText,
  sourceDate: optionalText,
  sourceUrl: z.string().trim().url().optional().or(z.literal("")),
  objectTypes: z.array(z.string()).optional(),
  score: optionalNumber,
  scoreFactors: z.array(z.object({ label: z.string(), weight: z.number(), max: z.number().optional() })).optional(),
  solutionType: optionalText,
  country: optionalText,
  availability: z.enum(["available", "on-order", "pilot"]).optional(),
  payloadKg: optionalNumber,
  weightKg: optionalNumber,
  dimensions: optionalText,
  throughput: optionalNumber,
  throughputUnit: optionalText,
  autonomyHours: optionalNumber,
  positioningAccuracyMm: optionalNumber,
  navigation: optionalText,
  operatingConditions: optionalText,
  environment: z.enum(["indoor", "outdoor", "both"]).optional(),
  minTempC: optionalNumber,
  maxTempC: optionalNumber,
  noiseDb: optionalNumber,
  minAisleWidthM: optionalNumber,
  maxFloorDeviationMm: optionalNumber,
  minCeilingHeightM: optionalNumber,
  elevatorIntegration: z.boolean().optional(),
  airsideCertified: z.boolean().optional(),
  infrastructure: z
    .object({ floor: optionalText, charging: optionalText, connectivity: optionalText, integration: optionalText, service: optionalText })
    .optional(),
  costs: z
    .object({ equipment: optionalNumber, software: optionalNumber, implementation: optionalNumber, maintenancePerYear: optionalNumber })
    .optional(),
  acquisitionModels: z.array(z.enum(["purchase", "leasing", "raas"])).optional(),
  lifespanYears: optionalNumber,
  processes: z.array(z.string()).optional(),
  limitations: z.array(z.string()).optional(),
  cases: z.array(z.string()).optional(),
  unconfirmedFields: z.array(z.string()).optional(),
  catalogCategory: z.string().trim().regex(/^[A-Z]{2}$/, "код категории каталога — две латинские буквы").optional(),
  trl: z.number().int().min(1).max(9).optional(),
  photos: z.array(z.string().trim().regex(/^[\w-]+\.(png|jpe?g|webp)$/i, "имя файла фото: ID.webp, ID_2.jpg")).optional(),
  objectFit: z.record(z.string(), z.enum(["declared", "example", "inferred"])).optional(),
  // Считается сервером; присланное клиентом значение игнорируется.
  completeness: z.number().optional(),
});

type SolutionInput = z.infer<typeof solutionSchema>;

function toData(input: Partial<SolutionInput>) {
  const { completeness: _completeness, confidence, id: _id, ...rest } = input;
  const data: Record<string, unknown> = { ...rest };
  if (confidence) data.confidence = confidence === "needs-review" ? "needs_review" : "confirmed";
  if (rest.sourceUrl === "") data.sourceUrl = null;
  return data as Prisma.CatalogSolutionUncheckedCreateInput;
}

function issuesMessage(error: z.ZodError) {
  return error.issues.map((issue) => `${issue.path.join(".") || "тело"}: ${issue.message}`).join("; ");
}

function loadSolutions(objectType?: string) {
  return cached(`solutions:${objectType ?? "*"}`, async () => {
    const rows = await prisma.catalogSolution.findMany({
      where: objectType ? { objectTypes: { has: objectType } } : undefined,
      orderBy: { score: "desc" },
    });
    return rows.map(toSolutionDto);
  });
}

router.get("/catalog/solutions", wrap(async (req, res) => {
  const objectType = typeof req.query.objectType === "string" ? req.query.objectType : undefined;
  referenceHeaders(res);
  res.json(await loadSolutions(objectType));
}));

// Изменение каталога — только администратор (см. 3.1.4, 3.3.5 ТЗ: ручное управление
// каталогом через админский интерфейс остаётся основным способом, автопарсинг опционален).
router.post("/catalog/solutions", requireRole("admin"), wrap(async (req, res) => {
  const parsed = solutionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: `Некорректные данные: ${issuesMessage(parsed.error)}` });
  const created = await prisma.catalogSolution.create({
    data: createData(parsed.data),
  });
  await logChange(req, { entity: "solution", entityId: created.id, action: "create", summary: `Добавлено решение «${created.name}»` });
  res.status(201).json(toSolutionDto(created));
}));

router.put("/catalog/solutions/:solutionId", requireRole("admin"), wrap(async (req, res) => {
  const parsed = solutionSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: `Некорректные данные: ${issuesMessage(parsed.error)}` });

  const existing = await prisma.catalogSolution.findUnique({ where: { id: req.params.solutionId } });
  if (!existing) return res.status(404).json({ message: "Не найдено" });

  const updated = await prisma.catalogSolution.update({
    where: { id: req.params.solutionId },
    data: updateData(existing, parsed.data),
  });
  const diff = diffOf(existing as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>);
  if (Object.keys(diff).length) {
    await logChange(req, {
      entity: "solution",
      entityId: updated.id,
      action: "update",
      summary: `Изменено решение «${updated.name}»: ${Object.keys(diff).join(", ")}`,
      diff,
    });
  }
  res.json(toSolutionDto(updated));
}));

router.delete("/catalog/solutions/:solutionId", requireRole("admin"), wrap(async (req, res) => {
  const existing = await prisma.catalogSolution.findUnique({ where: { id: req.params.solutionId }, select: { id: true, name: true } });
  if (!existing) return res.status(204).end();
  await prisma.catalogSolution.delete({ where: { id: existing.id } });
  await logChange(req, { entity: "solution", entityId: existing.id, action: "delete", summary: `Удалено решение «${existing.name}»` });
  res.status(204).end();
}));

// Файлы держим в памяти: они маленькие и сразу разбираются, на диск не пишутся.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

function readRows(file: Express.Multer.File): string[][] {
  if (/\.(csv|txt)$/i.test(file.originalname)) return parseCsv(file.buffer.toString("utf8"));
  // Формулы, макросы и внешние ссылки не исполняются: читаются только значения ячеек.
  const book = XLSX.read(file.buffer, { type: "buffer", cellFormula: false, cellHTML: false });
  const sheet = book.Sheets[book.SheetNames[0] ?? ""];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "", blankrows: false });
}

function sendTable(res: Response, rows: string[][], name: string, format: string, sheetName: string) {
  const filename = encodeURIComponent(`${name}.${format === "csv" ? "csv" : "xlsx"}`);
  res.set("Content-Disposition", `attachment; filename*=UTF-8''${filename}`);
  if (format === "csv") {
    res.type("text/csv; charset=utf-8").send(toCsv(rows));
    return;
  }
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = rows[0]?.map((_, i) => ({ wch: i === 0 ? 34 : 22 }));
  XLSX.utils.book_append_sheet(book, sheet, sheetName);
  res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").send(XLSX.write(book, { type: "buffer", bookType: "xlsx" }));
}

// Выгрузка и загрузка таблицы решений (ТЗ 3.3.2 — таблица организатора, 3.8.2 — API импорта).
router.get("/catalog/solutions/export", requireRole("admin"), wrap(async (req, res) => {
  const format = req.query.format === "csv" ? "csv" : "xlsx";
  sendTable(res, catalogToRows(await loadSolutions()), "catalog", format, "Каталог");
}));

router.post("/catalog/solutions/import", requireRole("admin"), upload.single("file"), wrap(async (req, res) => {
  if (!req.file) return res.status(422).json({ message: "Файл не передан" });
  const { items, errors } = rowsToCatalog(readRows(req.file));
  let created = 0;
  let updated = 0;
  for (const { row, data: item } of items) {
    const existing = item.id
      ? await prisma.catalogSolution.findUnique({ where: { id: item.id } })
      : await prisma.catalogSolution.findFirst({ where: { name: item.name!, vendor: item.vendor! } });
    const candidate = existing ? { ...toSolutionDto(existing), ...item } : { price: "0", payload: "—", speed: "—", maturity: "piloting", confidence: "needs-review", useCase: item.name, ...item };
    const parsed = solutionSchema.safeParse(candidate);
    if (!parsed.success) {
      errors.push({ row, message: `«${item.name}»: ${issuesMessage(parsed.error)}` });
      continue;
    }
    if (existing) {
      await prisma.catalogSolution.update({ where: { id: existing.id }, data: updateData(existing, parsed.data) });
      updated += 1;
    } else {
      await prisma.catalogSolution.create({ data: createData(parsed.data) });
      created += 1;
    }
  }
  if (created || updated) {
    await logChange(req, {
      entity: "catalog-import",
      entityId: req.file.originalname,
      action: "import",
      summary: `Импорт каталога из «${req.file.originalname}»: добавлено ${created}, обновлено ${updated}`,
    });
  }
  res.json({ created, updated, errors });
}));

router.get("/catalog/taxonomy", wrap(async (_req, res) => {
  const tree = await cached("taxonomy", async () => buildTaxonomy(await loadSolutions()));
  referenceHeaders(res);
  res.json(tree);
}));

router.get("/object-types", wrap(async (_req, res) => {
  const withCounts = await cached("object-types", async () => {
    const [items, counts] = await Promise.all([
      prisma.objectTypeDef.findMany(),
      // Один агрегирующий запрос вместо count() на каждый тип объекта.
      prisma.$queryRaw<Array<{ slug: string; count: number }>>`
        SELECT t AS slug, count(DISTINCT id)::int AS count
        FROM "CatalogSolution", unnest("objectTypes") AS t
        GROUP BY t`,
    ]);
    const countBySlug = new Map(counts.map((row) => [row.slug, row.count]));
    return items.map((item) => {
      const solutionsCount = countBySlug.get(item.slug) ?? 0;
      return {
        slug: item.slug,
        title: item.title,
        description: item.description,
        photoCaption: item.photoCaption ?? "",
        paybackRange: item.paybackRange ?? "",
        solutionsCount,
        solutionsCountLabel: item.solutionsCountLabel ?? `${solutionsCount} решений`,
      };
    });
  });
  referenceHeaders(res);
  res.json(withCounts);
}));

export function toFieldDto(f: FieldRow) {
  return {
    id: f.id,
    label: f.label,
    hint: f.hint ?? undefined,
    unit: f.unit ?? undefined,
    section: f.section ?? undefined,
    kind: f.kind,
    min: f.min ?? undefined,
    max: f.max ?? undefined,
    defaultValue: f.defaultValue ?? undefined,
    required: f.required,
    source: f.source ?? undefined,
    options: (f.options as Array<{ value: string; label: string }> | null) ?? undefined,
  };
}

export async function loadParameterFields(slug: string) {
  return cached(`parameters:${slug}`, async () => {
    const rows = await prisma.parameterField.findMany({
      where: { objectTypeSlug: slug },
      orderBy: { sortOrder: "asc" },
    });
    return rows.map(toFieldDto);
  });
}

router.get("/object-types/:slug/parameters", wrap(async (req, res) => {
  referenceHeaders(res);
  res.json(await loadParameterFields(req.params.slug));
}));

router.get("/object-types/:slug/parameters/template", wrap(async (req, res) => {
  const fields = await loadParameterFields(req.params.slug);
  if (fields.length === 0) return res.status(404).json({ message: "Тип объекта не найден" });
  const format = req.query.format === "csv" ? "csv" : "xlsx";
  sendTable(res, templateRows(fields), `passport-${req.params.slug}`, format, "Паспорт объекта");
}));

router.post("/object-types/:slug/parameters/import", upload.single("file"), wrap(async (req, res) => {
  if (!req.file) return res.status(422).json({ message: "Файл не передан — выберите файл Excel или CSV" });
  const fields = await loadParameterFields(req.params.slug);
  let rows: string[][];
  try {
    rows = readRows(req.file);
  } catch {
    return res.status(422).json({ message: "Файл не читается — сохраните его как .xlsx или .csv и загрузите снова" });
  }
  const result = parseParameterRows(rows, fields);
  if (result.recognized === 0 && result.errors.length === 0) {
    return res.status(422).json({
      message: "Не распознано ни одно поле — скачайте шаблон и заполните колонку «Значение»",
    });
  }
  res.json(result);
}));

const selectionSchema = z.object({
  objectType: z.string().min(1),
  parameters: z.record(z.string()).optional(),
});

router.post("/selection", wrap(async (req, res) => {
  const parsed = selectionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Некорректный запрос: нужен objectType" });
  const [solutions, fields] = await Promise.all([
    loadSolutions(parsed.data.objectType),
    loadParameterFields(parsed.data.objectType),
  ]);
  res.set("Cache-Control", "no-store");
  res.json(selectSolutions({ objectType: parsed.data.objectType, parameters: parsed.data.parameters ?? {}, solutions, fields }));
}));

export default router;
