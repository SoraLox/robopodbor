import * as React from 'react';
import { AlertCircle, HelpCircle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface FormFieldProps {
  id: string;
  label: React.ReactNode;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}

/** Значок «?» рядом с лейблом: пояснение по клику/наведению/фокусу, без визуального шума под полем. */
function FieldHint({ id, text }: { id: string; text: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex size-4 flex-none items-center justify-center rounded-full text-meta-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-bright/40"
            aria-label="Пояснение к полю"
          >
            <HelpCircle className="size-3.5" strokeWidth={2} />
          </button>
        </TooltipTrigger>
        <TooltipContent id={`${id}-hint-tooltip`}>{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Обёртка «лейбл + поле + пояснение/ошибка» с корректной ARIA-связкой.
 * Пояснение вынесено в значок «?» рядом с лейблом (не занимает место под полем);
 * тот же текст дублируется скрытым узлом для aria-describedby, чтобы он
 * озвучивался скринридером при фокусе на поле, а не только по клику на значок.
 */
export function FormField({ id, label, hint, error, required = true, children }: FormFieldProps) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={id}>
          {label}
          {required ? <span className="ml-0.5 text-status-danger">*</span> : null}
        </Label>
        {hint ? <FieldHint id={id} text={hint} /> : null}
      </div>
      {children}
      {hint ? (
        <span id={`${id}-hint`} className="sr-only">
          {hint}
        </span>
      ) : null}
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="flex items-center gap-1 text-[12px] font-medium text-status-danger"
        >
          <AlertCircle className="size-3 flex-none" strokeWidth={2.25} />
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** ID подсказки/ошибки для aria-describedby поля с указанным id. */
export function fieldDescribedBy(id: string, hint?: string, error?: string): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}
