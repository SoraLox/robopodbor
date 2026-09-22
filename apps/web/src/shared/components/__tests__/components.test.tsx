import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ComparisonTable,
  DataCard,
  KpiBlock,
  SectionHeading,
  StatusBadge,
  Stepper,
} from '@/shared/components';

describe('SectionHeading', () => {
  it('рисует заголовок и служебную подпись', () => {
    render(<SectionHeading meta="TCO, 7 ЛЕТ">Сравнение сценариев</SectionHeading>);
    expect(screen.getByText('Сравнение сценариев')).toBeInTheDocument();
    expect(screen.getByText('TCO, 7 ЛЕТ')).toBeInTheDocument();
  });
});

describe('KpiBlock', () => {
  it('показывает число, единицу и пояснение', () => {
    render(
      <KpiBlock label="Срок окупаемости" value="3.2" unit="года" trend="down" note="NPV 71.4" />,
    );
    expect(screen.getByText('3.2')).toBeInTheDocument();
    expect(screen.getByText('года')).toBeInTheDocument();
    expect(screen.getByText('NPV 71.4')).toBeInTheDocument();
  });
});

describe('StatusBadge', () => {
  it('подставляет подпись по варианту', () => {
    render(<StatusBadge variant="operation" />);
    expect(screen.getByText('В эксплуатации')).toBeInTheDocument();
  });

  it('пропускает свой текст', () => {
    render(<StatusBadge variant="confirmed">Прайс 2026</StatusBadge>);
    expect(screen.getByText('Прайс 2026')).toBeInTheDocument();
  });
});

describe('DataCard', () => {
  it('в выбранном состоянии помечается aria-pressed', () => {
    render(
      <DataCard selected onClick={() => undefined}>
        Склад
      </DataCard>,
    );
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Stepper', () => {
  it('помечает активный шаг', () => {
    render(
      <Stepper
        current={1}
        steps={[
          { id: 'a', label: 'Тип объекта' },
          { id: 'b', label: 'Параметры' },
        ]}
      />,
    );
    expect(screen.getByText('Параметры').closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    );
  });
});

describe('ComparisonTable', () => {
  it('рисует шапку, строки и итог', () => {
    render(
      <ComparisonTable
        columns={[
          { key: 'name', header: 'Решение' },
          { key: 'price', header: 'Цена', align: 'right' },
        ]}
        rows={[{ id: 'p15', cells: { name: 'AMR-паллетовоз P15', price: '7.4' } }]}
        footer={{ name: 'Итого', price: '7.4' }}
      />,
    );
    // Таблица рендерится дважды — grid для md+ и карточки для мобильных
    // (см. ComparisonTable.tsx), поэтому подписи колонок закономерно
    // повторяются в DOM.
    expect(screen.getAllByText('Решение').length).toBeGreaterThan(0);
    expect(screen.getAllByText('AMR-паллетовоз P15').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Итого').length).toBeGreaterThan(0);
  });
});
