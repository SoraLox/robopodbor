import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { withAdminEdits, type CatalogSolution } from '@domain/catalog';
import {
  buildCatalog,
  checkCatalogFiles,
  mergeCatalogVersion,
  type CatalogFiles,
  type CatalogResearch,
  type CatalogSupplements,
} from '@domain/robotCatalog';
import supplements from '@domain/catalogSupplements.json';
import research from '@domain/catalogResearch.json';
import built from '@domain/catalogSolutions.json';
import { RobotCatalogReport } from '@/features/admin/RobotCatalogImport';

const dir = path.resolve(__dirname, '../../../../../api/prisma/seed-data/robots-catalog');
const read = (file: string) => JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
const categories = read('categories.json') as CatalogFiles['categories'];
const files: CatalogFiles = {
  index: read('index.json'),
  categories,
  vendors: read('vendors.json'),
  codes: read('codes.json'),
  sources: read('sources.json'),
  data: Object.fromEntries(categories.items.map((c) => [c.file, read(c.file)])),
};
const photos = new Map((built as unknown as CatalogSolution[]).map((s) => [s.id, s.photos ?? []]));
const build = () =>
  buildCatalog(files, supplements as unknown as CatalogSupplements, (id) => photos.get(id) ?? [], research as unknown as CatalogResearch);

describe('новая версия каталога роботов', () => {
  it('папка каталога собирается в тот же каталог, что лежит в приложении', () => {
    expect(build().solutions).toEqual(built);
  });

  it('структура не той версии — понятная ошибка', () => {
    expect(checkCatalogFiles({ ...files, index: { ...files.index, schema_ver: '1.4.0' } })).toContain(
      'Структура каталога 1.4.0 — ожидается 2.x',
    );
    const { sources: _missing, ...withoutSources } = files;
    expect(checkCatalogFiles(withoutSources)).toContain('Нет файла sources.json');
  });

  it('та же версия поверх себя ничего не меняет', () => {
    const incoming = build().solutions.find((s) => s.id === 'AM0001')!;
    expect(mergeCatalogVersion(incoming, incoming).changed).toEqual([]);
  });

  it('новые значения из каталога приходят, правки администратора остаются', () => {
    const incoming = build().solutions.find((s) => s.id === 'AM0001')!;
    const edited: CatalogSolution = {
      ...incoming,
      payloadKg: 1200,
      speed: '1.2 м/с',
      fieldSources: withAdminEdits(incoming.fieldSources, ['payloadKg'], '28.09.2026'),
    };
    const { next, changed, keptAdmin } = mergeCatalogVersion(edited, incoming);
    expect(keptAdmin).toEqual(['payloadKg']);
    expect(next.payloadKg).toBe(1200);
    expect(next.speed).toBe(incoming.speed);
    expect(changed).toEqual(['speed']);
  });

  it('отчёт показывает, что изменится, и не прячет пропавшие решения', () => {
    render(
      <RobotCatalogReport
        report={{
          applied: false,
          version: { schema: '2.1.0', updated: '10.10.2026' },
          total: 190,
          fit: { warehouse: { declared: 30, example: 0, inferred: 8 } },
          filled: [],
          conflicts: ['AM0004 Ronavi SD: minAisleWidthM — в каталоге 0.5, у организатора 0.7'],
          added: [{ id: 'AM0020', name: 'Новый AMR' }],
          updated: [{ id: 'AM0001', name: 'Ronavi H1500', fields: ['speed', 'payloadKg'] }],
          unchanged: 185,
          missing: [{ id: 'AM0003', name: 'Ronavi H2000' }],
          keptAdmin: [],
        }}
      />,
    );
    expect(screen.getByText('Каталог v2.1.0 от 10.10.2026 · 190 решений с дополнениями организатора')).toBeInTheDocument();
    expect(screen.getByText('добавится').previousSibling).toHaveTextContent('1');
    expect(screen.getByText(/AM0001 · Ronavi H1500/).parentElement).toHaveTextContent('скорость, грузоподъёмность');
    expect(screen.getByText('Нет в новой версии — остаются в каталоге · 1')).toBeInTheDocument();
    expect(screen.getByText(/Расхождения с организатором/)).toBeInTheDocument();
  });
});
