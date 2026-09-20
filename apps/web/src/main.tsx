import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './styles/globals.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

async function bootstrap() {
  // Бэкенда в этом репозитории нет — весь /api и в dev, и в проде
  // обслуживает MSW поверх contracts/openapi.yaml.
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
