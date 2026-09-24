import { useNavigate, useParams } from 'react-router-dom';
import { useWizardStore } from '@/app/store';
import { useObjectTypes } from '@/api/queries';
import { TYPE_BLURB, TYPE_ICONS } from '@/features/objects/objectTypeMeta';
import { cn } from '@/lib/utils';
import { Warehouse } from 'lucide-react';

/**
 * Выбор типа объекта — контент без заголовка (его держит ObjectWizardLayout).
 */
export function ObjectSelectPage() {
  const navigate = useNavigate();
  const { objectType: routeType } = useParams<{ objectType: string }>();
  const { objectType, setObjectType } = useWizardStore();
  const { data: types, isLoading } = useObjectTypes();

  const hasSelection = Boolean(objectType);
  const selectedSlug = objectType ?? routeType ?? 'warehouse';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid min-h-0 gap-2 overflow-y-auto overscroll-contain [scrollbar-width:thin]" role="radiogroup" aria-label="Тип объекта">
        {isLoading
          ? [0, 1, 2].map((key) => (
              <div key={key} className="h-[52px] animate-pulse rounded-[12px] bg-[#F2F2F2]" />
            ))
          : types?.map((type) => {
              const isSelected = type.slug === objectType;
              const Icon = TYPE_ICONS[type.slug] ?? Warehouse;
              const blurb = TYPE_BLURB[type.slug] ?? type.description;

              return (
                <button
                  key={type.slug}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setObjectType(type.slug)}
                  className={cn(
                    'flex w-full min-w-0 items-center gap-3 rounded-[12px] border bg-white px-3 py-2.5 text-left transition-colors duration-100',
                    isSelected ? 'border-foreground' : 'border-[#E5E5EA] hover:border-[#C7C7CC]',
                  )}
                >
                  <span className="flex size-9 flex-none items-center justify-center text-foreground">
                    <Icon className="size-[22px]" strokeWidth={1.5} />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold leading-tight text-foreground">
                      {type.title}
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-[#8E8E93]">{blurb}</span>
                  </span>
                </button>
              );
            })}
      </div>

      <button
        type="button"
        disabled={!hasSelection}
        onClick={() => navigate(`/calculate/${selectedSlug}/form`)}
        className="mt-auto flex h-11 w-full flex-none items-center justify-center rounded-[10px] bg-foreground text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-[#E5E5EA] disabled:text-[#8E8E93] disabled:opacity-100"
      >
        Продолжить
      </button>
    </div>
  );
}

export default ObjectSelectPage;
