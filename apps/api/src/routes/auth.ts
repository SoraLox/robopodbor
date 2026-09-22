import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { hashPassword, verifyPassword } from "../password.js";
import { SESSION_COOKIE } from "../middleware/auth.js";

const router = Router();

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней
const isProd = process.env.NODE_ENV === "production";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  organization: z.string().optional(),
  name: z.string().optional(),
});

function toUserDto(user: { id: string; email: string; name: string; organization: string | null; role: string }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    organization: user.organization ?? undefined,
    role: user.role,
  };
}

async function openSession(res: import("express").Response, userId: string) {
  const session = await prisma.session.create({
    data: { userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  res.cookie(SESSION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: SESSION_TTL_MS,
  });
}

router.post("/register", async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Некорректные данные", issues: parsed.error.issues });

  const { email, password, organization, name } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ message: "Пользователь уже существует" });

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, passwordHash, organization, name: name ?? email.split("@")[0], role: "user" },
  });

  await openSession(res, user.id);
  res.status(201).json(toUserDto(user));
});

router.post("/login", async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Некорректные данные" });

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return res.status(401).json({ message: "Неверная пара логин/пароль" });
  }

  await openSession(res, user.id);
  res.json(toUserDto(user));
});

router.post("/logout", async (req, res) => {
  const sid = req.cookies?.[SESSION_COOKIE];
  if (sid) await prisma.session.deleteMany({ where: { id: sid } });
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.status(204).end();
});

router.get("/session", (req, res) => {
  if (!req.user) return res.status(401).json({ message: "Сессии нет" });
  res.json(toUserDto(req.user));
});

export default router;
