import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CatalogPage } from '@/features/catalog/CatalogPage';
import { renderWithProviders } from '@/test/utils';

// На странице 192 карточки: запросы по ролям обходят всё дерево доступности и
// стоят секунды, поэтому ищем по подписям и тексту.
describe('CatalogPage — фильтры каталога роботов', () => {
  it('весь каталог по категориям, поиск латиницей, без пустых фильтров', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CatalogPage />, { route: '/catalog' });

    // Ветка есть и свёрнута: категорий не видно, пока её не раскрыли.
    const [expand] = await screen.findAllByLabelText('Развернуть «Весь каталог по категориям»');
    const tree = expand!.closest('li')!;
    expect(within(tree).queryByText('Беспилотники')).toBeNull();
    await user.click(expand!);
    await user.click(within(tree).getByText('Беспилотники'));
    expect(await screen.findByText('Supercam X6M2')).toBeInTheDocument();
    expect(screen.queryByText('Ronavi H1500')).toBeNull();

    await user.click(screen.getAllByText('Все решения')[0]!);
    await user.type(screen.getByLabelText('Поиск по каталогу'), 'rubi');
    expect(await screen.findByText('РУБИ-С-03')).toBeInTheDocument();
    expect(screen.queryByText('Ronavi H1500')).toBeNull();

    await user.click(screen.getAllByText('Подробные фильтры')[0]!);
    expect(screen.getAllByText('Зрелость').length).toBeGreaterThan(0);
    expect(screen.queryByText('Доступность')).toBeNull();
    // Достоверность у карточек разная (сортеры и конвейеры — оценки по открытым
    // источникам, «требует проверки»), поэтому фильтр «Данные» есть и не пустой.
    expect(screen.getAllByText('Данные').length).toBeGreaterThan(0);
  });
});
