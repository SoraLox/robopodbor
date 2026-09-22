import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/password.js";

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
  solutionsCount: number;
  solutionsCountLabel: string;
  paybackRange: string;
  photoCaption: string;
};

type SolutionJson = {
  id: string;
  name: string;
  vendor: string;
  useCase: string;
  price: string;
  payload: string;
  speed: string;
  maturity: "operation" | "piloting" | "rnd";
  confidence: "confirmed" | "needs-review";
  source?: string;
  sourceDate?: string;
  objectTypes?: string[];
  score?: number;
  scoreFactors?: Array<{ label: string; weight: number }>;
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
  options?: Array<{ value: string; label: string }>;
};

type TaxonomyNodeJson = {
  id: string;
  label: string;
  level: string;
  children?: TaxonomyNodeJson[];
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

    const fields = parametersByType[ot.slug] ?? [];
    await prisma.parameterField.deleteMany({ where: { objectTypeSlug: ot.slug } });
    for (const [index, field] of fields.entries()) {
      await prisma.parameterField.create({
        data: {
          objectTypeSlug: ot.slug,
          label: field.label,
          hint: field.hint,
          unit: field.unit,
          section: field.section,
          kind: field.kind,
          min: field.min,
          max: field.max,
          defaultValue: field.defaultValue,
          options: field.options as never,
          sortOrder: index,
        },
      });
    }
  }
}

async function seedSolutions() {
  const solutions = loadJson<SolutionJson[]>("solutions.json");
  for (const s of solutions) {
    await prisma.catalogSolution.upsert({
      where: { id: s.id },
      update: {},
      create: {
        id: s.id,
        name: s.name,
        vendor: s.vendor,
        useCase: s.useCase,
        price: s.price,
        payload: s.payload,
        speed: s.speed,
        maturity: s.maturity,
        confidence: s.confidence === "needs-review" ? "needs_review" : "confirmed",
        source: s.source,
        sourceDate: s.sourceDate,
        objectTypes: s.objectTypes ?? [],
        score: s.score,
        scoreFactors: s.scoreFactors as never,
      },
    });
  }
}

async function seedTaxonomy() {
  const tree = loadJson<TaxonomyNodeJson[]>("taxonomy.json");
  await prisma.taxonomyNode.deleteMany();

  async function insert(nodes: TaxonomyNodeJson[], parentId: string | null) {
    for (const node of nodes) {
      // Не переиспользуем node.id из фикстур как первичный ключ: один и тот же продукт
      // (например, "p15") встречается листом в нескольких ветках дерева одновременно.
      const created = await prisma.taxonomyNode.create({
        data: { label: node.label, level: node.level, parentId },
      });
      if (node.children?.length) await insert(node.children, created.id);
    }
  }
  await insert(tree, null);
}

async function main() {
  await seedDemoUsers();
  await seedObjectTypesAndParameters();
  await seedSolutions();
  await seedTaxonomy();
  console.log("Сид базы данных выполнен.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
