import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCalculation } from '@/api/queries';

/** Быстрый разгон к 90%: за ~1 с уже далеко, дальше кривая почти стоит. */
const RUSH_TAU_MS = 900;
const CAP = 0.9;
/** Доля, с которой разгон отдаёт место редким шагам. */
const STALL_AT = 0.885;
const FINISH_MS = 280;
const HOLD_MS = 180;

const TICKS: { gap: number; jump: number }[] = [
  { gap: 640, jump: 0.016 },
  { gap: 920, jump: 0.009 },
  { gap: 1280, jump: 0.005 },
  { gap: 1700, jump: 0.003 },
  { gap: 2200, jump: 0.002 },
  { gap: 2800, jump: 0.001 },
];

function rush(elapsed: number): number {
  return CAP * (1 - Math.exp(-elapsed / RUSH_TAU_MS));
}

/**
 * Полоса ожидания расчёта.
 * Пока ответа нет — разгон к 90% и редкие шаги чуть выше, каждый меньше предыдущего.
 * 100% только когда расчёт реально пришёл.
 */
function ProgressTrack({ value, glide }: { value: number; glide: boolean }) {
  const pct = Math.round(value * 1000) / 10;

  return (
    <div
      className="h-[2px] w-full overflow-hidden rounded-full bg-[#E5E5EA]"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext="Считаем экономику"
      aria-label="Считаем экономику"
    >
      <div
        className="h-full rounded-full bg-foreground"
        style={{
          width: `${pct}%`,
          transition: glide ? `width ${FINISH_MS}ms cubic-bezier(0.22, 1, 0.36, 1)` : 'none',
        }}
      />
    </div>
  );
}

/**
 * Шаг мастера между выбором робота и отчётом.
 * Карточка та же. «Назад» — это кнопка карточки: уход со шага гасит переход в отчёт.
 */
export function CalculatingStep({ active, revealed }: { active: boolean; revealed: boolean }) {
  const navigate = useNavigate();
  const { objectType = 'warehouse' } = useParams<{ objectType: string }>();
  const query = useCalculation('demo', active);
  const [value, setValue] = useState(0);
  const [glide, setGlide] = useState(false);
  const succeeded = useRef(false);
  succeeded.current = query.isSuccess;

  useEffect(() => {
    if (!active) {
      setValue(0);
      setGlide(false);
      return;
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setValue(query.isSuccess ? 1 : CAP);
      return;
    }
    if (query.isSuccess) return;

    let raf = 0;
    const timers: number[] = [];
    const t0 = performance.now();
    let stalled = false;
    let crept = CAP;

    const frame = (now: number) => {
      if (succeeded.current) return;
      const next = rush(now - t0);
      if (next < STALL_AT) {
        setGlide(false);
        setValue(next);
        raf = requestAnimationFrame(frame);
        return;
      }
      if (stalled) return;
      stalled = true;
      setGlide(true);
      setValue(CAP);
      let wait = 0;
      for (const tick of TICKS) {
        wait += tick.gap;
        const delay = wait;
        timers.push(
          window.setTimeout(() => {
            if (succeeded.current) return;
            crept = Math.min(0.98, crept + tick.jump);
            setGlide(true);
            setValue(crept);
          }, delay),
        );
      }
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [active, query.isSuccess]);

  useEffect(() => {
    if (!active || !query.isSuccess) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const go = () => navigate(`/calculate/${objectType}/results/demo`);

    if (!revealed || reduced) {
      go();
      return;
    }

    setGlide(true);
    setValue(1);
    const hold = window.setTimeout(go, FINISH_MS + HOLD_MS);
    return () => window.clearTimeout(hold);
  }, [active, revealed, query.isSuccess, navigate, objectType]);

  if (query.isError) {
    return (
      <p role="alert" className="pt-6 text-[13px] leading-snug text-[#8E8E93]">
        Не удалось посчитать экономику.
      </p>
    );
  }

  return (
    <div className="pt-3">
      <ProgressTrack value={value} glide={glide} />
    </div>
  );
}
