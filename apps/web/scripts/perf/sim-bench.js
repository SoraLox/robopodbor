/*
  Бенчмарк 3D-симуляции склада. Запуск: открыть отчёт с ?perf=1, например
    http://localhost:4173/?perf=1#/calculate/warehouse/results/demo
  и вставить этот файл в консоль (или передать в Runtime.evaluate с awaitPromise).
  Результат — объект с профилем кадров по каждому сценарию; он же в window.__simBench.

  Сценарии: для каждого типа робота — сцена видна и работает, сцена на паузе,
  сцена прокручена за пределы экрана (работает). Длительность окна — MEASURE_MS.
*/
(async () => {
  const MEASURE_MS = 6000;
  const WARMUP_MS = 2500;
  const ROBOTS = { loader: "p15", arm: "srt8", vacuum: "floorclean" };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const wizard = window.__perfHooks?.wizard;
  if (!wizard) throw new Error("Откройте страницу с ?perf=1 — без него хуки бенчмарка не подключаются");

  const waitFor = async (check, timeoutMs = 20000) => {
    const startedAt = performance.now();
    while (performance.now() - startedAt < timeoutMs) {
      const value = check();
      if (value) return value;
      await sleep(100);
    }
    throw new Error("Не дождались сцены");
  };

  const slot = () => document.querySelector('[data-testid="visualization-slot"]');
  const pauseButton = () => [...document.querySelectorAll("button")].find((b) => /Пауза|Дальше/.test(b.textContent ?? ""));

  // Сколько времени главный поток был занят: сумма длительности long tasks и
  // время, которое профилировщик насчитал на кадры.
  const measure = async (label) => {
    const profiler = window.__perf?.warehouse;
    profiler?.reset();
    let longTaskMs = 0;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longTaskMs += entry.duration;
    });
    try {
      observer.observe({ type: "longtask", buffered: false });
    } catch {
      /* longtask поддерживается не везде */
    }
    const heapBefore = performance.memory?.usedJSHeapSize ?? 0;
    await sleep(MEASURE_MS);
    observer.disconnect();
    const snapshot = profiler?.snapshot();
    const frameWorkMs = snapshot ? snapshot.metrics.total.avg * snapshot.frames : 0;
    return {
      label,
      ...snapshot,
      mainThreadBusyPct: Math.round((frameWorkMs / MEASURE_MS) * 1000) / 10,
      longTaskMs: Math.round(longTaskMs),
      heapDeltaMb: Math.round((((performance.memory?.usedJSHeapSize ?? 0) - heapBefore) / 1048576) * 10) / 10,
      heapMb: Math.round(((performance.memory?.usedJSHeapSize ?? 0) / 1048576) * 10) / 10,
    };
  };

  const results = [];
  for (const [type, solutionId] of Object.entries(ROBOTS)) {
    wizard.getState().setSolutionId(solutionId);
    window.scrollTo(0, 0);
    // Смена решения пересоздаёт сцену: даём старой размонтироваться.
    await sleep(800);
    await waitFor(() => window.__perf?.warehouse && document.querySelector('[data-testid="visualization-slot"] canvas'));
    slot()?.scrollIntoView({ block: "center" });
    await sleep(WARMUP_MS);

    results.push({ type, ...(await measure("running")) });

    pauseButton()?.click();
    await sleep(500);
    results.push({ type, ...(await measure("paused")) });
    pauseButton()?.click();

    window.scrollTo(0, document.body.scrollHeight);
    await sleep(500);
    results.push({ type, ...(await measure("offscreen")) });
  }

  const models = performance
    .getEntriesByType("resource")
    .filter((entry) => entry.name.endsWith(".glb"))
    .map((entry) => ({ file: entry.name.split("/").pop(), transferKb: Math.round(entry.transferSize / 1024), decodedKb: Math.round(entry.decodedBodySize / 1024) }));

  const report = {
    userAgent: navigator.userAgent,
    viewport: `${innerWidth}x${innerHeight}@${devicePixelRatio}`,
    hardwareConcurrency: navigator.hardwareConcurrency,
    models,
    results,
  };
  window.__simBench = report;
  return report;
})();
