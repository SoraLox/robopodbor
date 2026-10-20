import { useState } from "react";
import { ChevronDown, ListTodo, Minus, Plus } from "lucide-react";

// Панель «Задания»: кнопка на месте и открывает, и закрывает плашку.
// Внутри: сделано / в работе, загрузка, короткие действия по парку.

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
        text: `Узкое место ${g.load}%`,
        action: { role: g.role, delta: 1, label: `+1 ${noun}` },
      });
    } else if (g.load <= IDLE && g.count > 1) {
      list.push({
        key: `${g.label}-`,
        tone: "idle",
        text: `Простой ${g.load}%`,
        action: { role: g.role, delta: -1, label: `−1 ${noun}` },
      });
    }
  }
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
  return m >= 60 ? `${Math.floor(m / 60)}ч ${m % 60}м` : `${m}м`;
};

function SiteGridAnchor({ children }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-10 px-5 sm:px-8">
      <div className="pointer-events-auto relative mx-auto flex max-w-site justify-end">{children}</div>
    </div>
  );
}

export function JobsPanel({ jobs, onAdjustFleet, adjusting = false }) {
  const [open, setOpen] = useState(false);
  if (!jobs) return null;

  const advice = recommendationsOf(jobs);
  const settling = jobs.simSeconds < SETTLE_S;
  const stats = [
    { label: "Приёмка", value: jobs.doneIn },
    { label: "Отгрузка", value: jobs.doneOut },
    ...(jobs.donePick ? [{ label: "Отбор", value: jobs.donePick }] : []),
    ...(jobs.cartons ? [{ label: "Коробки", value: jobs.cartons }] : []),
    { label: "В работе", value: jobs.inFlight },
  ];

  return (
    <SiteGridAnchor>
      <div className="relative flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="jobs-panel"
          className={`flex h-10 items-center gap-2 rounded-[12px] border bg-white px-3 text-[13px] font-semibold text-[#1D1D1F] shadow-[0_4px_16px_rgba(0,0,0,0.08)] transition-colors hover:bg-[#FAFAFA] ${
            open ? "border-[#D1D1D6]" : "border-[#E5E5EA]"
          }`}
        >
          <ListTodo className="size-[18px]" strokeWidth={1.8} aria-hidden />
          Задания
          {advice.length ? (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#FF9F0A] px-1.5 text-[11px] font-bold text-white">
              {advice.length}
            </span>
          ) : null}
          <ChevronDown
            className={`size-4 text-[#8E8E93] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            strokeWidth={1.8}
            aria-hidden
          />
        </button>

        {open ? (
          <div
            id="jobs-panel"
            role="region"
            aria-label="Задания склада"
            className="w-[280px] max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-[14px] border border-[#E5E5EA] bg-white shadow-[0_8px_28px_rgba(0,0,0,0.10)]"
          >
            <div className="flex items-baseline justify-between gap-2 border-b border-[#F2F2F4] px-3 py-2">
              <span className="text-[12px] font-medium text-[#8E8E93]">За {minutes(jobs.simSeconds)}</span>
              <span className="text-[12px] tabular-nums text-[#8E8E93]">{jobs.inFlight} сейчас</span>
            </div>

            <ul className="grid grid-cols-3 gap-1.5 px-3 py-2.5">
              {stats
                .filter((s) => s.label !== "В работе")
                .map((s) => (
                  <li key={s.label} className="rounded-[8px] bg-[#F7F7F8] px-2 py-1.5 text-center">
                    <div className="text-[15px] font-semibold tabular-nums leading-none text-[#1D1D1F]">{s.value}</div>
                    <div className="mt-1 text-[10.5px] font-medium text-[#8E8E93]">{s.label}</div>
                  </li>
                ))}
            </ul>

            {jobs.groups.length ? (
              <div className="border-t border-[#F2F2F4] px-3 py-2.5">
                <ul className="grid gap-2">
                  {jobs.groups.map((g) => (
                    <li key={g.label}>
                      <div className="flex items-baseline justify-between gap-2 text-[12px]">
                        <span className="min-w-0 truncate text-[#3A3A3C]" title={g.label}>
                          {g.label}, {g.count}
                        </span>
                        <span className="flex-none font-semibold tabular-nums text-[#1D1D1F]">{g.load}%</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#F2F2F4]">
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

            <div className="border-t border-[#F2F2F4] px-3 py-2.5">
              {settling ? (
                <p className="text-[12px] text-[#8E8E93]">
                  Ещё {minutes(SETTLE_S - jobs.simSeconds)} до рекомендаций
                </p>
              ) : advice.length ? (
                <ul className="grid gap-1.5">
                  {advice.map((r) => (
                    <li
                      key={r.key}
                      className={`flex items-center justify-between gap-2 rounded-[10px] px-2.5 py-2 ${
                        r.tone === "busy" ? "bg-[#FFF4E5]" : "bg-[#F2F2F4]"
                      }`}
                    >
                      <span className="min-w-0 truncate text-[12px] font-medium text-[#3A3A3C]">{r.text}</span>
                      {onAdjustFleet ? (
                        <button
                          type="button"
                          disabled={adjusting}
                          onClick={() => onAdjustFleet(r.action.role, r.action.delta)}
                          className="flex h-7 flex-none items-center gap-1 rounded-[8px] bg-[#1D1D1F] px-2 text-[11.5px] font-semibold text-white disabled:opacity-40"
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
                <p className="text-[12px] text-[#3A3A3C]">Парк в балансе</p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </SiteGridAnchor>
  );
}
