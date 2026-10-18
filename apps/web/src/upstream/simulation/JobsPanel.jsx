import { useState } from "react";
import { ChevronUp, ListTodo, Minus, Plus } from "lucide-react";

// Панель «Задания» над сценой склада: свёрнута в кнопку со списком дел; раскрытая —
// что сделано, загрузка групп роботов и рекомендации с действием «добавить /
// убрать робота в расчёте» (пересчитывает экономику и сцену).

// Рекомендации — только когда симуляция поработала: в первые минуты загрузка
// ещё не установилась.
const SETTLE_S = 600;
const BUSY = 90;
const IDLE = 35;

const NOUN = { forklift: "погрузчик", amr: "AMR" };

export function recommendationsOf(jobs) {
  if (!jobs || jobs.simSeconds < SETTLE_S || !jobs.groups.length) return [];
  const list = [];
  for (const g of jobs.groups) {
    const noun = NOUN[g.role];
    if (!noun) continue;
    if (g.load >= BUSY) {
      list.push({
        key: `${g.label}+`,
        tone: "busy",
        text: `Узкое место: ${g.label} заняты ${g.load}% времени — грузы ждут их. Ещё один ${noun} разгрузит участок.`,
        action: { role: g.role, delta: 1, label: `Добавить ${noun} в расчёт` },
      });
    } else if (g.load <= IDLE && g.count > 1) {
      list.push({
        key: `${g.label}-`,
        tone: "idle",
        text: `${g.label[0].toUpperCase()}${g.label.slice(1)} заняты всего ${g.load}% времени — один лишний.`,
        action: { role: g.role, delta: -1, label: `Убрать ${noun} из расчёта` },
      });
    }
  }
  // Одна роль — одно действие: сначала узкие места.
  const seen = new Set();
  return list.filter((r) => {
    const key = `${r.action.role}${r.action.delta}`;
    if (seen.has(key) || seen.has(`${r.action.role}${-r.action.delta}`)) return false;
    seen.add(key);
    return true;
  });
}

const minutes = (s) => {
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m} мин`;
};

export function JobsPanel({ jobs, onAdjustFleet, adjusting = false }) {
  const [open, setOpen] = useState(false);
  if (!jobs) return null;
  const advice = recommendationsOf(jobs);
  const rows = [
    ["Принято паллет", jobs.doneIn],
    ["Отгружено паллет", jobs.doneOut],
    ...(jobs.donePick ? [["Паллет в отбор", jobs.donePick]] : []),
    ...(jobs.cartons ? [["Коробок ушло по ленте", jobs.cartons]] : []),
    ["В работе сейчас", jobs.inFlight],
  ];

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        className="pointer-events-auto absolute left-3 top-3 z-10 flex h-10 items-center gap-2 rounded-[12px] border border-[#E5E5EA] bg-white px-3 text-[13px] font-semibold text-[#1D1D1F] shadow-[0_4px_16px_rgba(0,0,0,0.08)] transition-colors hover:bg-[#FAFAFA]"
      >
        <ListTodo className="size-[18px]" strokeWidth={1.8} aria-hidden />
        Задания
        {advice.length ? (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#FF9F0A] px-1.5 text-[11px] font-bold text-white">
            {advice.length}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <div className="pointer-events-auto absolute left-3 top-3 z-10 max-h-[calc(100%-230px)] w-[300px] max-w-[calc(100%-24px)] overflow-y-auto overscroll-contain rounded-[16px] border border-[#E5E5EA] bg-white shadow-[0_8px_28px_rgba(0,0,0,0.10)]">
      <div className="flex items-center gap-2 border-b border-[#F2F2F4] px-3.5 py-2.5">
        <ListTodo className="size-[18px] text-[#1D1D1F]" strokeWidth={1.8} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-[#1D1D1F]">Задания склада</div>
          <div className="text-[11px] text-[#8E8E93]">за {minutes(jobs.simSeconds)} симуляции</div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Свернуть задания"
          className="grid size-7 place-items-center rounded-[8px] text-[#6E6E73] hover:bg-[#F2F2F4]"
        >
          <ChevronUp className="size-4" strokeWidth={1.8} aria-hidden />
        </button>
      </div>

      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 px-3.5 py-2.5 text-[12px] tabular-nums">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-[#6E6E73]">{label}</dt>
            <dd className="text-right font-semibold text-[#1D1D1F]">{value}</dd>
          </div>
        ))}
      </dl>

      {jobs.groups.length ? (
        <div className="border-t border-[#F2F2F4] px-3.5 py-2.5">
          <div className="mb-1.5 text-[11.5px] font-semibold text-[#1D1D1F]">Загрузка роботов</div>
          <ul className="grid gap-1.5">
            {jobs.groups.map((g) => (
              <li key={g.label} className="grid gap-0.5">
                <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
                  <span className="truncate text-[#3A3A3C]">
                    {g.label} · {g.count}
                  </span>
                  <span className="font-semibold tabular-nums text-[#1D1D1F]">{g.load}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[#F2F2F4]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(2, g.load)}%`,
                      background: g.load >= BUSY ? "#FF9F0A" : g.load <= IDLE ? "#AEAEB2" : "#2F86F0",
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="border-t border-[#F2F2F4] px-3.5 py-2.5">
        <div className="mb-1.5 text-[11.5px] font-semibold text-[#1D1D1F]">Рекомендации</div>
        {jobs.simSeconds < SETTLE_S ? (
          <p className="text-[11.5px] leading-snug text-[#8E8E93]">
            Собираем статистику: рекомендации появятся через {minutes(SETTLE_S - jobs.simSeconds)} симуляции
            (ускорьте время кнопкой «+» скорости).
          </p>
        ) : advice.length ? (
          <ul className="grid gap-2">
            {advice.map((r) => (
              <li key={r.key} className={`rounded-[10px] px-2.5 py-2 ${r.tone === "busy" ? "bg-[#FFF4E5]" : "bg-[#F2F2F4]"}`}>
                <p className="text-[11.5px] leading-snug text-[#3A3A3C]">{r.text}</p>
                {onAdjustFleet ? (
                  <button
                    type="button"
                    disabled={adjusting}
                    onClick={() => onAdjustFleet(r.action.role, r.action.delta)}
                    className="mt-1.5 flex h-7 items-center gap-1 rounded-[8px] bg-[#1D1D1F] px-2.5 text-[11.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    {r.action.delta > 0 ? (
                      <Plus className="size-3.5" strokeWidth={2} aria-hidden />
                    ) : (
                      <Minus className="size-3.5" strokeWidth={2} aria-hidden />
                    )}
                    {r.action.label}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11.5px] leading-snug text-[#3A3A3C]">
            Парк сбалансирован: узких мест и простаивающих роботов нет.
          </p>
        )}
      </div>
    </div>
  );
}
