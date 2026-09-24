import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './styles/globals.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

// После деплоя GitHub Pages чанков прошлой сборки уже нет: вкладка, открытая
// до деплоя, не догружает маршрут и остаётся белой. Перезагружаемся на новую
// сборку, но не чаще раза в 10 с — чтобы не зациклиться, если чанк сломан.
const RELOAD_KEY = 'chunk-reload-at';
window.addEventListener('vite:preloadError', (event) => {
  try {
    if (Date.now() - Number(sessionStorage.getItem(RELOAD_KEY) ?? 0) < 10_000) return;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
});

async function bootstrap() {
  // По умолчанию /api обслуживает MSW поверх contracts/openapi.yaml — это нужно
  // для статического хостинга (GitHub Pages), где настоящего бэкенда быть не может.
  // Когда рядом поднят реальный apps/api (docker-compose, локальный запуск),
  // сборка идёт с VITE_ENABLE_MOCKS=false и запросы уходят на настоящий сервер.
  if (import.meta.env.VITE_ENABLE_MOCKS !== 'false') {
    const { worker } = await import('./mocks/browser');
    await Promise.race([
      worker
        .start({
          onUnhandledRequest: 'bypass',
          serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
        })
        .catch((error) => {
          console.error('[MSW] не удалось запустить воркер, продолжаем без него', error);
        }),
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, 1500);
      }),
    ]);
  }

  const container = document.getElementById('root');
  if (!container) throw new Error('Не найден #root');

  createRoot(container).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <App />
        </HashRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}

void bootstrap();
