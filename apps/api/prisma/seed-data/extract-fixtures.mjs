// Разовый инструмент миграции: превращает существующие фронтенд-фикстуры
// (apps/web/src/mocks/fixtures.ts) в статичные JSON-файлы для сида базы данных.
// Это не рантайм-зависимость — apps/api не импортирует apps/web ни в проде, ни в dev.
// Запуск: node prisma/seed-data/extract-fixtures.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesPath = path.resolve(__dirname, "../../../web/src/mocks/fixtures.ts");
const tmpPath = path.resolve(__dirname, "._fixtures_stripped.mjs");

let src = readFileSync(fixturesPath, "utf8");
src = src.replace(/^import type \{[\s\S]*?\} from ['"]@\/api\/types['"];?\n/m, "");
src = src.replace(/export const (\w+): [^=\n]+= /g, "export const $1 = ");

writeFileSync(tmpPath, src, "utf8");
const mod = await import(`file://${tmpPath}?t=${Date.now()}`);

const outDir = __dirname;
writeFileSync(path.join(outDir, "object-types.json"), JSON.stringify(mod.objectTypes, null, 2));
writeFileSync(path.join(outDir, "solutions.json"), JSON.stringify(mod.solutions, null, 2));
writeFileSync(path.join(outDir, "object-parameters.json"), JSON.stringify(mod.objectParameters, null, 2));
writeFileSync(path.join(outDir, "taxonomy.json"), JSON.stringify(mod.taxonomy, null, 2));

console.log("Готово: object-types.json, solutions.json, object-parameters.json, taxonomy.json");
