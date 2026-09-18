import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { AppShell } from '@/app/AppShell';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DataCard, SectionHeading, Stepper } from '@/shared/components';
import { WIZARD_STEPS } from './wizardSteps';

const PROCESSES = [
  {
    id: 'transport',
    title: 'Внутренняя транспортировка',
    text: 'Перемещение паллет между зонами приёмки, хранения и отгрузки.',
    share: '38% операций',
  },
  {
    id: 'storage',
    title: 'Хранение и подача',
    text: 'Высотное хранение, подача паллет на пост комплектации.',
    share: '24% операций',
  },
  {
    id: 'picking',
    title: 'Комплектация заказов',
    text: 'Штучный и коробочный отбор, формирование сборных паллет.',
    share: '21% операций',
  },
  {
    id: 'sorting',
    title: 'Сортировка',
    text: 'Распределение заказов по направлениям отгрузки.',
    share: '11% операций',
  },
  {
    id: 'inventory',
    title: 'Инвентаризация',
    text: 'Пересчёт остатков в стеллажах, сверка с WMS.',
    share: '6% операций',
  },
];

export function ProcessesPage() {
  const navigate = useNavigate();
  const { objectType = 'warehouse' } = useParams<{ objectType: string }>();
  const [selected, setSelected] = useState<string[]>(['transport', 'storage', 'picking']);

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );

  return (
    <AppShell>
      <Stepper
        steps={WIZARD_STEPS}
        current={2}
        onStepClick={(index) =>
          navigate(index === 0 ? `/calculate/${objectType}` : `/calculate/${objectType}/form`)
        }
      />

      <div className="px-5 py-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-6">
          <SectionHeading size="h1">Процессы</SectionHeading>
          <p className="max-w-[420px] text-xs leading-[1.5] text-muted-foreground">
            Отметьте операции, которые планируете автоматизировать. От набора зависит,
            какие классы решений попадут в расчёт.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {PROCESSES.map((process) => {
            const isSelected = selected.includes(process.id);

            return (
              <DataCard
                key={process.id}
                selected={isSelected}
                onClick={() => toggle(process.id)}
              >
                <div className="flex items-start gap-2.5">
                  <Checkbox checked={isSelected} className="mt-0.5" tabIndex={-1} />
                  <div className="min-w-0">
                    <h3 className="font-heading text-sm font-semibold uppercase tracking-h2">
                      {process.title}
                    </h3>
                    <p className="mt-1.5 text-[11.5px] leading-[1.5] text-muted-foreground">
                      {process.text}
                    </p>
                    <div className="mt-2.5 meta-label">{process.share.toUpperCase()}</div>
                  </div>
                </div>
              </DataCard>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-stretch border-t border-border">
        <div className="flex items-center px-5 py-4 meta-label">
          ОТМЕЧЕНО ПРОЦЕССОВ: {selected.length} · ДАЛЕЕ РАСЧЁТ СЦЕНАРИЕВ
        </div>
        <div className="ml-auto flex items-stretch">
          <Button
            variant="ghost"
            className="border-l border-border px-5 py-4"
            onClick={() => navigate(`/calculate/${objectType}/form`)}
          >
            Назад
          </Button>
          <Button
            size="lg"
            disabled={selected.length === 0}
            onClick={() => navigate(`/calculate/${objectType}/results/demo`)}
          >
            Рассчитать
            <ArrowUpRight className="size-3.5" strokeWidth={2.5} />
          </Button>
        </div>
      </div>
    </AppShell>
  );
}

export default ProcessesPage;
