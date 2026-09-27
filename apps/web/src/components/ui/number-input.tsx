import * as React from 'react';
import { Input, type InputProps } from '@/components/ui/input';
import {
  formatGroupedNumber,
  formatGroupedNumberAtCaret,
  normalizeGroupedNumber,
} from '@/lib/formatGroupedNumber';

export interface NumberInputProps extends Omit<InputProps, 'type' | 'inputMode' | 'value' | 'onChange'> {
  /** Каноническое значение: без пробелов, десятичная точка. */
  value: string;
  onValueChange: (next: string) => void;
}

/**
 * Числовое поле с типографской группировкой разрядов (10 000,5).
 * В state уходит нормализованная строка без пробелов.
 */
export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ value, onValueChange, onBlur, onFocus, ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement | null>(null);
    const [focused, setFocused] = React.useState(false);
    const [draft, setDraft] = React.useState(() => formatGroupedNumber(value));

    React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement);

    React.useEffect(() => {
      if (!focused) setDraft(formatGroupedNumber(value));
    }, [value, focused]);

    const setRefs = (node: HTMLInputElement | null) => {
      innerRef.current = node;
    };

    return (
      <Input
        {...props}
        ref={setRefs}
        inputMode="decimal"
        value={focused ? draft : formatGroupedNumber(value)}
        onFocus={(event) => {
          setFocused(true);
          setDraft(formatGroupedNumber(value));
          onFocus?.(event);
        }}
        onChange={(event) => {
          const el = event.target;
          const { value: next, caret } = formatGroupedNumberAtCaret(
            el.value,
            el.selectionStart ?? el.value.length,
          );
          setDraft(next);
          onValueChange(normalizeGroupedNumber(next));
          requestAnimationFrame(() => {
            const node = innerRef.current;
            if (!node) return;
            node.setSelectionRange(caret, caret);
          });
        }}
        onBlur={(event) => {
          setFocused(false);
          const normalized = normalizeGroupedNumber(draft);
          setDraft(formatGroupedNumber(normalized));
          onValueChange(normalized);
          onBlur?.(event);
        }}
      />
    );
  },
);
NumberInput.displayName = 'NumberInput';
