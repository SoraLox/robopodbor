import { useNavigate, useParams } from 'react-router-dom';
import { ArrowUpRight, Check } from 'lucide-react';
import { AppShell } from '@/app/AppShell';
import { useWizardStore } from '@/app/store';
import { useObjectTypes } from '@/api/queries';
import { DataCard, SectionHeading, Stepper } from '@/shared/components';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { WIZARD_STEPS } from './wizardSteps';

/** Диагональная штриховка вместо фотографии — плейсхолдер из макета. */
function PhotoSlot({ caption, selected }: { caption: string; selected: boolean }) {
  return (
    <div
      className={cn(
        'flex h-[104px] items-end justify-between border-b px-3 pb-2.5',
        selected ? 'border-primary/30' : 'border-border',
      )}
      style={{
        backgroundImage: selected
          ? 'repeating-linear-gradient(135deg, #FFF1E2 0 6px, #FBE6D2 6px 12px)'
          : 'repeating-linear-gradient(135deg, #F4F4F2 0 6px, #EBEBE8 6px 12px)',
      }}
    >
      <div
        className={cn(
          'font-mono text-[9px] uppercase',
          selected ? 'text-accent-foreground' : 'text-muted-foreground',
        )}
      >
        {caption}
      </div>
      {selected ? <Check className="size-3.5 text-primary" strokeWidth={3} /> : null}
    </div>
  );
}

export function ObjectSelectPage() {
  const navigate = useNavigate();
  const { objectType: routeType } = useParams<{ objectType: string }>();
  const { objectType, setObjectType } = useWizardStore();
  const { data: types, isLoading } = useObjectTypes();

  const selectedSlug = objectType ?? routeType ?? 'warehouse';
  const selected = types?.find((type) => type.slug === selectedSlug);

  return (
    <AppShell>
      <Stepper steps={WIZARD_STEPS} current={0} />

      <div className="px-5 py-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-6">
          <SectionHeading size="h1">Тип объекта</SectionHeading>
          <p className="max-w-[420px] text-xs leading-[1.5] text-muted-foreground">
            От типа объекта зависят доступные классы роботов, нормативная база и
            модель расчёта эффекта. Позже параметры можно уточнить.
          </p>
        </div>

        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-3">
            {[0, 1, 2].map((key) => (
              <div key={key} className="h-[300px] animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {types?.map((type) => {
              const isSelected = type.slug === selectedSlug;

              return (
                <DataCard
                  key={type.slug}
                  padding="none"
                  selected={isSelected}
                  onClick={() => setObjectType(type.slug)}
                  className="overflow-hidden"
                >
                  <PhotoSlot caption={type.photoCaption} selected={isSelected} />

                  <div className="px-4 py-3.5">
                    <h3 className="font-heading text-[19px] font-semibold uppercase tracking-[-0.02em]">
                      {type.title}
                    </h3>
                    <p
                      className={cn(
                        'mt-[7px] text-xs leading-[1.5]',
                        isSelected ? 'text-accent-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {type.description}
                    </p>

                    <div
                      className={cn(
                        'mt-3.5 grid grid-cols-2 gap-3 border-t pt-3',
                        isSelected ? 'border-primary/25' : 'border-hairline',
                      )}
                    >
                      <div>
                        <div className="font-heading text-xl font-bold leading-none tabular tracking-h1">
                          {type.solutionsCount}
                        </div>
                        <div
                          className={cn(
                            'mt-1 text-[9px] font-semibold uppercase tracking-[0.1em]',
                            isSelected ? 'text-primary-hover' : 'text-muted-foreground',
                          )}
                        >
                          {type.solutionsCountLabel}
                        </div>
                      </div>
                      <div>
                        <div className="font-heading text-xl font-bold leading-none tabular tracking-h1">
                          {type.paybackRange}
                        </div>
                        <div
                          className={cn(
                            'mt-1 text-[9px] font-semibold uppercase tracking-[0.1em]',
                            isSelected ? 'text-primary-hover' : 'text-muted-foreground',
                          )}
                        >
                          года окупаемости
                        </div>
                      </div>
                    </div>
                  </div>
                </DataCard>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-stretch border-t border-border">
        <div className="flex items-center px-5 py-4 meta-label">
          {selected
            ? `ВЫБРАН ТИП «${selected.title.toUpperCase()}» · ДАЛЕЕ 6 ПАРАМЕТРОВ ОБЪЕКТА`
            : 'ВЫБЕРИТЕ ТИП ОБЪЕКТА'}
        </div>
        <div className="ml-auto flex items-stretch">
          <Button
            variant="ghost"
            className="border-l border-border px-5 py-4"
            onClick={() => navigate(`/calculate/${selectedSlug}/form`)}
          >
            Загрузить шаблон
          </Button>
          <Button
            size="lg"
            onClick={() => navigate(`/calculate/${selectedSlug}/form`)}
          >
            Далее: параметры
            <ArrowUpRight className="size-3.5" strokeWidth={2.5} />
          </Button>
        </div>
      </div>
    </AppShell>
  );
}

export default ObjectSelectPage;
