/**
 * Три базовых примера DXF для модалки импорта.
 * Клик = тот же путь, что перетаскивание своего файла.
 */

import warehouseBayDxf from './samples/warehouse-bay.dxf?raw';
import loadingDockDxf from './samples/loading-dock.dxf?raw';
import warehouseShellDxf from './samples/warehouse-shell.dxf?raw';

export type DxfSample = {
  id: string;
  /** Короткое имя на плашке. */
  title: string;
  /** Одна строка — что внутри. */
  hint: string;
  fileName: string;
  source: string;
};

export const DXF_SAMPLES: DxfSample[] = [
  {
    id: 'bay',
    title: 'Стеллажный пролёт',
    hint: 'Ряды стеллажей и рабочие проходы',
    fileName: 'warehouse-bay.dxf',
    source: warehouseBayDxf,
  },
  {
    id: 'dock',
    title: 'Погрузочный док',
    hint: 'Ворота выгрузки и зона приёмки',
    fileName: 'loading-dock.dxf',
    source: loadingDockDxf,
  },
  {
    id: 'shell',
    title: 'Контур склада',
    hint: 'Только оболочка здания без разметки',
    fileName: 'warehouse-shell.dxf',
    source: warehouseShellDxf,
  },
];
