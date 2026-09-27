import { createContext, useContext } from 'react';

export const WizardCompanionContext = createContext<{
  setCompanionOpen: (open: boolean) => void;
  setRailOpen: (open: boolean) => void;
}>({
  setCompanionOpen: () => {},
  setRailOpen: () => {},
});

/** Превью / рейка сообщают карточке, что открыты: группа центрируется сдвигом. */
export function useWizardCompanion() {
  return useContext(WizardCompanionContext);
}
