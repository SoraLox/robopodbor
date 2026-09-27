import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

const SPEED_MIN = 1;
const SPEED_MAX = 128;

/** Действия камеры, которые регистрирует WarehouseScene. */
export interface SimCameraActions {
  zoomBy: (delta: number) => void;
  rotate: (direction: number) => void;
}

export interface SimPlaybackValue {
  running: boolean;
  speed: number;
  resetKey: number;
  setRunning: (next: boolean | ((prev: boolean) => boolean)) => void;
  setSpeed: (next: number) => void;
  reset: () => void;
  speedMin: number;
  speedMax: number;
  /** 2D-план сверху vs 3D-изометрия. */
  topView: boolean;
  toggleTopView: () => void;
  zoomBy: (delta: number) => void;
  rotate: (direction: number) => void;
  /** Сцена immersive регистрирует zoom/rotate; при размонтировании — null. */
  bindCameraActions: (actions: SimCameraActions | null) => void;
}

const SimPlaybackContext = createContext<SimPlaybackValue | null>(null);

/** Общее состояние плейбека и камеры: сцена и островок KPI читают одно и то же. */
export function SimPlaybackProvider({ children }: { children: ReactNode }) {
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [resetKey, setResetKey] = useState(0);
  const [topView, setTopView] = useState(false);
  const cameraActionsRef = useRef<SimCameraActions | null>(null);

  const bindCameraActions = useCallback((actions: SimCameraActions | null) => {
    cameraActionsRef.current = actions;
  }, []);

  const zoomBy = useCallback((delta: number) => {
    cameraActionsRef.current?.zoomBy(delta);
  }, []);

  const rotate = useCallback((direction: number) => {
    cameraActionsRef.current?.rotate(direction);
  }, []);

  const value = useMemo<SimPlaybackValue>(
    () => ({
      running,
      speed,
      resetKey,
      setRunning,
      setSpeed: (next) => setSpeed(Math.min(SPEED_MAX, Math.max(SPEED_MIN, next))),
      reset: () => setResetKey((key) => key + 1),
      speedMin: SPEED_MIN,
      speedMax: SPEED_MAX,
      topView,
      toggleTopView: () => setTopView((value) => !value),
      zoomBy,
      rotate,
      bindCameraActions,
    }),
    [running, speed, resetKey, topView, zoomBy, rotate, bindCameraActions],
  );

  return <SimPlaybackContext.Provider value={value}>{children}</SimPlaybackContext.Provider>;
}

export function useSimPlayback(): SimPlaybackValue {
  const ctx = useContext(SimPlaybackContext);
  if (!ctx) {
    throw new Error('useSimPlayback: нет SimPlaybackProvider');
  }
  return ctx;
}

export function useSimPlaybackOptional(): SimPlaybackValue | null {
  return useContext(SimPlaybackContext);
}
