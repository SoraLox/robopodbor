/**
 * Выгрузка результата расчёта. Делается на клиенте: серверного эндпоинта
 * экспорта нет и он не нужен — все цифры уже пришли с расчётом.
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { CalculationResult } from '@/api/types';

function fileBase(result: CalculationResult) {
  return `raschet-${result.id}`;
}

/**
 * PDF-обоснование для инвесткомитета.
 *
 * Кириллицу стандартные шрифты jsPDF не покрывают, поэтому подключаем
 * шрифт с кириллицей из уже загруженного набора Inter.
 */
export async function exportToPdf(result: CalculationResult) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  await embedCyrillicFont(doc);

  doc.setFontSize(16);
  doc.text(result.objectTitle, 40, 54);
  doc.setFontSize(9);
  doc.text(result.meta, 40, 72);

  doc.setFontSize(12);
  doc.text(
    `Срок окупаемости: ${result.payback.value} ${result.payback.unit ?? ''}`.trim(),
    40,
    104,
  );
  doc.setFontSize(10);
  doc.text(`CAPEX: ${result.capex.value} ${result.capex.note ?? ''}`.trim(), 40, 122);
  doc.text(`ROI: ${result.roi.value} · ${result.roi.note ?? ''}`.trim(), 40, 138);

  autoTable(doc, {
    startY: 162,
    head: [['Сценарий', 'Описание', 'TCO, млн ₽', 'Разница']],
    body: result.scenarios.map((s) => [s.title, s.subtitle, s.tco.toFixed(1), s.delta]),
    styles: { font: 'Inter', fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [234, 88, 12], textColor: 255 },
  });

  autoTable(doc, {
    head: [['Статья', 'Сумма, млн ₽', 'Доля', 'Достоверность']],
    body: result.costGroups.flatMap((group) => [
      [
        group.title,
        group.amount.toFixed(1),
        `${group.share}%`,
        group.confidence === 'confirmed' ? 'Подтверждено' : 'Требует проверки',
      ],
      ...group.lines.map((line) => [
        `    ${line.title}`,
        line.amount.toFixed(1),
        `${line.share}%`,
        line.source,
      ]),
    ]),
    styles: { font: 'Inter', fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [234, 88, 12], textColor: 255 },
  });

  doc.save(`${fileBase(result)}.pdf`);
}

/** Excel-модель: по листу на сценарии, затраты и допущения. */
export function exportToXlsx(result: CalculationResult) {
  const book = XLSX.utils.book_new();

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
          Достоверность:
            line.confidence === 'confirmed' ? 'Подтверждено' : 'Требует проверки',
        })),
      ),
    ),
    'CAPEX и OPEX',
  );

  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.json_to_sheet([
      { Показатель: 'Срок окупаемости', Значение: result.payback.value },
      { Показатель: 'CAPEX', Значение: result.capex.value },
      { Показатель: 'ROI', Значение: result.roi.value },
      { Показатель: 'Итого TCO', Значение: result.totalTco },
      ...result.assumptions.map((a, i) => ({ Показатель: `Допущение ${i + 1}`, Значение: a })),
    ]),
    'Допущения',
  );

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

/** Подмешивает в jsPDF шрифт с кириллицей — встроенные её не покрывают. */
async function embedCyrillicFont(doc: jsPDF) {
  const url = new URL(
    '@fontsource-variable/inter/files/inter-cyrillic-wght-normal.woff2',
    import.meta.url,
  ).href;
  try {
    const buffer = await fetch(url).then((r) => r.arrayBuffer());
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    doc.addFileToVFS('Inter.ttf', base64);
    doc.addFont('Inter.ttf', 'Inter', 'normal');
    doc.setFont('Inter');
  } catch {
    // Шрифт не подгрузился — печатаем стандартным, латиница и цифры читаемы.
  }
}
