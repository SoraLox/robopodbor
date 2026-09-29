// Собирает каталог решений приложения из папки каталога роботов (robots-catalog, v2).
// Результат — src/domain/catalogSolutions.json: его читают сид базы и MSW-моки фронтенда.
// Запуск из apps/api: npx tsx prisma/seed-data/build-catalog.ts [папка каталога]
//
// Правила сборки — в src/domain/robotCatalog.ts, тот же модуль загружает новую
// версию каталога из админки.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCatalog,
  type CatalogFiles,
  type CatalogResearch,
  type CatalogSupplements,
} from "../../src/domain/robotCatalog.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const catalogDir = path.resolve(process.argv[2] ?? path.join(here, "robots-catalog"));
const photosDir = path.resolve(here, "../../../web/public/robots_photo");
const outFile = path.resolve(here, "../../src/domain/catalogSolutions.json");
const supplementsFile = path.resolve(here, "../../src/domain/catalogSupplements.json");
const researchFile = path.resolve(here, "../../src/domain/catalogResearch.json");

const read = (file: string) => JSON.parse(readFileSync(path.join(catalogDir, file), "utf8"));

export function readCatalogFolder(): CatalogFiles {
  const categories = read("categories.json") as CatalogFiles["categories"];
  return {
    index: read("index.json"),
    categories,
    vendors: read("vendors.json"),
    codes: read("codes.json"),
    sources: read("sources.json"),
    data: Object.fromEntries(categories.items.map((category) => [category.file, read(category.file)])),
  };
}

function photosById(): Map<string, string[]> {
  const byId = new Map<string, string[]>();
  for (const file of readdirSync(photosDir).sort()) {
    const match = /^([A-Z]{2}\d{4})(?:_\d+)?\.(png|jpe?g|jfif|webp)$/i.exec(file);
    if (!match) continue;
    byId.set(match[1]!, [...(byId.get(match[1]!) ?? []), file]);
  }
  return byId;
}

const photos = photosById();
const supplements = JSON.parse(readFileSync(supplementsFile, "utf8")) as CatalogSupplements;
const research = JSON.parse(readFileSync(researchFile, "utf8")) as CatalogResearch;
const build = buildCatalog(readCatalogFolder(), supplements, (id) => photos.get(id) ?? [], research);

writeFileSync(outFile, `${JSON.stringify(build.solutions, null, 2)}\n`);
console.log(
  `Готово: ${build.solutions.length} решений, каталог v${build.version.schema} от ${build.version.updated} → ${path.relative(process.cwd(), outFile)}`,
);
for (const [objectType, fit] of Object.entries(build.fit)) {
  console.log(`  ${objectType}: заявлено ${fit.declared}, пример организатора ${fit.example}, выведено ${fit.inferred}`);
}
if (build.filled.length) console.log(`Дополнено из материалов организатора:\n  ${build.filled.join("\n  ")}`);
if (build.researched.length) console.log(`Дополнено из открытых источников:\n  ${build.researched.join("\n  ")}`);
if (build.conflicts.length) {
  console.log(`Расхождения с каталогом (не перезаписаны, передать ответственному за каталог):\n  ${build.conflicts.join("\n  ")}`);
}
