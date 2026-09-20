import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ command }) => ({
  // Проект-страница GitHub Pages живёт в подпути /robopodbor/;
  // локальный dev-сервер и сборка для Docker/Sourcecraft остаются на корне.
  base: command === 'build' && process.env.GH_PAGES === 'true' ? '/robopodbor/' : '/',
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: { port: 5173, open: false },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
}));
