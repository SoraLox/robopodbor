import { useNavigate, useParams } from 'react-router-dom';
import { ArrowUpRight, Check } from 'lucide-react';
import { SiteHeader } from '@/app/AppShell';
import { useWizardStore } from '@/app/store';
import { useObjectTypes } from '@/api/queries';
import { cn } from '@/lib/utils';

export function ObjectSelectPage() {
  const navigate = useNavigate();
  const { objectType: routeType } = useParams<{ objectType: string }>();
  const { objectType, setObjectType } = useWizardStore();
  const { data: types, isLoading } = useObjectTypes();

  const hasSelection = Boolean(objectType);
  const selectedSlug = objectType ?? routeType ?? 'warehouse';

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-[1380px] items-center justify-center px-[18px] py-16">
        <div className="w-full max-w-[980px]">
          <div className="mb-8 text-center">
            <h1 className="font-heading text-[26px] font-semibold tracking-h1">Какой объект считаем?</h1>
            <p className="mt-2 text-[14px] text-muted-foreground">
              Выберите тип площадки — дальше подстроим вопросы под неё
            </p>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[0, 1, 2].map((key) => (
                <div key={key} className="h-[220px] animate-pulse rounded-2xl bg-muted" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {types?.map((type) => {
                const isSelected = type.slug === objectType;

                return (
                  <button
                    key={type.slug}
                    type="button"
                    role="button"
                    aria-pressed={isSelected}
                    onClick={() => setObjectType(type.slug)}
                    className={cn(
                      'flex h-[220px] w-full flex-col rounded-2xl border p-6 text-left transition-all duration-200',
                      isSelected
                        ? 'border-primary bg-accent-tint shadow-soft'
                        : 'border-border bg-background hover:border-foreground/20 hover:shadow-soft',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-heading text-[19px] font-semibold leading-tight tracking-h2">
                        {type.title}
                      </h3>
                      <div
                        className={cn(
                          'flex size-7 flex-none items-center justify-center rounded-full border',
                          isSelected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background text-transparent',
                        )}
                      >
                        <Check className="size-3.5" strokeWidth={3} />
                      </div>
                    </div>

                    <p
                      className={cn(
                        'mt-2.5 text-[13.5px] leading-[1.5]',
                        isSelected ? 'text-accent-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {type.description}
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          <button
            type="button"
            disabled={!hasSelection}
            onClick={() => navigate(`/calculate/${selectedSlug}/form`)}
            className="mt-6 flex w-full items-center justify-center gap-3 rounded-full border border-transparent bg-primary px-8 py-4 text-[15px] font-medium text-primary-foreground shadow-soft transition-all hover:bg-primary-hover hover:shadow-lift disabled:cursor-not-allowed disabled:border-border disabled:bg-transparent disabled:text-muted-foreground disabled:shadow-none disabled:hover:bg-transparent sm:w-auto sm:mx-auto"
          >
            Далее
            <ArrowUpRight className="size-4" strokeWidth={2.25} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default ObjectSelectPage;
