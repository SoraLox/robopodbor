import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { hashPassword, verifyPassword } from "../password.js";
import { SESSION_COOKIE, requireAuth } from "../middleware/auth.js";
import { wrap } from "../asyncHandler.js";

const router = Router();

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней
const isProd = process.env.NODE_ENV === "production";
// Сайт и API на разных доменах (GitHub Pages + сервер): браузер отправит cookie
// в кросс-сайтовом запросе только с SameSite=None; Secure.
const crossSite = process.env.CROSS_SITE_COOKIES === "true";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  organization: z.string().optional(),
  name: z.string().optional(),
});

type UserRow = {
  id: string;
  email: string;
  name: string;
  organization: string | null;
  role: string;
  createdAt?: Date;
  passwordChangedAt?: Date | null;
};

function toUserDto(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    organization: user.organization ?? undefined,
    role: user.role,
    ...(user.createdAt ? { createdAt: user.createdAt.toISOString() } : {}),
    ...(user.passwordChangedAt ? { passwordChangedAt: user.passwordChangedAt.toISOString() } : {}),
  };
}

const profileSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    organization: z.string().trim().max(200),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: "Нет изменений" });

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6).max(200),
});

const SOLUTION_ID = z.string().trim().min(1).max(100);

async function openSession(res: import("express").Response, userId: string) {
  const session = await prisma.session.create({
    data: { userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  res.cookie(SESSION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: crossSite ? "none" : "lax",
    secure: isProd || crossSite,
    path: "/",
    maxAge: SESSION_TTL_MS,
  });
}

router.post("/register", wrap(async (req, res) => {
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
}));

router.post("/login", wrap(async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Некорректные данные" });

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return res.status(401).json({ message: "Неверная пара логин/пароль" });
  }

  await openSession(res, user.id);
  res.json(toUserDto(user));
}));

router.post("/logout", wrap(async (req, res) => {
  const sid = req.cookies?.[SESSION_COOKIE];
  if (sid) await prisma.session.deleteMany({ where: { id: sid } });
  res.clearCookie(SESSION_COOKIE, { path: "/", ...(crossSite ? { sameSite: "none" as const, secure: true } : {}) });
  res.status(204).end();
}));

router.get("/session", (req, res) => {
  if (!req.user) return res.status(401).json({ message: "Сессии нет" });
  res.json(toUserDto(req.user));
});

// ─── Личный кабинет: профиль, пароль, избранное ─────────────────────────────

router.patch("/profile", requireAuth, wrap(async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Некорректные данные: имя не может быть пустым" });
  const { name, organization } = parsed.data;
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      // Пустая строка — организацию убрали.
      ...(organization !== undefined ? { organization: organization || null } : {}),
    },
  });
  res.json(toUserDto(user));
}));

// Смена пароля: нужен текущий пароль; остальные сессии пользователя закрываются.
router.post("/password", requireAuth, wrap(async (req, res) => {
  const parsed = passwordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Новый пароль — не короче 6 символов" });
  const { currentPassword, newPassword } = parsed.data;
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    return res.status(400).json({ message: "Текущий пароль указан неверно" });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ message: "Новый пароль совпадает с текущим" });
  }
  const passwordHash = await hashPassword(newPassword);
  const sid = req.cookies?.[SESSION_COOKIE] as string | undefined;
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash, passwordChangedAt: new Date() } }),
    prisma.session.deleteMany({ where: { userId: user.id, ...(sid ? { id: { not: sid } } : {}) } }),
  ]);
  res.status(204).end();
}));

async function favoritesOf(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { favoriteSolutionIds: true } });
  return user?.favoriteSolutionIds ?? [];
}

router.get("/favorites", requireAuth, wrap(async (req, res) => {
  res.set("Cache-Control", "private, no-cache");
  res.json(await favoritesOf(req.user!.id));
}));

// Новые — в начало списка: в кабинете сверху последние сохранённые.
router.put("/favorites/:solutionId", requireAuth, wrap(async (req, res) => {
  const parsed = SOLUTION_ID.safeParse(req.params.solutionId);
  if (!parsed.success) return res.status(400).json({ message: "Некорректный id решения" });
  const exists = await prisma.catalogSolution.findUnique({ where: { id: parsed.data }, select: { id: true } });
  if (!exists) return res.status(404).json({ message: "Решение не найдено в каталоге" });
  const current = await favoritesOf(req.user!.id);
  const next = [parsed.data, ...current.filter((id) => id !== parsed.data)].slice(0, 500);
  await prisma.user.update({ where: { id: req.user!.id }, data: { favoriteSolutionIds: next } });
  res.json(next);
}));

router.delete("/favorites/:solutionId", requireAuth, wrap(async (req, res) => {
  const current = await favoritesOf(req.user!.id);
  const next = current.filter((id) => id !== req.params.solutionId);
  if (next.length !== current.length) {
    await prisma.user.update({ where: { id: req.user!.id }, data: { favoriteSolutionIds: next } });
  }
  res.json(next);
}));

export default router;
