import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { attachSession } from "./middleware/auth.js";
import authRouter from "./routes/auth.js";
import catalogRouter from "./routes/catalog.js";
import projectsRouter from "./routes/projects.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);

// CORS с credentials: true обязателен, иначе браузер не отправит httpOnly-cookie
// сессии на кросс-origin запросы фронтенда (см. auth/* в contracts/openapi.yaml).
const allowedOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";
app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(attachSession);

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

// Каждый роутер монтируется на свой конкретный префикс, а не на общий "/api" —
// иначе router-level middleware вроде requireAuth в projectsRouter перехватывал бы
// вообще все /api/* запросы, включая публичный каталог.
app.use("/api/auth", authRouter);
app.use("/api/projects", projectsRouter);
app.use("/api", catalogRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ message: "Внутренняя ошибка сервера" });
});

app.listen(port, () => {
  console.log(`api listening on :${port}`);
});
