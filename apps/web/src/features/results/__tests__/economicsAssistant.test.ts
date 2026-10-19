import { describe, expect, it } from 'vitest';
import { localAnswer, type EconomicsContext } from '@domain/economicsAssistant';

const context: EconomicsContext = {
  horizonYears: 5,
  capexMln: 70.7,
  totalInvestmentMln: 74.2,
  effectYearMln: 160.3,
  paybackYears: 0.5,
  discountedPaybackYears: 0.5,
  npvMln: 571,
  irrPct: 263,
  roiPct: 1267,
  discountRatePct: 15,
  salvageMln: 34.8,
  netBenefitMln: 760,
  robots: [{ name: 'AK-2000-2', count: 2, slot: 'inbound' }],
  costGroups: [{ title: 'Оборудование', amountMln: 60 }],
  levers: [{ title: 'Тариф на электроэнергию', savingMln: 0.4 }],
  sensitivity: [{ title: 'Зарплаты операторов', low: '0,4 г.', high: '0,7 г.' }],
};

describe('помощник по экономике без внешней модели', () => {
  it('объясняет термины на цифрах расчёта', () => {
    expect(localAnswer('Что такое NPV?', context)).toMatch(/571 млн ₽.*больше нуля/);
    expect(localAnswer('а IRR?', context)).toMatch(/263%/);
    expect(localAnswer('Почему такая окупаемость?', context)).toMatch(/74,2 млн ₽.*0,5/);
    expect(localAnswer('Что будет, если вырастут зарплаты?', context)).toMatch(/Зарплаты операторов/);
  });

  it('на непонятный вопрос — краткое резюме и подсказки, что спросить', () => {
    const answer = localAnswer('расскажи', context);
    expect(answer).toMatch(/вкладываете 74,2 млн ₽/);
    expect(answer).toMatch(/Можно спросить/);
  });
});
