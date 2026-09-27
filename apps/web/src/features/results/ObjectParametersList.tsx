import type { ObjectParameterGroup } from './objectParameters';

/**
 * Вводные: плоские строки label → value, сгруппированные подзаголовком.
 * Без мини-карточек — быстрее сканируется глазом.
 */
export function ObjectParametersList({ groups }: { groups: ObjectParameterGroup[] }) {
  return (
    <div className="grid gap-3">
      {groups.map((group) => (
        <div key={group.title}>
          <div className="px-1 text-[11.5px] font-medium text-[#8E8E93]">{group.title}</div>
          <dl className="mt-1">
            {group.items.map((item) => (
              <div
                key={item.label}
                className="flex items-baseline justify-between gap-3 rounded-[12px] px-1 py-1.5 text-[13px]"
              >
                <dt className="min-w-0 text-[#8E8E93]">{item.label}</dt>
                <dd className="whitespace-nowrap font-medium tabular-nums text-foreground">
                  {item.value}
                  {item.unit ? (
                    <span className="ml-1 font-normal text-[#8E8E93]">{item.unit}</span>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

export default ObjectParametersList;
