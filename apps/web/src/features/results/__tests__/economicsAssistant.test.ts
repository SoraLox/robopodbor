import { describe, expect, it } from 'vitest';
import {
  buildUserPrompt,
  classifyEconomicsQuestion,
  isSuggestedQuestion,
  localAnswer,
  looksOffTopicAnswer,
  parseCapexUnitLines,
  stripQuestionNoise,
  SUGGESTED_QUESTIONS,
  type EconomicsContext,
} from '@domain/economicsAssistant';

const context: EconomicsContext = {
  horizonYears: 5,
  capexMln: 70.7,
  totalInvestmentMln: 74.2,
  effectYearMln: 160.3,
  paybackYears: 0.5,
  discountedPaybackYears: 0.5,
  npvMln: 571,
  irrPct: 263,
  roiPct: 253,
  discountRatePct: 15,
  salvageMln: 34.8,
  netBenefitMln: 760,
  opexYearMln: 12,
  robots: [
    { name: 'AK-2000-2', count: 3, slot: 'inbound' },
    { name: 'AK-2000-2', count: 3, slot: 'outbound' },
  ],
  costGroups: [{ title: 'Оборудование', amountMln: 60 }],
  levers: [{ title: 'Тариф на электроэнергию', savingMln: 0.4 }],
  sensitivity: [{ title: 'Зарплаты операторов', low: '0,4 г.', high: '0,7 г.' }],
};

const capexDetails = `РАЗБИВКА CAPEX — разовые вложения (сумма строк 23,4 млн ₽ = CAPEX 23,4 млн ₽ с округлением):
- 3 × AK-2000-2 — приёмка: 8,8 млн ₽
- 3 × AK-2000-2 — отгрузка: 8,8 млн ₽
- Программное обеспечение: 1,7 млн ₽
- Внедрение и интеграция: 2,9 млн ₽
- Резерв 5%: 1,1 млн ₽
`;

const passportDump = `ПАСПОРТ СКЛАДА (введено пользователем или по умолчанию):
— общие параметры объекта / Общая площадь склада: 20 000 м²
— общие параметры объекта / Площадь активной (роботизируемой) зоны: 10 000 м²`;

describe('помощник по экономике', () => {
  it('узнаёт чипы подсказок', () => {
    for (const q of SUGGESTED_QUESTIONS) expect(isSuggestedQuestion(q)).toBe(true);
    expect(isSuggestedQuestion('Что будет если купить еще один погрузчик')).toBe(false);
  });

  it('классифицирует тему для обрезки досье модели', () => {
    expect(classifyEconomicsQuestion('Что будет если купить еще один погрузчик')).toBe('extra_unit');
    expect(classifyEconomicsQuestion('я тебя спрашиваю что будет если купить добавить на склад еще один погрузчик')).toBe(
      'extra_unit',
    );
    expect(classifyEconomicsQuestion('Что будет, если вырастут зарплаты?')).toBe('sensitivity');
    expect(classifyEconomicsQuestion('Почему такая окупаемость?')).toBe('payback');
  });

  it('чистит обёртку вопроса и собирает ясную задачу для модели', () => {
    expect(stripQuestionNoise('я тебя спрашиваю что будет если купить еще один погрузчик')).toMatch(/^что будет если/i);
    const prompt = buildUserPrompt('я тебя спрашиваю что будет если купить еще один погрузчик', 'extra_unit');
    expect(prompt).toMatch(/ВОПРОС:.*погрузчик/i);
    expect(prompt).toMatch(/ЗАДАЧА:.*добавлен/i);
    expect(prompt).toMatch(/Первая фраза/);
  });

  it('парсит цену единицы из разбивки CAPEX', () => {
    const lines = parseCapexUnitLines(capexDetails);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ count: 3, name: 'AK-2000-2', totalMln: 8.8, unitMln: 2.9 });
  });

  it('запасной ответ на чип — по смыслу экономики, не дамп', () => {
    const answer = localAnswer(SUGGESTED_QUESTIONS[0], context);
    expect(answer).toMatch(/74,2|экономи/i);
    expect(answer).not.toMatch(/ПАСПОРТ/);
  });

  it('запасной ответ на +1 погрузчик — оценка, не чувствительность', () => {
    const answer = localAnswer('Что будет если купить добавить на склад еще один погрузчик', context, capexDetails);
    expect(answer).toMatch(/AK-2000-2/);
    expect(answer).toMatch(/вложения вырастут|2,9 млн/);
    expect(answer).not.toMatch(/Окупаемость при изменении факторов/);
  });

  it('отклоняет дамп паспорта как ответ не про паспорт', () => {
    expect(looksOffTopicAnswer(passportDump, 'Что будет если купить еще один погрузчик')).toBe(true);
    expect(looksOffTopicAnswer(passportDump, 'покажи паспорт склада')).toBe(false);
  });

  it('у запасных формулировок чипа есть несколько вариантов', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i += 1) seen.add(localAnswer(SUGGESTED_QUESTIONS[0], context));
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });
});
