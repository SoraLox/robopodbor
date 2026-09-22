import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db.js";

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
export async function attachSession(req: Request, _res: Response, next: NextFunction) {
  const sid = req.cookies?.[SESSION_COOKIE];
  if (!sid) return next();

  const session = await prisma.session.findUnique({ where: { id: sid }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return next();

  req.user = {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    organization: session.user.organization,
    role: session.user.role,
  };
  next();
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
