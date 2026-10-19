import { askGroq, localAnswer, type EconomicsContext } from "../../../apps/api/src/domain/economicsAssistant";
import { assistantRequestSchema } from "../../../apps/api/src/domain/assistantRequest";

/**
 * Посредник чата «Спросить про экономику» для GitHub Pages: статический сайт не
 * может хранить ключ Groq, поэтому вопрос идёт сюда. Ключ — секрет воркера
 * (GROQ_API_KEY), запросы — только с разрешённых сайтов (ALLOWED_ORIGINS).
 * Та же инструкция для модели и те же пределы, что у API (apps/api).
 */

interface Env {
  GROQ_API_KEY?: string;
  /** Через запятую: https://soralox.github.io,http://localhost:5190 */
  ALLOWED_ORIGINS?: string;
}

// Не больше 20 вопросов за 10 минут с адреса (в пределах экземпляра воркера).
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 20;
const hits = new Map<string, number[]>();
function allowed(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  const ok = list.length < LIMIT;
  if (ok) list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return ok;
}

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const list = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const allow = origin && list.includes(origin) ? origin : "";
  return {
    ...(allow ? { "access-control-allow-origin": allow } : {}),
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "content-type": "application/json; charset=utf-8" } });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("origin");
    const cors = corsHeaders(origin, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (request.method !== "POST" || !url.pathname.endsWith("/economics")) return json({ message: "Не найдено" }, 404, cors);
    if (!cors["access-control-allow-origin"]) return json({ message: "Запрос не с сайта РОБОПОДБОР" }, 403, cors);
    if (!allowed(request.headers.get("cf-connecting-ip") ?? "unknown")) {
      return json({ message: "Слишком много вопросов подряд — попробуйте через несколько минут" }, 429, cors);
    }
    const parsed = assistantRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ message: "Некорректный вопрос" }, 400, cors);
    const { question, history, context } = parsed.data;
    if (env.GROQ_API_KEY) {
      try {
        const { answer } = await askGroq(question, history, context as EconomicsContext, env.GROQ_API_KEY);
        return json({ answer, source: "ai" }, 200, cors);
      } catch (error) {
        console.error("Groq недоступен:", error instanceof Error ? error.message : error);
      }
    }
    return json({ answer: localAnswer(question, context as EconomicsContext), source: "local" }, 200, cors);
  },
};
