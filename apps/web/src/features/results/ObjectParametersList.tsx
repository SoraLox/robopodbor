import type { ObjectParameterGroup } from './objectParameters';

/**
 * Вводные: плотная сетка label / значение. Без эссе.
 */
export function ObjectParametersList({ groups }: { groups: ObjectParameterGroup[] }) {
  return (
    <div className="grid gap-4">
      {groups.map((group) => (
        <section key={group.title}>
          <h3 className="mb-1.5 text-[12px] font-semibold text-[#8E8E93]">{group.title}</h3>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
            {group.items.map((item) => (
              <div
                key={item.label}
                className="flex min-w-0 items-baseline justify-between gap-2 border-b border-[#F7F7F8] py-1.5 text-[12.5px]"
              >
                <dt className="min-w-0 truncate text-[#8E8E93]" title={item.label}>
                  {item.label}
                </dt>
                <dd className="flex-none font-semibold tabular-nums text-foreground">
                  {item.value}
                  {item.unit ? <span className="ml-0.5 font-normal text-[#8E8E93]">{item.unit}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

export default ObjectParametersList;
