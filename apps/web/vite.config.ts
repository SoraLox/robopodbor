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
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
}));
