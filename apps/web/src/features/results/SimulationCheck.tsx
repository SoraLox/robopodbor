import { useVerifyRows } from './simulation/simVerifyStore';

const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

function value(v: number | null) {
  return v === null || !Number.isFinite(v) ? '—' : nf.format(v);
}

/** Отклонение симуляции от расчёта парка, % (со знаком). */
function deviation(simulated: number | null, calculated: number | null): { text: string; tone: string } {
  if (simulated === null || !calculated) return { text: '—', tone: 'text-[#8E8E93]' };
  const pct = ((simulated - calculated) / calculated) * 100;
  const text = `${pct >= 0 ? '+' : '−'}${nf.format(Math.abs(pct))}%`;
  return { text, tone: Math.abs(pct) <= 15 ? 'text-status-operation' : 'text-status-piloting' };
}

function simTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h} ч ${m} мин` : `${m} мин`;
}

/**
 * «Нужно / Расчёт парка / В симуляции»: подтверждает ли сцена то, что посчитала экономика.
 * Строки публикует сцена отчёта (simVerifyStore), значения обновляются, пока идёт симуляция.
 */
export function SimulationCheck() {
  const { rows, simSeconds } = useVerifyRows();
  if (!rows.length) {
    return <p className="text-[13px] text-[#8E8E93]">Сцена ещё загружается — сверка появится, когда пойдёт симуляция.</p>;
  }
  return (
    <div className="grid gap-3">
      <p className="text-[12.5px] leading-snug text-[#6E6E73]">
        «Нужно» — пиковый спрос из паспорта, «Расчёт» — что успевает парк по расчёту, «Сцена» — что роботы
        сделали за {simTime(simSeconds)} модельного времени. Ускорьте сцену, чтобы значения устоялись.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[440px] text-[13px]">
          <thead>
            <tr className="text-left text-[11.5px] font-medium text-[#8E8E93]">
              <th className="py-1.5 pr-3 font-medium">Показатель</th>
              <th className="py-1.5 pr-3 text-right font-medium">Нужно</th>
              <th className="py-1.5 pr-3 text-right font-medium">Расчёт</th>
              <th className="py-1.5 pr-3 text-right font-medium">Сцена</th>
              <th className="py-1.5 text-right font-medium">Откл.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const dev = deviation(row.simulated, row.calculated);
              return (
                <tr key={row.label} className="border-t border-[#F2F2F2]">
                  <td className="py-2 pr-3 text-foreground">
                    {row.label}
                    <span className="text-[#8E8E93]">, {row.unit}</span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{value(row.required)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{value(row.calculated)}</td>
                  <td className="py-2 pr-3 text-right font-semibold tabular-nums">{value(row.simulated)}</td>
                  <td className={`py-2 text-right tabular-nums ${dev.tone}`}>{dev.text}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.some((row) => row.note) ? (
        <ul className="grid gap-1 text-[12px] leading-snug text-[#8E8E93]">
          {rows
            .filter((row) => row.note)
            .map((row) => (
              <li key={row.label}>
                {row.label}: {row.note}
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}
