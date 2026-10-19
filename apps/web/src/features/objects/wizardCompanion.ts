import { createContext, useContext, useLayoutEffect, useState } from 'react';

export const WizardCompanionContext = createContext<{
  setCompanionOpen: (open: boolean) => void;
  setRailOpen: (open: boolean) => void;
  /** Ширина рейки слева: узкая (категории) или панель примеров планировки. */
  setRailWidth: (width: number) => void;
  /** Рейка помещается сбоку от карточки (на узком экране — нет). */
  railFits: boolean;
}>({
  setCompanionOpen: () => {},
  setRailOpen: () => {},
  setRailWidth: () => {},
  railFits: false,
});

/** Превью / рейка сообщают карточке, что открыты: группа центрируется сдвигом. */
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
    };
  }, [open, setSlotOpen]);

  return entered;
}
