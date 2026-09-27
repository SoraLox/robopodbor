import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import multer from "multer";
import { prisma } from "./db.js";
import { attachSession, startSessionSweeper } from "./middleware/auth.js";
import { requestLog } from "./requestLog.js";
import authRouter from "./routes/auth.js";
import calculationsRouter from "./routes/calculations.js";
import adminRouter from "./routes/admin.js";
import catalogRouter from "./routes/catalog.js";
import projectsRouter from "./routes/projects.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);

// API стоит за nginx: без этого req.ip — адрес прокси, а req.secure всегда false.
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS ?? 1));

// CORS с credentials: true обязателен, иначе браузер не отправит httpOnly-cookie
// сессии на кросс-origin запросы фронтенда (см. auth/* в contracts/openapi.yaml).
const allowedOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";
app.use(helmet());
app.use(requestLog);
app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ message: "База данных недоступна" });
  }
});

app.use(attachSession);

// Каждый роутер монтируется на свой конкретный префикс, а не на общий "/api" —
// иначе router-level middleware вроде requireAuth в projectsRouter перехватывал бы
// вообще все /api/* запросы, включая публичный каталог.
app.use("/api/auth", authRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/calculations", calculationsRouter);
app.use("/api", catalogRouter);
app.use("/api", adminRouter);

app.use("/api", (_req, res) => {
  res.status(404).json({ message: "Не найдено" });
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 422;
    return res.status(status).json({ message: "Файл не принят" });
  }
  // Ошибки body-parser: битый JSON — вина клиента, а не 500.
  const type = (err as { type?: string } | null)?.type;
  if (type === "entity.parse.failed") return res.status(400).json({ message: "Некорректный JSON" });
  if (type === "entity.too.large") return res.status(413).json({ message: "Слишком большой запрос" });

  console.error(err);
  res.status(500).json({ message: "Внутренняя ошибка сервера" });
});

const server = app.listen(port, () => {
  console.log(`api listening on :${port}`);
});
// Дольше, чем keepalive_timeout у nginx: иначе Node закрывает соединение, которое
// nginx как раз переиспользует, и клиент получает случайный 502.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

const stopSweeper = startSessionSweeper();

// docker stop шлёт SIGTERM: дожидаемся текущих запросов и закрываем пул БД,
// а не обрываем их через 10 секунд SIGKILL.
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal}: останавливаемся`);
  stopSweeper();
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
  server.closeIdleConnections();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
