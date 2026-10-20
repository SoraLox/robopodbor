import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ReportSection = {
  id: string;
  title: string;
  summary?: string;
  icon?: LucideIcon;
  content: ReactNode;
};

/**
 * Категории отчёта слева (отдельные плашки) + деталь справа в сетке.
 */
export function ReportSections({
  sections,
  activeId,
  onSelect,
  onClose,
}: {
  sections: ReportSection[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const open = Boolean(activeId);
  const active = sections.find((section) => section.id === activeId) ?? null;
  const [displayed, setDisplayed] = useState<ReportSection | null>(active);

  useEffect(() => {
    if (active) setDisplayed(active);
  }, [active]);

  return (
    <div
      className={cn(
        'grid w-full items-start gap-5 sm:gap-6',
        'transition-[grid-template-columns] duration-300 ease-out motion-reduce:transition-none',
        open
          ? 'lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]'
          : 'lg:grid-cols-[minmax(0,1fr)_0fr]',
      )}
    >
      <ul className="grid min-w-0 gap-3">
        {sections.map((section) => {
          const Icon = section.icon;
          const selected = activeId === section.id;
          return (
            <li key={section.id}>
              <button
                type="button"
                onClick={() => onSelect(section.id)}
                aria-pressed={selected}
                className={cn(
                  'flex w-full min-w-0 items-center gap-3.5 rounded-[16px] border bg-white px-4 py-3.5 text-left transition-colors duration-100',
                  selected
                    ? 'border-[#D1D1D6] bg-[#F7F7F8]'
                    : 'border-[#E5E5EA] hover:border-[#D1D1D6] hover:bg-[#FAFAFA]',
                )}
              >
                {Icon ? (
                  <Icon
                    className={cn(
                      'size-[18px] flex-none',
                      selected ? 'text-foreground' : 'text-[#8E8E93]',
                    )}
                    strokeWidth={1.75}
                    aria-hidden
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold leading-tight tracking-[-0.01em] text-foreground">
                    {section.title}
                  </div>
                  {section.summary ? (
                    <div className="mt-0.5 truncate text-[12.5px] leading-snug text-[#8E8E93]">
                      {section.summary}
                    </div>
                  ) : null}
                </div>
                <ChevronRight
                  className={cn(
                    'size-4 flex-none transition-transform duration-200',
                    selected ? 'translate-x-0.5 text-foreground' : 'text-[#C7C7CC]',
                  )}
                  strokeWidth={1.75}
                  aria-hidden
                />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="min-h-0 min-w-0 overflow-hidden">
        <ReportDetail section={displayed} open={open} onClose={onClose} />
      </div>
    </div>
  );
}

function ReportDetail({
  section,
  open,
  onClose,
}: {
  section: ReportSection | null;
  open: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!section) return null;

  return (
    <aside
      role="region"
      aria-labelledby={titleId}
      aria-hidden={!open}
      className={cn(
        'flex h-full min-h-[300px] flex-col overflow-hidden rounded-[16px] border border-[#E5E5EA] bg-white',
        'transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none',
        open ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-6 opacity-0',
      )}
    >
      <div className="relative flex-none border-b border-[#F2F2F4] px-5 py-4 pr-14">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-[8px] text-[#6E6E73] transition-colors hover:bg-[#F2F2F4] hover:text-foreground"
          aria-label="Закрыть"
          tabIndex={open ? 0 : -1}
        >
          <X className="size-4" strokeWidth={2} />
        </button>

        <h2
          id={titleId}
          className="text-[17px] font-semibold leading-snug tracking-[-0.02em] text-foreground"
        >
          {section.title}
        </h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 [scrollbar-width:thin]">
        {section.content}
      </div>
    </aside>
  );
}
