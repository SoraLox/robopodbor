import { useEffect, useId } from 'react';
import { X } from 'lucide-react';

/** Заготовки «что изменилось» — пункт в шапке открывает этот попап. */
export const WHATS_NEW_ITEMS = [
  {
    title: 'ИИ-ассистент по экономике',
    body: 'Чат рядом с расчётом: можно спросить про окупаемость, CAPEX, ROI и сценарии на цифрах вашего отчёта.',
  },
  {
    title: 'Импорт из AutoCAD',
    body: 'Планировку склада можно загрузить из DXF и сразу увидеть сетку для симуляции и расчёта.',
  },
  {
    title: 'Симуляция: плавность и логика',
    body: 'Исправлены сбои в работе сцены: движение роботов, ленты и сверка производительности стали стабильнее.',
  },
  {
    title: 'Переработана экономика',
    body: 'Больше входных данных и аккуратнее формулы: замещение ФОТ, внедрение, годовой ROI за вычетом CAPEX.',
  },
  {
    title: 'Наглядный вывод экономики',
    body: 'Показатели и графики переразложены: горизонт и смысл цифр читаются быстрее.',
  },
  {
    title: 'Шаблоны планировок склада',
    body: 'Готовые пресеты складов в конструкторе — можно стартовать не с пустой сетки.',
  },
] as const;

export function WhatsNewDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-4 sm:items-center">
      <button type="button" aria-label="Закрыть" className="absolute inset-0 bg-foreground/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[min(640px,calc(100dvh-2rem))] w-full max-w-[440px] flex-col overflow-hidden rounded-[20px] border border-[#E5E5EA] bg-white shadow-[0_16px_48px_rgba(0,0,0,0.16)]"
      >
        <div className="flex flex-none items-start justify-between gap-3 border-b border-[#F2F2F4] px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[17px] font-semibold tracking-[-0.02em] text-foreground">
              Что изменилось?
            </h2>
            <p className="mt-1 text-[13px] leading-snug text-[#8E8E93]">Обновления с прошлого раза</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="grid size-8 flex-none place-items-center rounded-full text-[#6E6E73] transition-colors hover:bg-[#F2F2F4]"
          >
            <X className="size-4" strokeWidth={2} aria-hidden />
          </button>
        </div>

        <ol className="min-h-0 flex-1 list-none space-y-0 overflow-y-auto px-5 py-2">
          {WHATS_NEW_ITEMS.map((item, index) => (
            <li key={item.title} className="flex gap-3 border-b border-[#F2F2F4] py-3.5 last:border-b-0">
              <span
                className="mt-0.5 grid size-6 flex-none place-items-center rounded-full bg-[#F2F2F4] text-[12px] font-semibold tabular-nums text-foreground"
                aria-hidden
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <div className="text-[14px] font-semibold leading-snug tracking-[-0.01em] text-foreground">
                  {item.title}
                </div>
                <p className="mt-1 text-[13px] leading-snug text-[#6E6E73]">{item.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
