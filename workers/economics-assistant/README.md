# Посредник чата «Спросить про экономику»

GitHub Pages — статический сайт: ключ Groq в нём хранить нельзя (его увидит любой
посетитель). Этот Cloudflare Worker держит ключ у себя и пересылает вопросы в Groq —
с той же инструкцией для модели, что у API (`apps/api/src/domain/economicsAssistant.ts`).
Бесплатный тариф Cloudflare Workers — 100 000 запросов в сутки.

Развернуть (один раз):

```bash
cd workers/economics-assistant
npm install
npx wrangler login                 # вход в аккаунт Cloudflare в браузере
npx wrangler secret put GROQ_API_KEY
npx wrangler deploy                # напечатает адрес https://robopodbor-assistant.<аккаунт>.workers.dev
```

Опубликован: `https://robopodbor-assistant.robopodbor.workers.dev/economics`
(переменная `ASSISTANT_URL` в репозитории уже задана). Сменить ключ Groq:
`npx wrangler secret put GROQ_API_KEY` — пересобирать сайт не нужно.

Затем в GitHub: Settings → Secrets and variables → Actions → Variables →
`ASSISTANT_URL` = `https://robopodbor-assistant.<аккаунт>.workers.dev/economics`
и перезапустить workflow «Deploy to GitHub Pages». Сайт будет спрашивать посредника.

Разрешённые сайты — `ALLOWED_ORIGINS` в `wrangler.toml`.
