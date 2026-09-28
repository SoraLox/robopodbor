import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ command }) => ({
  // Проект-страница GitHub Pages живёт в подпути /robopodbor/;
  // локальный dev-сервер и сборка для Docker/Sourcecraft остаются на корне.
  base: command === 'build' && process.env.GH_PAGES === 'true' ? '/robopodbor/' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Правила подбора, паспорта и каталога — общие с API, чтобы MSW-моки
      // и настоящий бэкенд давали одинаковый результат.
      '@domain': path.resolve(__dirname, '../api/src/domain'),
    },
  },
  server: {
    port: 5173,
    open: false,
    fs: { allow: [path.resolve(__dirname, '.'), path.resolve(__dirname, '../api/src/domain')] },
    // Нужен только при VITE_ENABLE_MOCKS=false: с моками запросы перехватывает MSW.
    proxy: { '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:4000' },
  },
  build: {
    rollupOptions: {
      output: {
        // Вендоры меняются реже кода приложения: отдельные чанки сохраняют хеш
        // между релизами, и после деплоя браузер перекачивает только своё.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|@remix-run)\//.test(id)) return 'react-vendor';
          if (/node_modules\/three\//.test(id)) return 'three';
          // recharts сюда не выносим: Rollup затянул бы в его чанк общие зависимости
          // (clsx и т. п.), и стартовая страница стала бы предзагружать все графики.
          return undefined;
        },
      },
    },
  },
  test: {
    globals: true,
    // Половина ядер: jsdom-файлы тяжёлые, при 7 процессах на 8 ядрах они душили
    // друг друга — общий прогон был и медленнее, и с таймаутами (замер 27.09.2026).
    maxWorkers: '50%',
    // lucide-react — 3,5 тыс. модулей иконок: без предсборки каждый тестовый файл
    // тратил на их импорт ~0,5 с. Собранные в один модуль грузятся за ~40 мс.
    // web — для jsdom (проект dom), ssr — для Node (проект unit).
    deps: {
      optimizer: {
        web: { enabled: true, include: ['lucide-react'] },
        ssr: { enabled: true, include: ['lucide-react'] },
      },
    },
    /*
      Чистая логика (*.test.ts) идёт в Node без jsdom и без MSW-сервера из
      setup.ts: каждому файлу это стоило ~1 с запуска, а под общей нагрузкой —
      в разы больше. Компоненты (*.test.tsx) — в jsdom с моками API.
    */
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./src/test/setup.ts'],
          css: true,
          // Тест мастера — рендер с MSW и событиями ввода: поодиночке 0,7–2 с, на
          // нагруженной машине в 3–4 раза дольше. 15 с — запас, а не маскировка:
          // зависание всё равно упадёт.
          testTimeout: 15_000,
        },
      },
    ],
  },
}));
