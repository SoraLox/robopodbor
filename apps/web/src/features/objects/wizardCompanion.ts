import { createContext, useContext, useLayoutEffect, useState } from 'react';

export const WizardCompanionContext = createContext<{
  setCompanionOpen: (open: boolean) => void;
  setRailOpen: (open: boolean) => void;
  /** Ширина рейки слева: узкая (категории) или панель примеров планировки. */
  setRailWidth: (width: number) => void;
  /** Ширина правого спутника: превью робота или плашка-подсказка. */
  setCompanionWidth: (width: number) => void;
  /**
   * Превью: true — сдвигать группу, чтобы (карточка + превью) были по центру.
   * Подсказка: false — основная карточка остаётся по центру, плашка справа от неё.
   */
  setCompanionRecenter: (recenter: boolean) => void;
  /** Рейка помещается сбоку от карточки (на узком экране — нет). */
  railFits: boolean;
  /** Правый спутник помещается сбоку (иначе — оверлей / inline). */
  companionFits: boolean;
}>({
  setCompanionOpen: () => {},
  setRailOpen: () => {},
  setRailWidth: () => {},
  setCompanionWidth: () => {},
  setCompanionRecenter: () => {},
  railFits: false,
  companionFits: false,
});

/** Превью / рейка / подсказка сообщают карточке слоты и сдвиг группы. */
export function useWizardCompanion() {
  return useContext(WizardCompanionContext);
}

/**
 * Enter-анимация спутника: сначала кадр в «закрытом» состоянии, потом open.
 * Иначе при первом открытии CSS-transition не из чего интерполировать — резкий pop.
 */
export function useWizardEnter(open: boolean, setSlotOpen: (open: boolean) => void) {
  const [entered, setEntered] = useState(false);

  useLayoutEffect(() => {
    if (!open) {
      setEntered(false);
      setSlotOpen(false);
      return;
    }

    // Держим закрытый вид + слот, пока браузер не отрисует исходный кадр.
    setEntered(false);
    setSlotOpen(false);

    let innerId = 0;
    const outerId = requestAnimationFrame(() => {
      innerId = requestAnimationFrame(() => {
        setEntered(true);
        setSlotOpen(true);
      });
    });

    return () => {
      cancelAnimationFrame(outerId);
      cancelAnimationFrame(innerId);
      // Слот иначе остаётся pointer-events / open после размонтирования превью.
      setEntered(false);
      setSlotOpen(false);
    };
  }, [open, setSlotOpen]);

  return entered;
}
