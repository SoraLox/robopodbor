/**
 * Выгрузка результата расчёта. Делается на клиенте: серверного эндпоинта
 * экспорта нет и он не нужен — все цифры уже пришли с расчётом.
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { SOURCE_KIND_LABEL } from '@domain/sources';
import type { CalculationResult } from '@/api/types';
import ptSansBoldUrl from '@/assets/fonts/PTSans-Bold.ttf?url';
import ptSansRegularUrl from '@/assets/fonts/PTSans-Regular.ttf?url';
import { REPORT_DISCLAIMER, buildReportContext, type ReportContext } from './reportContext';

const SELECTION_STATUS: Record<string, string> = {
  recommended: 'Рекомендовано',
  'needs-review': 'Требует проверки',
  excluded: 'Не прошло подбор — выбрано вручную',
};

const FONT = 'PTSans';
const HEAD_STYLE = { fillColor: [44, 67, 114] as [number, number, number], textColor: 255, fontStyle: 'bold' as const };
const MARGIN = 40;

function fileBase(result: CalculationResult) {
  return `raschet-${result.id}`;
}

const dateTime = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function versionLine(ctx: ReportContext) {
  return `Сформировано ${dateTime.format(ctx.generatedAt)} · данные ${ctx.dataVersion} · модель ${ctx.modelVersion}`;
}

function solutionRows(ctx: ReportContext): string[][] {
  if (!ctx.solution) return [['Решение', 'не выбрано — расчёт по типовому набору']];
  const { solution, selection } = ctx;
  return [
    ['Решение', `${solution.name} · ${solution.vendor}`],
    ['Назначение', solution.useCase],
    ['Цена единицы', `${solution.price} млн ₽`],
    ['Результат подбора', selection ? `${SELECTION_STATUS[selection.status] ?? selection.status}${selection.status !== 'excluded' ? ` · ${selection.score} из 100` : ''}` : '—'],
    ...(selection?.blockers.length ? [['Почему не подходит', selection.blockers.join('; ')]] : []),
    ...(selection?.limitations.length ? [['Ограничения', selection.limitations.join('; ')]] : []),
    ...(selection?.missing.length ? [['Недостающие данные', selection.missing.join('; ')]] : []),
    ['Источник данных', [solution.source, solution.sourceDate].filter(Boolean).join(', ') || '—'],
  ];
}

/** Y после последней таблицы — чтобы следующий блок шёл следом. */
function afterTable(doc: jsPDF, gap = 22) {
  return ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 60) + gap;
}

function sectionTitle(doc: jsPDF, text: string, y: number) {
  const pageHeight = doc.internal.pageSize.getHeight();
  let top = y;
  if (top > pageHeight - 90) {
    doc.addPage();
    top = 54;
  }
  doc.setFont(FONT, 'bold');
  doc.setFontSize(12);
  doc.text(text, MARGIN, top);
  doc.setFont(FONT, 'normal');
  return top + 8;
}

/**
 * PDF-обоснование для инвесткомитета.
 *
 * Кириллицу стандартные шрифты jsPDF не покрывают, поэтому подключаем
 * шрифт с кириллицей из уже загруженного набора Inter.
 */
export async function exportToPdf(result: CalculationResult, objectType = 'warehouse') {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const [ctx] = await Promise.all([buildReportContext(result, objectType), embedCyrillicFont(doc)]);
  const pageWidth = doc.internal.pageSize.getWidth();
  const textWidth = pageWidth - MARGIN * 2;
  const table = { styles: { font: FONT, fontSize: 9, cellPadding: 5 }, headStyles: HEAD_STYLE, margin: { left: MARGIN, right: MARGIN } };

  doc.setFont(FONT, 'bold');
  doc.setFontSize(16);
  doc.text(result.objectTitle, MARGIN, 54);
  doc.setFont(FONT, 'normal');
  doc.setFontSize(9);
  doc.text(`${ctx.objectLabel} · ${result.meta}`, MARGIN, 70, { maxWidth: textWidth });

  const disclaimer = doc.splitTextToSize(REPORT_DISCLAIMER, textWidth - 20) as string[];
  const boxHeight = disclaimer.length * 12 + 14;
  doc.setFillColor(255, 244, 229);
  doc.rect(MARGIN, 82, textWidth, boxHeight, 'F');
  doc.setTextColor(120, 60, 0);
  doc.text(disclaimer, MARGIN + 10, 96);
  doc.setTextColor(0, 0, 0);

  let y = 82 + boxHeight + 24;
  doc.setFont(FONT, 'bold');
  doc.setFontSize(12);
  doc.text(`Срок окупаемости: ${result.payback.value} ${result.payback.unit ?? ''}`.trim(), MARGIN, y);
  doc.setFont(FONT, 'normal');
  doc.setFontSize(10);
  doc.text(`CAPEX: ${result.capex.value} ${result.capex.note ?? ''}`.trim(), MARGIN, y + 18);
  doc.text(`ROI: ${result.roi.value} · ${result.roi.note ?? ''}`.trim(), MARGIN, y + 34);
  y += 58;

  y = sectionTitle(doc, 'Выбранное решение', y);
  autoTable(doc, { ...table, startY: y, body: solutionRows(ctx), columnStyles: { 0: { cellWidth: 130 } } });

  y = sectionTitle(doc, 'Сценарии', afterTable(doc));
  autoTable(doc, {
    ...table,
    startY: y,
    head: [['Сценарий', 'Описание', 'TCO, млн ₽', 'Разница']],
    body: result.scenarios.map((s) => [s.title, s.subtitle, s.tco.toFixed(1), s.delta]),
  });

  y = sectionTitle(doc, 'Структура затрат', afterTable(doc));
  autoTable(doc, {
    ...table,
    startY: y,
    head: [['Статья', 'Сумма, млн ₽', 'Доля', 'Источник / достоверность']],
    body: result.costGroups.flatMap((group) => [
      [
        group.title,
        group.amount.toFixed(1),
        `${group.share}%`,
        group.confidence === 'confirmed' ? 'Подтверждено' : 'Требует проверки',
      ],
      ...group.lines.map((line) => [`    ${line.title}`, line.amount.toFixed(1), `${line.share}%`, line.source]),
    ]),
  });

  y = sectionTitle(doc, 'Параметры объекта', afterTable(doc));
  autoTable(doc, {
    ...table,
    startY: y,
    head: [['Раздел', 'Параметр', 'Значение', 'Происхождение']],
    body: ctx.parameters.map((p) => [
      p.section,
      p.label,
      p.value,
      p.byDefault ? `по умолчанию${p.source ? ` · ${p.source}` : ''}` : 'введено пользователем',
    ]),
    styles: { ...table.styles, fontSize: 8 },
  });

  y = sectionTitle(doc, 'Допущения', afterTable(doc));
  autoTable(doc, {
    ...table,
    startY: y,
    body: [
      ...result.assumptions.map((a, i) => [String(i + 1), a]),
      ...(ctx.solution?.unconfirmedFields?.length
        ? [[String(result.assumptions.length + 1), `Не подтверждены поставщиком: ${ctx.solution.unconfirmedFields.join(', ')}`]]
        : []),
    ],
    columnStyles: { 0: { cellWidth: 24 } },
  });

  if (ctx.sources.length) {
    y = sectionTitle(doc, 'Источники данных', afterTable(doc));
    autoTable(doc, {
      ...table,
      startY: y,
      head: [['Источник', 'Что покрывает', 'Актуальность', 'Статус']],
      body: ctx.sources.map((s) => [
        s.url ? `${s.title}\n${s.url}` : s.title,
        s.scope,
        s.actualAt,
        s.confirmed ? 'Подтверждён' : 'Требует проверки',
      ]),
    });
  }

  const pages = doc.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(7.5);
  doc.setTextColor(110, 110, 115);
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.text(`${versionLine(ctx)} · предварительная оценка`, MARGIN, pageHeight - 22);
    doc.text(`${page} / ${pages}`, pageWidth - MARGIN, pageHeight - 22, { align: 'right' });
  }

  doc.save(`${fileBase(result)}.pdf`);
}

/** Excel-модель: отчёт, сценарии, затраты, паспорт объекта, допущения, источники. */
export async function exportToXlsx(result: CalculationResult, objectType = 'warehouse') {
  const ctx = await buildReportContext(result, objectType);
  const book = XLSX.utils.book_new();

  const summary: Array<[string, string | number]> = [
    ['Объект', result.objectTitle],
    ['Тип объекта', ctx.objectLabel],
    ['Расчёт', result.meta],
    ['Оговорка', REPORT_DISCLAIMER],
    ['Дата формирования', dateTime.format(ctx.generatedAt)],
    ...(ctx.calculatedAt ? [['Дата расчёта', dateTime.format(new Date(ctx.calculatedAt))] as [string, string]] : []),
    ['Версия данных', ctx.dataVersion],
    ['Версия модели', ctx.modelVersion],
    ['Срок окупаемости', `${result.payback.value} ${result.payback.unit ?? ''}`.trim()],
    ['CAPEX', result.capex.value],
    ['ROI', result.roi.value],
    ['Итого TCO, млн ₽', result.totalTco],
    ...(solutionRows(ctx) as Array<[string, string]>),
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet([['Показатель', 'Значение'], ...summary]);
  summarySheet['!cols'] = [{ wch: 24 }, { wch: 100 }];
  XLSX.utils.book_append_sheet(book, summarySheet, 'Отчёт');

  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.json_to_sheet(
      result.scenarios.map((s) => ({
        Сценарий: s.title,
        Описание: s.subtitle,
        'TCO, млн ₽': s.tco,
        Разница: s.delta,
        Рекомендуемый: s.recommended ? 'да' : '',
      })),
    ),
    'Сценарии',
  );

  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.json_to_sheet(
      result.costGroups.flatMap((group) =>
        group.lines.map((line) => ({
          Группа: group.title,
          Статья: line.title,
          'Сумма, млн ₽': line.amount,
          'Доля, %': line.share,
          Источник: line.source,
          Достоверность: line.confidence === 'confirmed' ? 'Подтверждено' : 'Требует проверки',
        })),
      ),
    ),
    'CAPEX и OPEX',
  );

  if (ctx.parameters.length) {
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.json_to_sheet(
        ctx.parameters.map((p) => ({
          Раздел: p.section,
          Параметр: p.label,
          Значение: p.value,
          Происхождение: p.byDefault ? 'по умолчанию' : 'введено пользователем',
          'Источник норматива': p.source ?? '',
        })),
      ),
      'Паспорт объекта',
    );
  }

  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.json_to_sheet([
      ...result.assumptions.map((a, i) => ({ '№': i + 1, Допущение: a })),
      ...(ctx.solution?.unconfirmedFields?.length
        ? [{ '№': result.assumptions.length + 1, Допущение: `Не подтверждены поставщиком: ${ctx.solution.unconfirmedFields.join(', ')}` }]
        : []),
    ]),
    'Допущения',
  );

  if (ctx.sources.length) {
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.json_to_sheet(
        ctx.sources.map((s) => ({
          Источник: s.title,
          Тип: SOURCE_KIND_LABEL[s.kind],
          'Что покрывает': s.scope,
          Актуальность: s.actualAt,
          Статус: s.confirmed ? 'Подтверждён' : 'Требует проверки',
          Ссылка: s.url ?? '',
        })),
      ),
      'Источники',
    );
  }

  if (result.sensitivity?.length) {
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.json_to_sheet(
        result.sensitivity.map((f) => ({
          Параметр: f.label,
          'Влияние, доля': f.impact,
          'Нижняя граница': f.low ?? '',
          'Верхняя граница': f.high ?? '',
        })),
      ),
      'Чувствительность',
    );
  }

  XLSX.writeFile(book, `${fileBase(result)}.xlsx`);
}

/**
 * Подмешивает в jsPDF шрифт с кириллицей: встроенные её не покрывают, а jsPDF
 * принимает только TTF (woff2 из веб-шрифтов он молча отбрасывает).
 * PT Sans — OFL, лицензия лежит рядом с файлами шрифта.
 */
async function embedCyrillicFont(doc: jsPDF) {
  const toBase64 = (buffer: ArrayBuffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  };
  try {
    const [regular, bold] = await Promise.all(
      [ptSansRegularUrl, ptSansBoldUrl].map((url) => fetch(url).then((r) => r.arrayBuffer())),
    );
    doc.addFileToVFS('PTSans-Regular.ttf', toBase64(regular!));
    doc.addFont('PTSans-Regular.ttf', FONT, 'normal');
    doc.addFileToVFS('PTSans-Bold.ttf', toBase64(bold!));
    doc.addFont('PTSans-Bold.ttf', FONT, 'bold');
    doc.setFont(FONT, 'normal');
  } catch {
    // Шрифт не подгрузился — печатаем стандартным, латиница и цифры читаемы.
  }
}
