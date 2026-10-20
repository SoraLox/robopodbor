import { useVerifyRows } from './simulation/simVerifyStore';
import { cn } from '@/lib/utils';

const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

function value(v: number | null) {
  return v === null || !Number.isFinite(v) ? '-' : nf.format(v);
}

/** Δ к мощности парка (Расчёт); если Расчёта нет — к Нужно (поток без парка). */
export function deviation(
  simulated: number | null,
  calculated: number | null,
  required: number | null,
): { text: string; ok: boolean } {
  const baseline = calculated ?? required;
  if (simulated === null || !baseline) return { text: '-', ok: true };
  const pct = ((simulated - baseline) / baseline) * 100;
  const text = `${pct >= 0 ? '+' : '−'}${nf.format(Math.abs(pct))}%`;
  return { text, ok: pct >= -15 };
}

function simTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}ч ${m}м` : `${m}м`;
}

/**
 * Сверка сцены: одна таблица.
 * Δ — сцена vs расчётная мощность видимого парка (не vs пик паспорта).
 */
export function SimulationCheck() {
  const { rows, simSeconds } = useVerifyRows();
  if (!rows.length) {
    return <p className="text-[13px] text-[#8E8E93]">Сцена ещё загружается.</p>;
  }

  const notes = rows.map((row) => row.note).filter(Boolean);

  return (
    <div className="grid gap-3">
      <div className="text-[12px] text-[#8E8E93]">
        Пик · {simTime(simSeconds)}. Δ — к колонке «Расчёт» (мощность парка в сцене), не к «Нужно».
      </div>
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="text-left text-[11px] font-medium text-[#8E8E93]">
            <th className="pb-2 pr-2 font-medium">Показатель</th>
            <th className="pb-2 pr-2 text-right font-medium">Нужно</th>
            <th className="pb-2 pr-2 text-right font-medium">Расчёт</th>
            <th className="pb-2 pr-2 text-right font-medium">Сцена</th>
            <th className="pb-2 text-right font-medium">Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const dev = deviation(row.simulated, row.calculated, row.required);
            return (
              <tr key={row.label} className="border-t border-[#F2F2F4]">
                <td className="py-2 pr-2 font-medium text-foreground">
                  {row.label}
                  <span className="ml-1 font-normal text-[#8E8E93]">{row.unit}</span>
                </td>
                <td className="py-2 pr-2 text-right tabular-nums text-[#6E6E73]">{value(row.required)}</td>
                <td className="py-2 pr-2 text-right tabular-nums text-[#6E6E73]">{value(row.calculated)}</td>
                <td className="py-2 pr-2 text-right font-semibold tabular-nums text-foreground">
                  {value(row.simulated)}
                </td>
                <td
                  className={cn(
                    'py-2 text-right font-semibold tabular-nums',
                    dev.ok ? 'text-[#1F7A4D]' : 'text-[#D03B3B]',
                  )}
                >
                  {dev.text}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {notes.length ? (
        <ul className="grid gap-1 text-[12px] text-[#8E8E93]">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
