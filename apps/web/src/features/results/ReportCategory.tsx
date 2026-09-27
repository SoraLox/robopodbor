import { ChevronDown, type LucideIcon } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

/** Оболочка категории отчёта — тот же язык, что мини-меню профиля. */
export function ReportShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[20px] border border-[#E5E5EA] bg-white p-1.5 shadow-[0_4px_24px_rgba(0,0,0,0.06)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ReportDivider() {
  return <div className="mx-1 my-1.5 h-px bg-accent-tint" />;
}

/**
 * Список сворачиваемых категорий. `defaultOpen` — id секций, открытых сразу
 * (обычно ответ на вопрос «какой вариант» и «из чего сумма»).
 */
export function ReportCategories({
  children,
  defaultOpen,
}: {
  children: ReactNode;
  defaultOpen?: string[];
}) {
  return (
    <Accordion type="multiple" defaultValue={defaultOpen} className="grid gap-3">
      {children}
    </Accordion>
  );
}

export function ReportCategory({
  id,
  title,
  summary,
  icon: Icon,
  children,
}: {
  id: string;
  title: string;
  /** Короткая выжимка в свёрнутом заголовке — чтобы не открывать зря. */
  summary?: string;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <AccordionItem value={id} className="border-0">
      <ReportShell>
        <AccordionTrigger className="group rounded-[12px] border border-transparent px-2.5 py-2 transition-colors duration-100 hover:border-[#E5E5EA] hover:bg-[#FAFAFA] data-[state=open]:border-transparent data-[state=open]:bg-transparent">
          <div className="flex w-full items-center gap-2.5">
            {Icon ? (
              <Icon className="size-4 flex-none text-foreground" strokeWidth={1.75} aria-hidden />
            ) : null}
            <div className="min-w-0 flex-1 text-left">
              <div className="truncate text-[13.5px] font-semibold leading-tight text-foreground">
                {title}
              </div>
              {summary ? (
                <div className="mt-0.5 truncate text-[11.5px] leading-snug text-[#8E8E93]">
                  {summary}
                </div>
              ) : null}
            </div>
            <ChevronDown
              className="size-4 flex-none text-[#8E8E93] transition-transform duration-200 group-data-[state=open]:rotate-180"
              strokeWidth={1.75}
              aria-hidden
            />
          </div>
        </AccordionTrigger>

        <AccordionContent>
          <ReportDivider />
          <div className="px-2.5 pb-2.5 pt-0.5">{children}</div>
        </AccordionContent>
      </ReportShell>
    </AccordionItem>
  );
}
