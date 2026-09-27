import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './styles/globals.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

// Статический хостинг (GitHub Pages) не умеет отдавать index.html на любой путь,
// поэтому там остаётся hash-роутинг. За nginx (docker) SPA-фолбэк есть, и сборка
// идёт с VITE_ROUTER=browser: чистые URL индексируются и не теряют якоря.
const useBrowserHistory = import.meta.env.VITE_ROUTER === 'browser';
const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

// Старые ссылки вида /#/catalog продолжают работать после перехода на чистые URL.
if (useBrowserHistory && window.location.hash.startsWith('#/')) {
  window.history.replaceState(null, '', `${basename}${window.location.hash.slice(1)}`);
}

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

  const Router = useBrowserHistory ? BrowserRouter : HashRouter;

  createRoot(container).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <Router {...(useBrowserHistory ? { basename } : {})}>
          <App />
        </Router>
      </QueryClientProvider>
    </StrictMode>,
  );
}

void bootstrap();
