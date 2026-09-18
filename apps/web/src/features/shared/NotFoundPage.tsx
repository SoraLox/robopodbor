import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { AppShell } from '@/app/AppShell';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <AppShell>
      <div className="px-5 py-16 text-center">
        <div className="font-heading text-[72px] font-bold leading-none tabular tracking-display text-primary">
          404
        </div>
        <h1 className="mt-4 font-heading text-[22px] font-bold uppercase tracking-h1">
          Страница не найдена
        </h1>
        <p className="mx-auto mt-3 max-w-[380px] text-xs leading-[1.5] text-muted-foreground">
          Проверьте адрес или начните новый расчёт — это четыре минуты.
        </p>
        <Button asChild size="lg" className="mt-6">
          <Link to="/calculate/warehouse">
            Начать расчёт
            <ArrowUpRight className="size-3.5" strokeWidth={2.5} />
          </Link>
        </Button>
      </div>
    </AppShell>
  );
}

export default NotFoundPage;
