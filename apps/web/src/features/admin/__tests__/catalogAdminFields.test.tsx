import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { catalogToRows, rowsToCatalog } from '@domain/catalogTable';
import { syncApplicability, type CatalogSolution } from '@domain/catalog';
import { solutions } from '@/mocks/fixtures';
import { SolutionEditor } from '@/features/admin/SolutionEditor';
import { renderWithProviders } from '@/test/utils';

const byId = (id: string) => solutions.find((s) => s.id === id)! as CatalogSolution;

describe('новые поля каталога в админке', () => {
  it('выгрузка и загрузка таблицы сохраняют категорию, УГТ, фото и основания применимости', () => {
    const original = byId('FC0005');
    const { items, errors } = rowsToCatalog(catalogToRows([original]));
    expect(errors).toEqual([]);
    const row = items[0]!.data;
    expect(row.catalogCategory).toBe('FC');
    expect(row.trl).toBe(original.trl);
    expect(row.photos).toEqual(original.photos);
    expect(row.objectFit).toEqual(original.objectFit);
  });

  it('понятная ошибка в колонке оснований', () => {
    const rows = catalogToRows([byId('AM0001')]);
    const column = rows[0]!.indexOf('Основание применимости');
    rows[1]![column] = 'Склад: как-нибудь';
    const { errors } = rowsToCatalog(rows);
    expect(errors[0]?.message).toMatch(/Основание применимости.*заявлено в каталоге/);
  });

  it('список объектов и основания согласуются', () => {
    const before = byId('FC0005'); // аэропорт — выведено, клиника — заявлено
    // убрали аэропорт колонкой «Типы объектов» — основание клиники сохраняется
    expect(syncApplicability({ objectTypes: ['clinic'], objectFit: before.objectFit }, before).objectFit).toEqual({
      clinic: 'declared',
    });
    // новый объект без основания — «заявлено»
    expect(syncApplicability({ objectTypes: ['clinic', 'warehouse'] }, before).objectFit).toEqual({
      clinic: 'declared',
      warehouse: 'declared',
    });
    // правка только оснований — список объектов из них
    expect(syncApplicability({ objectFit: { airport: 'example' } }, before).objectTypes).toEqual(['airport']);
  });

  it('редактор показывает основания по каждому объекту, категорию и фото', () => {
    renderWithProviders(<SolutionEditor initial={byId('FC0005') as never} isNew={false} onDone={() => {}} />);
    expect(screen.getByLabelText('Аэропорт')).toHaveValue('inferred');
    expect(screen.getByLabelText('Медучреждение')).toHaveValue('declared');
    expect(screen.getByLabelText('Склад')).toHaveValue('');
    expect(screen.getByLabelText(/Категория каталога/)).toHaveValue('FC');
    expect(screen.getByLabelText(/Фото/)).toHaveValue('FC0005.webp');
  });
});
