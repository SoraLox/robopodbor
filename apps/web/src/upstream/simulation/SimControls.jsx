// Элементы управления над сценой и под ней: вид камеры, этажи, пуск/пауза/сброс, скорость.
import { useEffect, useState } from "react";

const SPEED_OPTIONS = [1, 2, 4, 8, 18, 32, 64, 128];

const ROUND_BUTTON = "w-8 h-8 rounded-full bg-white/70 hover:bg-white text-[#3F4159] font-bold shadow-sm transition";
const pill = (on) =>
  on ? "bg-[#3F4159] text-white" : "bg-white/70 hover:bg-white text-[#3F4159]";

// 3D / 2D-план, зум, поворот камеры и (если передан onSnapshot) сохранение
// текущего кадра в PNG — ТЗ 3.7.4, экспорт визуализации.
export function ViewToolbar({ topView, onToggleTopView, onZoom, onRotate, onSnapshot }) {
  return (
    <div className="flex gap-1.5 items-center">
      <button
        onClick={onToggleTopView}
        aria-pressed={topView}
        title="Переключить вид: 3D-изометрия или 2D-план сверху"
        className={`h-8 px-3 rounded-full font-bold text-sm shadow-sm transition ${pill(topView)}`}
      >
        {topView ? "2D план" : "3D"}
      </button>
      <button onClick={() => onZoom(6)} className={ROUND_BUTTON}>−</button>
      <button onClick={() => onZoom(-6)} className={ROUND_BUTTON}>+</button>
      <button onClick={() => onRotate(-1)} className={ROUND_BUTTON}>↺</button>
      <button onClick={() => onRotate(1)} className={ROUND_BUTTON}>↻</button>
      {onSnapshot && (
        <button onClick={onSnapshot} title="Скачать снимок сцены (PNG)" className={ROUND_BUTTON}>
          📷
        </button>
      )}
    </div>
  );
}

// Переключатель этажей (нужен только в зданиях с несколькими этажами).
export function FloorSwitcher({ count, active, onSelect }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-3 px-1">
      <span className="text-sm font-semibold text-[#3F4159] mr-1">Этаж:</span>

      {Array.from({ length: count }, (_, index) => (
        <button
          key={index}
          onClick={() => onSelect(index)}
          aria-pressed={index === active}
          className={`text-sm px-3 py-1 rounded-full font-bold transition ${pill(index === active)}`}
        >
          {index + 1}
        </button>
      ))}

      <span className="text-xs text-[#6b5f7a] ml-1">остальные этажи показаны прозрачными</span>
    </div>
  );
}

// Пуск/пауза, сброс и скорость воспроизведения (ТЗ 3.6.3).
export function PlaybackControls({ running, onToggleRunning, onReset, speed, onSpeed }) {
  return (
    <div className="flex flex-wrap gap-2 mt-4 px-1 items-center">
      <button
        onClick={onToggleRunning}
        className="text-sm px-4 py-2 rounded-full bg-[#E8B15A] hover:brightness-105 text-[#3F4159] font-bold shadow-sm transition"
      >
        {running ? "⏸ Пауза" : "▶ Дальше"}
      </button>

      <button
        onClick={onReset}
        className="text-sm px-4 py-2 rounded-full bg-white/70 hover:bg-white text-[#3F4159] font-bold shadow-sm transition"
      >
        ↺ Сброс
      </button>

      <div className="flex gap-1 ml-1 flex-wrap">
        {SPEED_OPTIONS.map((multiplier) => (
          <button
            key={multiplier}
            onClick={() => onSpeed(multiplier)}
            className={`text-xs px-3 py-2 rounded-full font-bold transition ${pill(speed === multiplier)}`}
          >
            {multiplier}×
          </button>
        ))}
      </div>
    </div>
  );
}

const SPEED_MIN = 1;
const SPEED_MAX = 128;

/**
 * Нижняя панель immersive-hero: только иконки пауза/сброс и одно поле скорости.
 * Без glass — сплошной белый фон.
 */
export function ImmersivePlaybackBar({ running, onToggleRunning, onReset, speed, onSpeed }) {
  const [draft, setDraft] = useState(String(speed));

  useEffect(() => {
    setDraft(String(speed));
  }, [speed]);

  const commitSpeed = (raw) => {
    const parsed = Number.parseFloat(String(raw).replace(",", "."));
    if (!Number.isFinite(parsed)) {
      setDraft(String(speed));
      return;
    }
    const next = Math.min(SPEED_MAX, Math.max(SPEED_MIN, Math.round(parsed)));
    setDraft(String(next));
    onSpeed(next);
  };

  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-t border-[#E8E8E8] bg-white px-4">
      <button
        type="button"
        onClick={onToggleRunning}
        aria-label={running ? "Пауза" : "Продолжить"}
        title={running ? "Пауза" : "Продолжить"}
        className="grid size-9 place-items-center rounded-lg text-[#3F4159] transition hover:bg-[#F3F3F3]"
      >
        {running ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M8 5.5v13l11-6.5L8 5.5z" />
          </svg>
        )}
      </button>

      <button
        type="button"
        onClick={onReset}
        aria-label="Сброс"
        title="Сброс"
        className="grid size-9 place-items-center rounded-lg text-[#3F4159] transition hover:bg-[#F3F3F3]"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v5h5" />
        </svg>
      </button>

      <label className="ml-auto flex items-center gap-2 text-[13px] text-[#6b5f7a]">
        <span className="font-medium">Скорость</span>
        <input
          type="number"
          min={SPEED_MIN}
          max={SPEED_MAX}
          step={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => commitSpeed(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
          className="h-9 w-16 rounded-lg border border-[#D4D4D4] bg-white px-2 text-center font-mono text-[14px] font-semibold text-[#3F4159] outline-none focus:border-[#3F4159]"
          aria-label="Множитель скорости симуляции"
        />
        <span className="font-medium">×</span>
      </label>
    </div>
  );
}
