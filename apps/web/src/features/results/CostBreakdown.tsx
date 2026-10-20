import type { CostGroup } from '@/api/types';
import { cn, fmt } from '@/lib/utils';

const GROUP_COLOR = ['#2F86F0', '#EB6834', '#8E8E93', '#1BAF7A'];

export type CostZone = 'vacuum' | 'arm' | 'all';

function guessZone(title: string): CostZone {
  const normalized = title.toLowerCase();
  if (/сортиров|роборук|манипулятор/.test(normalized)) return 'arm';
  if (/amr|паллетовоз|wcs|заряд|вилочн|транспорт/.test(normalized)) return 'vacuum';
  return 'all';
}

/** Короткое имя группы: «CAPEX: разовая покупка» → «CAPEX». */
function shortGroup(title: string) {
  const head = title.split(/[:—–-]/)[0]?.trim();
  return head || title;
}

/**
 * Затраты в панели: доля + суммы. Без простыней, сканируется за секунду.
 */
export function CostBreakdown({
  groups,
  total,
  onHoverLine,
}: {
  groups: CostGroup[];
  total: number;
  onHoverLine?: (zone: CostZone | null) => void;
}) {
  return (
    <div className="grid gap-4">
      <div className="flex items-end justify-between gap-3">
        <div className="text-[12px] font-medium text-[#8E8E93]">Итого TCO</div>
        <div className="text-[22px] font-semibold tabular-nums tracking-[-0.03em] text-foreground">
          {fmt(total)} <span className="text-[13px] font-medium text-[#8E8E93]">млн ₽</span>
        </div>
      </div>

      <div className="flex h-2 overflow-hidden rounded-[3px] bg-[#F2F2F4]" role="presentation">
        {groups.map((group, index) => (
          <div
            key={group.id}
            style={{ width: `${group.share}%`, background: GROUP_COLOR[index % GROUP_COLOR.length] }}
            title={`${shortGroup(group.title)}: ${group.share}%`}
          />
        ))}
      </div>

      <ul className="grid gap-3">
        {groups.map((group, index) => (
          <li key={group.id}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="inline-flex min-w-0 items-center gap-2 text-[13px] font-semibold text-foreground">
                <span
                  className="size-2 flex-none rounded-[2px]"
                  style={{ background: GROUP_COLOR[index % GROUP_COLOR.length] }}
                  aria-hidden
                />
                <span className="truncate">{shortGroup(group.title)}</span>
                <span className="font-medium tabular-nums text-[#8E8E93]">{group.share}%</span>
              </span>
              <span className="flex-none text-[13px] font-semibold tabular-nums">{fmt(group.amount)}</span>
            </div>
            <ul className="mt-1.5">
              {group.lines.map((line) => (
                <li
                  key={line.title}
                  title={line.title}
                  onMouseEnter={() => onHoverLine?.(guessZone(line.title))}
                  onMouseLeave={() => onHoverLine?.(null)}
                  className={cn(
                    'flex items-baseline justify-between gap-3 py-1 text-[12.5px]',
                    onHoverLine && 'rounded-[4px] px-0.5 hover:bg-[#FAFAFA]',
                  )}
                >
                  <span className="min-w-0 truncate text-[#6E6E73]">{line.title}</span>
                  <span className="flex-none tabular-nums font-medium text-foreground">{fmt(line.amount)}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
