import type { RequestHandler } from "express";

// Одна JSON-строка на запрос: её разбирает любой сборщик логов, и по полю ms
// видно, какие маршруты медленные. Query-строку не пишем — в ней могут быть данные.
export const requestLog: RequestHandler = (req, res, next) => {
  if (req.path === "/api/health") return next();
  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    console.log(
      JSON.stringify({
        t: new Date().toISOString(),
        method: req.method,
        path: req.originalUrl.split("?")[0],
        status: res.statusCode,
        ms: Math.round(ms * 10) / 10,
      }),
    );
  });
  next();
};
