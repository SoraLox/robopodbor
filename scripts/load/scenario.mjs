// Нагрузочный тест (ТЗ 4.3.1): N пользователей одновременно проходят основной сценарий
// гостя — типы объектов → паспорт → каталог → подбор → расчёт → открытие отчёта.
// Запуск: node scripts/load/scenario.mjs [базовый URL API] [пользователей] [секунд]
const BASE = process.argv[2] ?? 'http://localhost:4000/api';
const USERS = Number(process.argv[3] ?? 50);
const SECONDS = Number(process.argv[4] ?? 60);

const OBJECTS = [
  { objectType: 'warehouse', solutionId: 'FL0002', processes: ['transport', 'receiving'] },
  { objectType: 'airport', solutionId: 'FC0001', processes: ['cleaning'] },
  { objectType: 'clinic', solutionId: 'AM0002', processes: ['delivery'] },
];

const stats = new Map();
let errors = 0;
const errorSamples = [];

async function call(name, path, init) {
  const started = performance.now();
  try {
    const res = await fetch(BASE + path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
    const body = await res.text();
    const ms = performance.now() - started;
    const s = stats.get(name) ?? { times: [], fail: 0 };
    s.times.push(ms);
    if (!res.ok) {
      s.fail += 1;
      errors += 1;
      if (errorSamples.length < 5) errorSamples.push(`${name} ${res.status} ${body.slice(0, 120)}`);
    }
    stats.set(name, s);
    return res.ok ? JSON.parse(body) : null;
  } catch (error) {
    errors += 1;
    if (errorSamples.length < 5) errorSamples.push(`${name} ${error}`);
    return null;
  }
}

async function user(index, deadline) {
  let round = 0;
  while (performance.now() < deadline) {
    const o = OBJECTS[(index + round) % OBJECTS.length];
    round += 1;
    await call('GET /object-types', '/object-types');
    await call('GET parameters', `/object-types/${o.objectType}/parameters`);
    await call('GET catalog', `/catalog/solutions?objectType=${o.objectType}`);
    await call('POST /selection', '/selection', { method: 'POST', body: JSON.stringify({ objectType: o.objectType, parameters: {} }) });
    const calc = await call('POST /calculations', '/calculations', { method: 'POST', body: JSON.stringify({ ...o, parameters: {} }) });
    if (calc) await call('GET /calculations/:id', `/calculations/${calc.id}`);
  }
}

const q = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
const t0 = performance.now();
await Promise.all(Array.from({ length: USERS }, (_, i) => user(i, t0 + SECONDS * 1000)));
const elapsed = (performance.now() - t0) / 1000;

let total = 0;
console.log(`Пользователей: ${USERS}, длительность: ${elapsed.toFixed(1)} с, API: ${BASE}`);
console.log('Запрос'.padEnd(24), 'кол-во', '  p50 мс', '  p95 мс', '  p99 мс', '  max мс', 'ошибок');
for (const [name, s] of stats) {
  const sorted = [...s.times].sort((a, b) => a - b);
  total += sorted.length;
  console.log(name.padEnd(24), String(sorted.length).padStart(6), ...[0.5, 0.95, 0.99].map((p) => q(sorted, p).toFixed(0).padStart(8)), sorted.at(-1).toFixed(0).padStart(8), String(s.fail).padStart(6));
}
console.log(`Всего запросов: ${total}, ${(total / elapsed).toFixed(0)} в секунду, ошибок: ${errors}`);
for (const sample of errorSamples) console.log('  пример ошибки:', sample);
