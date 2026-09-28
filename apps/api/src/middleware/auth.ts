import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db.js";
import { wrap } from "../asyncHandler.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; email: string; name: string; organization: string | null; role: "user" | "admin" };
    }
  }
}

const SESSION_COOKIE = "sid";

// Читает сессию по cookie на каждый запрос и, если она валидна и не истекла,
// прикрепляет пользователя к req.user. Не блокирует запрос сама по себе —
// для этого есть requireAuth/requireRole ниже.
export const attachSession = wrap(async (req, _res, next) => {
  const sid = req.cookies?.[SESSION_COOKIE];
  if (!sid) return next();

  // passwordHash и прочие поля пользователя на каждый запрос не нужны.
  const session = await prisma.session.findUnique({
    where: { id: sid },
    select: {
      expiresAt: true,
      user: { select: { id: true, email: true, name: true, organization: true, role: true } },
    },
  });
  if (!session) return next();
  if (session.expiresAt < new Date()) {
    await prisma.session.deleteMany({ where: { id: sid } });
    return next();
  }

  req.user = session.user;
  next();
});

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const GUEST_CALCULATION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

// Истёкшие сессии и старые гостевые расчёты, к которым больше никто не обратится, иначе копились бы вечно.
export function startSessionSweeper() {
  const sweep = () => {
    prisma.session
      .deleteMany({ where: { expiresAt: { lt: new Date() } } })
      .catch((error) => console.error("[sessions] не удалось очистить истёкшие сессии", error));
    // Гостевые расчёты мастера живут 90 дней: дольше ссылку на них никто не хранит.
    prisma.calculation
      .deleteMany({ where: { userId: null, createdAt: { lt: new Date(Date.now() - GUEST_CALCULATION_TTL_MS) } } })
      .catch((error) => console.error("[calculations] не удалось очистить старые расчёты", error));
  };
  void sweep();
  const timer = setInterval(sweep, SWEEP_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ message: "Требуется вход" });
  next();
}

export function requireRole(role: "admin") {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: "Требуется вход" });
    if (req.user.role !== role) return res.status(403).json({ message: "Недостаточно прав" });
    next();
  };
}

export { SESSION_COOKIE };
