import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUp, MessageCircleQuestion, X } from 'lucide-react';
import { api } from '@/api/client';
import type { CalculationResult } from '@/api/types';
import type { components } from '@/api/schema';
import { cn } from '@/lib/utils';
import type { ObjectParameterGroup } from './objectParameters';

type EconomicsContext = components['schemas']['EconomicsContext'];
type Turn = { role: 'user' | 'assistant'; text: string };

const SUGGESTED = [
  'Объясни экономику простыми словами',
  'Почему окупаемость именно такая?',
  'Что такое NPV и IRR?',
  'Из чего складываются затраты?',
  'Что снизит операционные расходы?',
  'Что будет, если вырастут зарплаты?',
];

type AskBody = { question: string; history: Turn[]; context: EconomicsContext; details?: string };

// На GitHub Pages своего сервера нет: вопрос идёт посреднику с ключом Groq
// (workers/economics-assistant, адрес — VITE_ASSISTANT_URL при сборке).
// Иначе — в наш API (/api/assistant/economics).
const ASSISTANT_URL = import.meta.env.VITE_ASSISTANT_URL as string | undefined;

async function askAssistant(body: AskBody): Promise<{ reply: { answer: string } | null; status: number }> {
  if (ASSISTANT_URL) {
    const response = await fetch(ASSISTANT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { reply: response.ok ? ((await response.json()) as { answer: string }) : null, status: response.status };
  }
  const { data, response } = await api.POST('/assistant/economics', { body });
  return { reply: data ?? null, status: response.status };
}

const MAX_DETAILS = 14000;
const m1 = (x: number) => x.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
const SLOT_TITLE: Record<string, string> = { inbound: 'приёмка', outbound: 'отгрузка', picking: 'отбор', sorting: 'сортировка', cleaning: 'уборка' };

/**
 * Досье расчёта для помощника — всё, что есть в отчёте: паспорт склада, парк,
 * связи, статьи затрат построчно, сценарии, денежный поток по годам, рычаги OPEX
 * и допущения. Помощник отвечает по нему и не переспрашивает то, что уже есть.
 */
export function dossierOf(data: CalculationResult, parameters: ObjectParameterGroup[]): string {
  const out: string[] = [];
  const section = (title: string, lines: string[]) => {
    if (lines.length) out.push(`${title}:`, ...lines.map((l) => `- ${l}`), '');
  };
  section(
    'ПАСПОРТ СКЛАДА (введено пользователем или по умолчанию)',
    parameters.flatMap((g) =>
      g.items.map((i) => `${g.title.toLowerCase()} / ${i.label}: ${i.value}${i.unit ? ` ${i.unit}` : ''}${i.byDefault ? ' (по умолчанию)' : ''}`),
    ),
  );
  section(
    'ПАРК РОБОТОВ',
    (data.fleet ?? []).map(
      (g) =>
        `${g.name} — ${g.count} шт., участок «${SLOT_TITLE[g.slot] ?? g.slot}», доля потока ${Math.round(g.share * 100)}%; ` +
        `производительность ${m1(g.throughputPerRobot)} ${g.unit} на робота, пиковый спрос ${m1(g.peakDemand)} ${g.unit}` +
        `${g.routeM ? `, путь ${Math.round(g.routeM)} м` : ''}${g.speedMps ? `, скорость ${g.speedMps} м/с` : ''}` +
        `${g.capacityKg ? `, грузоподъёмность ${g.capacityKg} кг` : ''}; мощность ${g.workPowerKw} кВт в работе / ${g.idlePowerKw} кВт в простое` +
        `${g.substitutions.length ? `; оценки вместо данных каталога: ${g.substitutions.map((x) => `${x.field} = ${x.value}`).join(', ')}` : ''}`,
    ),
  );
  if (data.robots) out.push(`Как посчитано число роботов: ${data.robots.basis}`, '');
  section(
    'ПОТОКИ ПО УЧАСТКАМ',
    (data.scenario?.links ?? []).map(
      (l) =>
        `${l.label}: ${m1(l.flowPerHour)} паллет/ч, путь ${Math.round(l.routeM)} м (робот едет ${Math.round(l.effectiveRouteM)} м), вручную остаётся ${Math.round(l.manualShare * 100)}%`,
    ),
  );
  out.push(`CAPEX: ${data.capex.value} млн ₽ — ${data.capex.label}${data.capex.note ? ` (${data.capex.note})` : ''}`);
  out.push(`Окупаемость: ${data.payback.value} — ${data.payback.label}${data.payback.note ? ` (${data.payback.note})` : ''}`);
  out.push(`ROI: ${data.roi.value} — ${data.roi.label}`);
  out.push(`Экономия OPEX: ${data.opexSaving.percent} — ${data.opexSaving.meta}`, '');
  section(
    `СТАТЬИ СТОИМОСТИ ВЛАДЕНИЯ ЗА ГОРИЗОНТ (всего ${m1(data.totalTco)} млн ₽)`,
    data.costGroups.flatMap((g) => [
      `${g.title}: ${m1(g.amount)} млн ₽ (${Math.round(g.share)}%)`,
      ...g.lines.map((l) => `  · ${l.title}: ${m1(l.amount)} млн ₽ — ${l.source}`),
    ]),
  );
  section(
    'СЦЕНАРИИ (стоимость владения за горизонт)',
    data.scenarios.map((sc) => `${sc.title}${sc.recommended ? ' (рекомендуем)' : ''}: ${m1(sc.tco)} млн ₽, ${sc.delta}; ${sc.subtitle}${sc.detail ? `; ${sc.detail}` : ''}`),
  );
  section(
    'ДЕНЕЖНЫЙ ПОТОК ПО ГОДАМ, млн ₽ (вложения / экономия / остаточная / итог года / накопленный)',
    (data.finance?.cashFlow ?? []).map(
      (y) => `год ${y.year}: ${m1(y.investmentMln)} / ${m1(y.effectMln)} / ${m1(y.salvageMln)} / ${m1(y.netMln)} / ${m1(y.cumulativeMln)}`,
    ),
  );
  if (data.opexLevers) {
    section(`OPEX РОБОТОВ ${m1(data.opexLevers.opexYearMln)} млн ₽ в год, состав`, data.opexLevers.parts.map((p) => `${p.label}: ${m1(p.amountMln)} млн ₽`));
    section(
      'РЫЧАГИ СНИЖЕНИЯ OPEX',
      data.opexLevers.levers.map((l) => `${l.title} — до ${m1(l.savingMln)} млн ₽/год (${l.basis === 'calculated' ? 'расчёт' : 'оценка'}): ${l.detail}`),
    );
  }
  section('ДОПУЩЕНИЯ РАСЧЁТА', data.assumptions);
  if (data.warning) out.push(`Предупреждение: ${data.warning}`);
  const text = out.join('\n').trim();
  return text.length > MAX_DETAILS ? `${text.slice(0, MAX_DETAILS - 20)}\n…(сокращено)` : text;
}

/** Цифры расчёта для помощника — только то, что видно в отчёте. */
export function economicsContextOf(data: CalculationResult): EconomicsContext | null {
  const f = data.finance;
  if (!f) return null;
  const horizon = f.cashFlow.length - 1;
  const effect = f.cashFlow.find((row) => row.year === 1)?.effectMln ?? 0;
  const num = (text: string) => Number(text.replace(/\s/g, '').replace(',', '.').replace('−', '-'));
  return {
    objectTitle: data.objectTitle,
    meta: data.meta,
    horizonYears: horizon,
    capexMln: Number.isFinite(num(data.capex.value)) ? num(data.capex.value) : f.totalInvestmentMln,
    totalInvestmentMln: f.totalInvestmentMln,
    effectYearMln: Math.round(effect * 10) / 10,
    paybackYears: f.paybackYears,
    discountedPaybackYears: f.discountedPaybackYears,
    npvMln: f.npvMln,
    irrPct: f.irrPct,
    roiPct: f.roiPct,
    discountRatePct: f.discountRatePct,
    salvageMln: f.salvageMln,
    netBenefitMln: f.netBenefitMln,
    robots: (data.fleet ?? []).map((g) => ({ name: g.name, count: g.count, slot: g.slot })),
    costGroups: data.costGroups.map((g) => ({ title: g.title, amountMln: g.amount })),
    levers: (data.opexLevers?.levers ?? []).map((l) => ({ title: l.title, savingMln: l.savingMln })),
    // Края подписаны явно: у зарплат «быстрее» — при +20%, у цены роботов — при −20%.
    sensitivity: (data.sensitivity ?? []).map((s) => {
      const [fast, slow] = s.direction === 'down' ? ['+20%', '−20%'] : ['−20%', '+20%'];
      return { title: s.label.replace(/, ±20%$/, ''), low: `при ${fast}: ${s.low ?? '—'}`, high: `при ${slow}: ${s.high ?? '—'}` };
    }),
    ...(data.opexLevers ? { opexYearMln: data.opexLevers.opexYearMln } : {}),
  };
}

/**
 * «Спросить про экономику»: плавающая кнопка и чат. Ответы — по цифрам этого
 * расчёта, простыми словами (сервер: модель Claude или встроенный помощник).
 */
export function EconomicsAssistant({ data, parameters }: { data: CalculationResult; parameters: ObjectParameterGroup[] }) {
  const context = economicsContextOf(data);
  const details = dossierOf(data, parameters);
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, pending]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!context) return null;

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || pending) return;
    setError(null);
    setDraft('');
    const history = turns.slice(-10);
    setTurns((list) => [...list, { role: 'user', text }]);
    setPending(true);
    try {
      const { reply, status } = await askAssistant({ question: text, history, context, details });
      if (!reply) {
        setError(status === 429 ? 'Слишком много вопросов подряд — попробуйте через несколько минут.' : 'Не удалось получить ответ — попробуйте ещё раз.');
        return;
      }
      setTurns((list) => [...list, { role: 'assistant', text: reply.answer }]);
    } catch {
      setError('Нет связи с сервером — попробуйте ещё раз.');
    } finally {
      setPending(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void ask(draft);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex h-11 items-center gap-2 rounded-full bg-foreground px-4 text-[13.5px] font-semibold text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)] transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
      >
        <MessageCircleQuestion className="size-[18px]" strokeWidth={1.9} aria-hidden />
        Спросить про экономику
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Вопросы по экономике"
      className="fixed bottom-5 right-5 z-40 flex h-[min(560px,calc(100dvh-6rem))] w-[min(400px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-[20px] border border-[#E5E5EA] bg-white shadow-[0_16px_48px_rgba(0,0,0,0.16)]"
    >
      <div className="flex flex-none items-center gap-2.5 border-b border-[#F2F2F4] px-4 py-3">
        <span className="grid size-8 flex-none place-items-center rounded-full bg-[#F2F2F4]">
          <MessageCircleQuestion className="size-[18px] text-foreground" strokeWidth={1.9} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold leading-tight text-foreground">Вопросы по экономике</div>
          <div className="text-[11.5px] text-[#8E8E93]">Отвечаем по цифрам этого расчёта, простыми словами</div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Закрыть"
          className="grid size-8 place-items-center rounded-full text-[#6E6E73] hover:bg-[#F2F2F4]"
        >
          <X className="size-4" strokeWidth={2} aria-hidden />
        </button>
      </div>

      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3" aria-live="polite">
        {turns.length === 0 ? (
          <div className="grid gap-2">
            <p className="text-[13px] leading-snug text-[#3A3A3C]">
              Спросите что угодно про цифры: откуда окупаемость, что значат NPV и IRR, где можно сэкономить.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void ask(q)}
                  className="rounded-full border border-[#E5E5EA] px-3 py-1.5 text-left text-[12.5px] text-foreground transition-colors hover:border-[#C7C7CC] hover:bg-[#FAFAFA]"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {turns.map((turn, i) => (
          <div
            key={i}
            className={cn(
              'max-w-[88%] whitespace-pre-line rounded-[14px] px-3 py-2 text-[13px] leading-snug',
              turn.role === 'user' ? 'self-end bg-foreground text-white' : 'self-start bg-[#F2F2F4] text-foreground',
            )}
          >
            {turn.text}
          </div>
        ))}
        {pending ? (
          <div className="self-start rounded-[14px] bg-[#F2F2F4] px-3 py-2 text-[13px] text-[#8E8E93]">Думаю…</div>
        ) : null}
        {error ? <p className="text-[12px] text-status-danger">{error}</p> : null}
      </div>

      <form onSubmit={onSubmit} className="flex flex-none items-end gap-2 border-t border-[#F2F2F4] px-3 py-2.5">
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value.slice(0, 500))}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void ask(draft);
            }
          }}
          rows={1}
          placeholder="Ваш вопрос…"
          aria-label="Ваш вопрос"
          className="max-h-24 min-h-9 flex-1 resize-none rounded-[12px] border border-[#E5E5EA] px-3 py-2 text-[13px] outline-none focus:border-[#C7C7CC]"
        />
        <button
          type="submit"
          disabled={!draft.trim() || pending}
          aria-label="Отправить"
          className="grid size-9 flex-none place-items-center rounded-full bg-foreground text-white transition-opacity disabled:opacity-30"
        >
          <ArrowUp className="size-4" strokeWidth={2.2} aria-hidden />
        </button>
      </form>
    </div>
  );
}
