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
 * Категории отчёта + деталь справа в той же сетке (не оверлей).
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
        'grid w-full items-start gap-6 sm:gap-8',
        'transition-[grid-template-columns] duration-300 ease-out motion-reduce:transition-none',
        open
          ? 'lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]'
          : 'lg:grid-cols-[minmax(0,1fr)_0fr]',
      )}
    >
      <ReportCategoryList sections={sections} activeId={activeId} onSelect={onSelect} />

      <div className="min-h-0 min-w-0 overflow-hidden">
        <ReportDetail
          section={displayed}
          open={open}
          onClose={onClose}
        />
      </div>
    </div>
  );
}

function ReportCategoryList({
  sections,
  activeId,
  onSelect,
}: {
  sections: ReportSection[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="grid min-w-0 gap-3">
      {sections.map((section) => {
        const Icon = section.icon;
        const active = activeId === section.id;
        return (
          <li key={section.id}>
            <button
              type="button"
              onClick={() => onSelect(section.id)}
              aria-pressed={active}
              className={cn(
                'relative flex w-full min-w-0 items-center gap-3 rounded-[14px] border bg-white px-4 py-3.5 text-left transition-colors duration-100',
                active
                  ? 'border-[#2F86F0]/60 bg-[#F5F9FF]'
                  : 'border-[#E5E5EA] hover:border-[#C7C7CC] hover:bg-[#FAFAFA]',
              )}
            >
              {Icon ? (
                <Icon
                  className={cn(
                    'size-4 flex-none',
                    active ? 'text-[#2F86F0]' : 'text-foreground',
                  )}
                  strokeWidth={1.75}
                  aria-hidden
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold leading-tight text-foreground">
                  {section.title}
                </div>
                {section.summary ? (
                  <div className="mt-1 truncate text-[12px] leading-snug text-[#8E8E93]">
                    {section.summary}
                  </div>
                ) : null}
              </div>
              <ChevronRight
                className={cn(
                  'size-4 flex-none transition-transform duration-200',
                  active ? 'translate-x-0.5 text-[#2F86F0]' : 'text-[#8E8E93]',
                )}
                strokeWidth={1.75}
                aria-hidden
              />
            </button>
          </li>
        );
      })}
    </ul>
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

  const Icon = section.icon;

  return (
    <aside
      role="region"
      aria-labelledby={titleId}
      aria-hidden={!open}
      className={cn(
        'flex h-full min-h-[280px] flex-col overflow-hidden rounded-[20px] border border-[#E5E5EA] bg-white',
        'shadow-[0_4px_24px_rgba(0,0,0,0.06)]',
        'transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none',
        open ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-8 opacity-0',
      )}
    >
      <div className="relative flex-none border-b border-[#E5E5EA] px-5 pb-4 pt-5 pr-14">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="absolute right-3.5 top-3.5 z-10 flex size-8 items-center justify-center rounded-full bg-[#F2F2F2] text-foreground transition-colors hover:bg-[#E5E5EA]"
          aria-label="Закрыть"
          tabIndex={open ? 0 : -1}
        >
          <X className="size-3.5" strokeWidth={2} />
        </button>

        <div className="flex items-start gap-3">
          {Icon ? (
            <span className="mt-0.5 grid size-9 flex-none place-items-center rounded-[10px] bg-[#F5F9FF] text-[#2F86F0]">
              <Icon className="size-4" strokeWidth={1.75} aria-hidden />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className="font-heading text-[18px] font-semibold leading-snug tracking-h2 text-foreground"
            >
              {section.title}
            </h2>
            {section.summary ? (
              <p className="mt-1.5 text-[13px] leading-snug text-[#6E6E73]">{section.summary}</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 [scrollbar-width:thin]">
        {section.content}
      </div>
    </aside>
  );
}
