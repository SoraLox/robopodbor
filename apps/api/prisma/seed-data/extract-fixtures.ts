// Разовый инструмент: превращает фронтенд-фикстуры (apps/web/src/mocks/fixtures.ts)
// в статичные JSON-файлы для сида базы данных. Это не рантайм-зависимость —
// apps/api не импортирует apps/web ни в проде, ни в dev.
// Запуск из apps/api: npx tsx prisma/seed-data/extract-fixtures.ts
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as fixtures from "../../../web/src/mocks/fixtures.js";

const outDir = path.dirname(fileURLToPath(import.meta.url));
const write = (file: string, data: unknown) =>
  writeFileSync(path.join(outDir, file), `${JSON.stringify(data, null, 2)}\n`);

write("object-types.json", fixtures.objectTypes);
write("solutions.json", fixtures.solutions);
write("object-parameters.json", fixtures.objectParameters);
write("demo-calculation.json", fixtures.demoCalculation);

console.log("Готово: object-types.json, solutions.json, object-parameters.json, demo-calculation.json");
