import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/password.js";
import { DEFAULT_SOURCES } from "../src/domain/sources.js";
import type { CatalogSolution } from "../src/domain/catalog.js";
import { applyCatalogVersion } from "../src/catalogSync.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "seed-data");
const prisma = new PrismaClient();

function loadJson<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(dataDir, file), "utf8"));
}

type ObjectTypeJson = {
  slug: string;
  title: string;
  description: string;
  solutionsCount?: number;
  solutionsCountLabel?: string;
  paybackRange: string;
  photoCaption: string;
};

type ParameterFieldJson = {
  id: string;
  label: string;
  hint?: string;
  unit?: string;
  section?: string;
  kind: "number" | "text" | "select";
  min?: number;
  max?: number;
  defaultValue?: string;
  required?: boolean;
  source?: string;
  options?: Array<{ value: string; label: string }>;
};

async function seedDemoUsers() {
  // Демо-учётки нужны для сдачи проекта (см. 8.2.5 ТЗ): пароли захешированы,
  // а не зашиты в код фронтенда, как это было в MSW-версии.
  const accounts = [
    { email: "krylov@volga-logistic.ru", password: "volga123", name: "Дмитрий Крылов", organization: "Волга-Логистик", role: "user" as const },
    { email: "admin@robotopodbor.ru", password: "admin123", name: "Администратор", organization: "РОБОПОДБОР", role: "admin" as const },
  ];
  for (const acc of accounts) {
    const passwordHash = await hashPassword(acc.password);
    await prisma.user.upsert({
      where: { email: acc.email },
      update: {},
      create: { email: acc.email, passwordHash, name: acc.name, organization: acc.organization, role: acc.role },
    });
  }
}

async function seedObjectTypesAndParameters() {
  const objectTypes = loadJson<ObjectTypeJson[]>("object-types.json");
  const parametersByType = loadJson<Record<string, ParameterFieldJson[]>>("object-parameters.json");

  for (const ot of objectTypes) {
    await prisma.objectTypeDef.upsert({
      where: { slug: ot.slug },
      update: {
        title: ot.title,
        description: ot.description,
        photoCaption: ot.photoCaption,
        paybackRange: ot.paybackRange,
        solutionsCountLabel: ot.solutionsCountLabel,
      },
      create: {
        slug: ot.slug,
        title: ot.title,
        description: ot.description,
        photoCaption: ot.photoCaption,
        paybackRange: ot.paybackRange,
        solutionsCountLabel: ot.solutionsCountLabel,
      },
    });

    // id поля — стабильный ключ из датасета (wh_…, ap_…, cl_…): по нему работают
    // импорт паспорта и правила подбора. Структура поля обновляется из сида,
    // а обязательность, значение по умолчанию, диапазон и источник — нет: их правит администратор.
    const fields = parametersByType[ot.slug] ?? [];
    await prisma.parameterField.deleteMany({
      where: { objectTypeSlug: ot.slug, id: { notIn: fields.map((field) => field.id) } },
    });
    for (const [index, field] of fields.entries()) {
      const structure = {
        label: field.label,
        hint: field.hint,
        unit: field.unit,
        section: field.section,
        kind: field.kind,
        options: field.options as never,
        sortOrder: index,
      };
      await prisma.parameterField.upsert({
        where: { id: field.id },
        update: structure,
        create: {
          id: field.id,
          objectTypeSlug: ot.slug,
          ...structure,
          required: field.required ?? true,
          min: field.min,
          max: field.max,
          defaultValue: field.defaultValue,
          source: field.source,
        },
      });
    }
  }
}

// Демо-решения до получения каталога роботов: выдуманные, из базы удаляются.
const DEMO_SOLUTION_IDS = [
  "p15", "s20", "srt8", "ams", "drone", "p22", "wf3", "srt3", "bg12",
  "ams1", "ams3", "sanit1", "courier1", "ivchassis", "towtug", "gseasrs", "droneair", "floorclean",
];

async function seedSolutions() {
  await prisma.catalogSolution.deleteMany({ where: { id: { in: DEMO_SOLUTION_IDS } } });

  // Собирается из seed-data/robots-catalog скриптом build-catalog.ts. Характеристики
  // обновляются из каталога, правки администратора остаются (src/catalogSync.ts).
  const solutions = JSON.parse(
    readFileSync(path.join(__dirname, "../src/domain/catalogSolutions.json"), "utf8"),
  ) as CatalogSolution[];
  const report = await applyCatalogVersion(prisma, solutions);
  console.log(
    `Каталог: добавлено ${report.added.length}, обновлено ${report.updated.length}, без изменений ${report.unchanged}` +
      (report.keptAdmin.length ? `, с правками администратора ${report.keptAdmin.length}` : "") +
      (report.missing.length ? `, нет в каталоге ${report.missing.length}` : ""),
  );
}

async function seedDataSources() {
  if ((await prisma.dataSource.count()) > 0) return;
  await prisma.dataSource.createMany({ data: DEFAULT_SOURCES });
}

async function main() {
  await seedDemoUsers();
  await seedObjectTypesAndParameters();
  await seedSolutions();
  await seedDataSources();
  console.log("Сид базы данных выполнен.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
