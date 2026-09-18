import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './styles/globals.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

async function bootstrap() {
  // В dev весь /api обслуживает MSW — бэкенд для запуска не нужен.
  if (import.meta.env.DEV) {
    const { worker } = await import('./mocks/browser');
    await Promise.race([
      worker.start({ onUnhandledRequest: 'bypass' }).catch((error) => {
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
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}

void bootstrap();
