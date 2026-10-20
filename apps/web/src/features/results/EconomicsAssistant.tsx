import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUp, Sparkles, X } from 'lucide-react';
import { SUGGESTED_QUESTIONS } from '@domain/economicsAssistant';
import { api } from '@/api/client';
import type { CalculationResult } from '@/api/types';
import type { components } from '@/api/schema';
import { cn } from '@/lib/utils';
import type { ObjectParameterGroup } from './objectParameters';

type EconomicsContext = components['schemas']['EconomicsContext'];
type Turn = { role: 'user' | 'assistant'; text: string };

const SUGGESTED = [...SUGGESTED_QUESTIONS];

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
  // Разбивка CAPEX — только разовые вложения: строки группы CAPEX без замены по
  // сроку службы и остаточной стоимости (они в группе стоимости владения).
  const capexGroup = data.costGroups.find((g) => /capex/i.test(g.title));
  const capexLines = (capexGroup?.lines ?? []).filter((l) => l.amount > 0 && !/остаточ|замен/i.test(l.title));
  if (capexLines.length) {
    const sum = capexLines.reduce((total, l) => total + l.amount, 0);
    section(
      `РАЗБИВКА CAPEX — разовые вложения (сумма строк ${m1(sum)} млн ₽ = CAPEX ${data.capex.value} млн ₽ с округлением)`,
      capexLines.map((l) => `${l.title}: ${m1(l.amount)} млн ₽`),
    );
    const extra = (capexGroup?.lines ?? []).filter((l) => /остаточ|замен/i.test(l.title));
    if (extra.length) section('ВНЕ CAPEX, НО В СТОИМОСТИ ВЛАДЕНИЯ', extra.map((l) => `${l.title}: ${m1(l.amount)} млн ₽`));
  }
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

const numOf = (text: string) => Number(String(text).replace(/\s/g, '').replace('%', '').replace(',', '.').replace('−', '-'));

/** Цифры расчёта для помощника — только то, что видно в отчёте. */
export function economicsContextOf(data: CalculationResult): EconomicsContext | null {
  const f = data.finance;
  const robots = (data.fleet ?? []).map((g) => ({ name: g.name, count: g.count, slot: g.slot }));
  const costGroups = data.costGroups.map((g) => ({ title: g.title, amountMln: g.amount }));
  const levers = (data.opexLevers?.levers ?? []).map((l) => ({ title: l.title, savingMln: l.savingMln }));
  const sensitivity = (data.sensitivity ?? []).map((s) => {
    const [fast, slow] = s.direction === 'down' ? ['+20%', '−20%'] : ['−20%', '+20%'];
    return { title: s.label.replace(/, ±20%$/, ''), low: `при ${fast}: ${s.low ?? '-'}`, high: `при ${slow}: ${s.high ?? '-'}` };
  });

  if (f) {
    const horizon = f.cashFlow.length - 1;
    const effect = f.cashFlow.find((row) => row.year === 1)?.effectMln ?? 0;
    return {
      objectTitle: data.objectTitle,
      meta: data.meta,
      horizonYears: horizon,
      capexMln: Number.isFinite(numOf(data.capex.value)) ? numOf(data.capex.value) : f.totalInvestmentMln,
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
      robots,
      costGroups,
      levers,
      sensitivity,
      ...(data.opexLevers ? { opexYearMln: data.opexLevers.opexYearMln } : {}),
    };
  }

  // Демо / старые снимки без finance — собираем контекст из видимых KPI, иначе кнопка пропадает.
  const capex = numOf(data.capex.value);
  const payback = numOf(data.payback.value);
  const roi = numOf(data.roi.value);
  if (!Number.isFinite(capex) && !Number.isFinite(payback)) return null;
  return {
    objectTitle: data.objectTitle,
    meta: data.meta,
    horizonYears: 7,
    capexMln: Number.isFinite(capex) ? capex : 0,
    totalInvestmentMln: Number.isFinite(capex) ? capex : 0,
    effectYearMln: 0,
    paybackYears: Number.isFinite(payback) ? payback : null,
    discountedPaybackYears: null,
    npvMln: 0,
    irrPct: null,
    roiPct: Number.isFinite(roi) ? roi : null,
    discountRatePct: 16,
    salvageMln: 0,
    netBenefitMln: 0,
    robots,
    costGroups,
    levers,
    sensitivity,
    ...(data.opexLevers ? { opexYearMln: data.opexLevers.opexYearMln } : {}),
  };
}

/**
 * «ИИ ассистент по экономике»: плавающая кнопка и чат. Ответы — по цифрам этого
 * расчёта, простыми словами (сервер: модель или запасной помощник).
 */
const PANEL_OUT_MS = 200;

export function EconomicsAssistant({ data, parameters }: { data: CalculationResult; parameters: ObjectParameterGroup[] }) {
  const context = economicsContextOf(data);
  const details = dossierOf(data, parameters);
  const [open, setOpen] = useState(false);
  /** null — только FAB; 'open' — панель; 'closing' — играет exit, потом unmount. */
  const [panel, setPanel] = useState<'open' | 'closing' | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, pending, typing]);

  useEffect(
    () => () => {
      if (typeTimerRef.current !== null) window.clearTimeout(typeTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (open) {
      setPanel('open');
      return;
    }
    if (panel === 'open') {
      setPanel('closing');
      const t = window.setTimeout(() => setPanel(null), PANEL_OUT_MS);
      return () => window.clearTimeout(t);
    }
    return undefined;
    // panel в deps не нужен: закрытие триггерит только open → false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (panel === 'open') {
      const t = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 280);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [panel]);

  if (!context) return null;

  const busy = pending || typing;

  /** Печать ответа по символам, как в ChatGPT (не стрим с сервера — ответ уже есть). */
  const typeAnswer = (full: string) => {
    if (typeTimerRef.current !== null) window.clearTimeout(typeTimerRef.current);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !full) {
      setTurns((list) => [...list, { role: 'assistant', text: full }]);
      setTyping(false);
      return;
    }
    setTurns((list) => [...list, { role: 'assistant', text: '' }]);
    setTyping(true);
    let i = 0;
    const tick = () => {
      // Чуть быстрее на пробелах и длинных ответах — читается как живой набор.
      const ch = full[i] ?? '';
      const step = ch === ' ' || ch === '\n' ? 1 : full.length > 400 ? 3 : 2;
      i = Math.min(full.length, i + step);
      const slice = full.slice(0, i);
      setTurns((list) => {
        if (!list.length) return list;
        const next = list.slice();
        const last = next[next.length - 1];
        if (last?.role !== 'assistant') return list;
        next[next.length - 1] = { role: 'assistant', text: slice };
        return next;
      });
      if (i < full.length) {
        typeTimerRef.current = window.setTimeout(tick, ch === '\n' ? 40 : 16);
      } else {
        typeTimerRef.current = null;
        setTyping(false);
      }
    };
    typeTimerRef.current = window.setTimeout(tick, 40);
  };

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    setError(null);
    setDraft('');
    const history = turns.slice(-10);
    setTurns((list) => [...list, { role: 'user', text }]);
    setPending(true);
    try {
      const { reply, status } = await askAssistant({ question: text, history, context, details });
      if (!reply) {
        setError(status === 429 ? 'Слишком много вопросов подряд. Попробуйте через несколько минут.' : 'Не удалось получить ответ. Попробуйте ещё раз.');
        return;
      }
      typeAnswer(reply.answer);
    } catch {
      setError('Нет связи с сервером. Попробуйте ещё раз.');
    } finally {
      setPending(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void ask(draft);
  };

  const panelVisible = panel !== null;

  return (
    // Та же сетка, что у шапки / метрик. Outer + ряд — pointer-events-none:
    // иначе полная ширина max-w-site перекрывает кнопки симуляции слева.
    // Клики только у FAB и у открытой панели (ai-panel-open в CSS).
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 px-5 sm:px-8">
      <div className="relative mx-auto flex max-w-site justify-end">
      {panelVisible ? (
        <div
          className={cn(
            'ai-panel absolute bottom-0 right-0 w-[min(420px,calc(100vw-2.5rem))]',
            panel === 'open' && 'ai-panel-open',
            panel === 'closing' && 'ai-panel-closing',
          )}
          aria-hidden={panel !== 'open'}
        >
          <div
            role="dialog"
            aria-label="ИИ ассистент по экономике"
            className="ai-shimmer ai-shimmer-glow rounded-[22px] p-[2.5px] shadow-[0_18px_56px_rgba(0,0,0,0.2)]"
          >
            <div className="flex h-[min(600px,calc(100dvh-6rem))] flex-col overflow-hidden rounded-[19.5px] bg-white">
              <div className="flex flex-none items-center gap-2.5 border-b border-[#F2F2F4] px-4 py-3.5">
                <span className="ai-shimmer grid size-9 flex-none place-items-center rounded-full p-[1.5px]">
                  <span className="grid size-full place-items-center rounded-full bg-foreground text-white">
                    <Sparkles className="size-4" strokeWidth={1.9} aria-hidden />
                  </span>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold leading-tight tracking-[-0.01em] text-foreground">ИИ ассистент по экономике</div>
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

              <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3.5" aria-live="polite">
                {turns.length === 0 ? (
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
                ) : null}
                {turns.map((turn, i) => {
                  const streaming = typing && turn.role === 'assistant' && i === turns.length - 1;
                  return (
                    <div
                      key={i}
                      className={cn(
                        'max-w-[88%] whitespace-pre-line rounded-[14px] px-3 py-2.5 text-[13.5px]',
                        turn.role === 'user'
                          ? 'self-end bg-foreground text-white leading-snug'
                          : 'self-start bg-[#F2F2F4] text-foreground leading-[1.45]',
                      )}
                    >
                      {turn.text}
                      {streaming ? (
                        <span
                          className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-foreground align-text-bottom animate-pulse"
                          aria-hidden
                        />
                      ) : null}
                    </div>
                  );
                })}
                {pending ? (
                  <div className="self-start rounded-[14px] bg-[#F2F2F4] px-3 py-2 text-[13.5px] text-[#6E6E73]">Думаю…</div>
                ) : null}
                {error ? <p className="text-[12px] text-status-danger">{error}</p> : null}
              </div>

              <form onSubmit={onSubmit} className="flex flex-none items-end gap-2 border-t border-[#F2F2F4] px-3 py-3">
                <div className="ai-shimmer min-w-0 flex-1 rounded-[14px] p-[1.5px]">
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
                    className="max-h-24 min-h-10 w-full resize-none rounded-[12.5px] border-0 bg-white px-3 py-2.5 text-[13.5px] outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!draft.trim() || busy}
                  aria-label="Отправить"
                  className="grid size-10 flex-none place-items-center rounded-full bg-foreground text-white transition-opacity disabled:opacity-30"
                >
                  <ArrowUp className="size-[18px]" strokeWidth={2.2} aria-hidden />
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen(true)}
        tabIndex={panelVisible ? -1 : 0}
        aria-hidden={panelVisible}
        className={cn(
          'ai-fab ai-shimmer ai-shimmer-glow rounded-full p-[2.5px] shadow-[0_10px_32px_rgba(0,0,0,0.2)]',
          panelVisible ? 'ai-fab-hidden' : 'pointer-events-auto',
        )}
      >
        <span className="flex h-14 items-center gap-2.5 rounded-full bg-foreground px-5 text-[15px] font-semibold tracking-[-0.01em] text-white">
          <Sparkles className="size-5" strokeWidth={1.9} aria-hidden />
          ИИ ассистент по экономике
        </span>
      </button>
      </div>
    </div>
  );
}
