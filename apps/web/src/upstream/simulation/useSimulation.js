import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ISO_ELEV } from "./constants.js";
import { drawFloorBase } from "./floor.js";
import { areRobotModelsReady, loadRobotModels } from "./robots/models.js";
import { createVacuumFleet } from "./vacuums/vacuumFleet.js";
import { makeVacuumRobot } from "./robots/vacuumRobot.js";
import { makeFloorWasherRobot } from "./robots/floorWasherRobot.js";
import { createArmFleet } from "./arms/armFleet.js";
import { createStackerFleet } from "./arms/stackerFleet.js";
import { makeArmRobot } from "./robots/armRobot.js";
import { makeWeldArmRig } from "./robots/weldArmRobot.js";
import { createLoaderSystem } from "./loaders/loaderSystem.js";
import { createCustomLoaderFleet } from "./loaders/customLoaderFleet.js";
import { createStorageCubeFleet } from "./loaders/storageCubeFleet.js";
import { createSorterFleet } from "./sorters/sorterFleet.js";
import { createConveyorFleet } from "./conveyors/conveyorFleet.js";
import { computeConveyorLines } from "./layout.js";
import { makeForkliftRobot } from "./robots/forkliftRobot.js";
import { makeTransporterRobot } from "./robots/transporterRobot.js";
import { createWarehouseScene } from "./sceneSetup.js";
import { isDefaultShape, computeRackObstacles } from "./shape/shapeGeometry.js";
import { EMPTY_STATS, readStats, sameStats } from "./simStats.js";
import { createFrameProfiler } from "@/lib/perf/frameProfiler";
import { createAdaptivePixelRatio } from "@/lib/perf/adaptivePixelRatio";
import { FLOOR_PITCH } from "./floorLevel.js";

// Какую модель строить на процесс в зависимости от выбранного в каталоге
// решения (identification.type) — реальные модели пользователя как
// альтернативы процедурным (ТЗ 4.2.6-в-миниатюре: сцена не должна знать про
// конкретные id каталога, только про эти три фабрики на тип).
const VACUUM_FACTORIES = { washer: makeFloorWasherRobot };
const ARM_FACTORIES = { weldarm: makeWeldArmRig };
const LOADER_FACTORIES = { transporter: makeTransporterRobot };

const vacuumFactoryOf = (type) => VACUUM_FACTORIES[type] ?? makeVacuumRobot;
const armFactoryOf = (type) => ARM_FACTORIES[type] ?? makeArmRobot;
const loaderFactoryOf = (type) => LOADER_FACTORIES[type] ?? makeForkliftRobot;

// Связка React ↔ Three.js: сборка сцены один раз, пересборка этажей и роботов при
// смене параметров и покадровый цикл симуляции. Компонент WarehouseScene остаётся
// только интерфейсом. На каждом этаже работает свой такой же парк роботов;
// симуляция каждого типа роботов живёт в своём модуле:
//   vacuums/vacuumFleet.js  — уборка, заряд батарей, возврат на станцию
//   arms/armFleet.js        — роборуки и конвейеры
//   loaders/loaderSystem.js — фуры, погрузчики, груз, склад

const MAX_FRAME_SECONDS = 0.1; // шаг симуляции за кадр не больше — вкладка в фоне не «прыгает»
const STATS_INTERVAL_MS = 120; // как часто обновлять панели показателей
const STEP_BUDGET_MS = 12; // сколько миллисекунд кадра можно тратить на шаги симуляции

const FLOOR_STAGGER_SECONDS = 7; // на сколько позже на каждом следующем этаже приезжает первая фура
const QUARTER = Math.PI / 2;
const YARD_FOCUS_Z = -16; // со складом погрузчиков камера смотрит ближе к воротам и фурам

const SETTLE_EPSILON = 1e-4;

// Камера доводится к цели экспоненциально (см. updateCamera), поэтому «доехала» —
// это когда до цели осталось меньше, чем видно глазом.
function isCameraSettling(camera, activeFloor) {
  return (
    Math.abs(camera.thetaTarget - camera.theta) > SETTLE_EPSILON ||
    Math.abs(camera.elevationTarget - camera.elevation) > SETTLE_EPSILON ||
    Math.abs(camera.focusZTarget - camera.focusZ) > SETTLE_EPSILON ||
    Math.abs(activeFloor * FLOOR_PITCH - camera.focusY) > SETTLE_EPSILON
  );
}

function disposeFleets(level) {
  level.armFleet?.dispose();
  level.vacuumFleet?.dispose();
  level.loaderSystem?.dispose();
  level.sorterFleet?.dispose();
  level.conveyorFleet?.dispose();
  level.armFleet = null;
  level.vacuumFleet = null;
  level.loaderSystem = null;
  level.sorterFleet = null;
  level.conveyorFleet = null;
}

// cfg — всё, что нужно сцене (см. WarehouseScene): состав роботов, площадь, счётчики,
// производительность, энергопрофили и состояние воспроизведения. Возвращает
// mountRef (куда монтировать canvas), показатели и управление камерой.
export function useSimulation(cfg) {
  const {
    shape,
    layout,
    chunkGrid,
    floorsCount,
    floorIndex,
    running,
    speedMult,
    topView,
    camZoom,
    resetKey,
    vacuumCount,
    vacuumSpeed,
    vacuumType,
    armCount,
    armProd,
    armType,
    loaderCount,
    loaderType,
    sorterCount = 0,
    sorterThroughput = 0,
    conveyorCount = 0,
    conveyorThroughput = 0,
    energyProfiles,
    loader,
    immersive = false,
  } = cfg;

  const mountRef = useRef(null);
  const st = useRef({}).current;

  const [stats, setStats] = useState(EMPTY_STATS);
  // glb-модели (роботы и фура) грузятся асинхронно (обычно их прогревает main.jsx, и
  // они уже готовы). Пол, стены и роборуки строим сразу, пылесосы, погрузчики и
  // фуры — когда модели готовы.
  const [modelState, setModelState] = useState(areRobotModelsReady() ? "ready" : "loading"); // 'loading' | 'ready' | 'error'

  const { useVacuum, useArm, useLoader } = layout;

  // Клетки сетки покрытия внутри зоны уборки (1 клетка = 1×1 единица сцены).
  const vacuumZoneCells = layout.vacuumZone ? layout.vacuumZone.width * (layout.vacuumZone.zMax - layout.vacuumZone.zMin) : 0;

  st.activeFloor = floorIndex;

  const publish = () => {
    const next = readStats(st.levels, st.activeFloor, vacuumZoneCells, st.simAcc);
    setStats((prev) => (sameStats(prev, next) ? prev : next));
  };

  // ==========================================================
  // Сцена (создаётся один раз)
  // ==========================================================

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const created = createWarehouseScene(mount, {
      fogColor: 0x77798f,
      mono: false,
    });

    Object.assign(st, created, {
      clock: new THREE.Timer(),
      raf: null,
      simAcc: 0,
      lastPublish: 0,
      profiler: createFrameProfiler("warehouse", () => {
        const { render, memory } = created.renderer.info;
        const size = created.renderer.getDrawingBufferSize(new THREE.Vector2());
        return {
          drawCalls: render.calls,
          triangles: render.triangles,
          geometries: memory.geometries,
          textures: memory.textures,
          pixelRatio: created.renderer.getPixelRatio(),
          drawingBuffer: `${size.x}x${size.y}`,
          onScreen: st.onScreen,
        };
      }),
      quality: createAdaptivePixelRatio(created.renderer),
      onScreen: true,
      needsRender: true,
      lastCanvasSize: "",
    });

    // Сцена за пределами экрана не рисуется: симуляция продолжает считаться
    // (это доли миллисекунды), а отрисовка — основная нагрузка — простаивает.
    const visibility =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(([entry]) => {
            st.onScreen = entry.isIntersecting;
            if (st.onScreen) st.needsRender = true;
          });
    visibility?.observe(mount);

    loadRobotModels()
      .then(() => setModelState("ready"))
      .catch((error) => {
        console.error("Не удалось загрузить 3D-модели роботов:", error);
        setModelState("error");
      });

    return () => {
      visibility?.disconnect();
      created.levels.forEach(disposeFleets);
      created.dispose(st.raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ==========================================================
  // Камера: фокус, вид (3D/2D), зум
  // ==========================================================

  useEffect(() => {
    if (st.scene) st.cameraState.focusZTarget = useLoader ? YARD_FOCUS_Z : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useLoader]);

  // 3D-изометрия ↔ 2D-вид сверху: камера поднимается над складом и встаёт на ось.
  useEffect(() => {
    if (!st.scene) return;

    const camera = st.cameraState;

    camera.elevationTarget = topView ? st.TOP_ELEVATION : ISO_ELEV;
    camera.thetaTarget = topView
      ? Math.round(camera.thetaTarget / (4 * QUARTER)) * 4 * QUARTER // север сверху
      : Math.round((camera.thetaTarget - Math.PI / 4) / QUARTER) * QUARTER + Math.PI / 4;

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topView]);

  useEffect(() => {
    if (!st.scene) return;
    st.cameraState.zoom = camZoom;
    st.applyFrustum();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camZoom]);

  // ==========================================================
  // Пересборка этажей и роботов
  // ==========================================================

  useEffect(() => {
    if (!st.scene) return;

    st.setLevelCount(floorsCount, shape);

    st.levels.forEach((level, index) => {
      disposeFleets(level);
      level.crates.visible = !useLoader;
      level.vacuumGroup.clear();
      level.armGroup.clear();
      level.loaderGroup.clear();

      // След — отдельный слой поверх статичного пола, чистим его при каждой
      // пересборке, иначе старые следы останутся видны после сброса/смены режима.
      level.trailCtx.clearRect(0, 0, level.trailCtx.canvas.width, level.trailCtx.canvas.height);
      level.trailTexture.needsUpdate = true;
      level.grid.fill(0);

      if (useArm && armCount > 0) {
        if (armType === "stacker") {
          level.armFleet = createStackerFleet({
            group: level.armGroup,
            zone: layout.armZone,
            count: armCount,
            armProd,
            energyProfile: energyProfiles.arm,
          });
        } else {
          level.armFleet = createArmFleet({
            group: level.armGroup,
            zone: layout.armZone,
            count: armCount,
            beltTexture: st.beltTexture,
            armProd,
            energyProfile: energyProfiles.arm,
            robotFactory: armFactoryOf(armType),
          });
        }
      }

      // Сортировочная система и конвейерные линии — стационарные, строятся сразу.
      if (layout.useSorter && sorterCount > 0 && index === 0) {
        level.sorterFleet = createSorterFleet({
          group: level.armGroup,
          zone: layout.sorterZone,
          count: sorterCount,
          throughputPerHour: sorterThroughput,
          metersPerUnit: chunkGrid.metersPerUnit,
          beltTexture: st.beltTexture,
          energyProfile: energyProfiles.sorter ?? energyProfiles.arm,
        });
      }
      if (layout.useConveyor && conveyorCount > 0 && index === 0) {
        const lengthUnits = (loader.routeLengthM ?? 60) / Math.max(1e-6, chunkGrid.metersPerUnit);
        level.conveyorFleet = createConveyorFleet({
          group: level.armGroup,
          lines: computeConveyorLines(layout, shape, conveyorCount, lengthUnits),
          throughputPerHour: conveyorThroughput,
          metersPerUnit: chunkGrid.metersPerUnit,
          beltTexture: st.beltTexture,
          energyProfile: energyProfiles.conveyor ?? energyProfiles.arm,
        });
      }

      if (useVacuum && vacuumCount > 0 && modelState === "ready") {
        // Стеллажи своей формы склада — такое же препятствие для пылесосов,
        // как и роборуки (жалоба: раньше пылесосы ездили прямо сквозь них).
        // На пресете по умолчанию стеллажей нет — пустой список, поведение не меняется.
        const rackObstacles = isDefaultShape(shape) ? [] : computeRackObstacles(shape);

        level.vacuumFleet = createVacuumFleet({
          group: level.vacuumGroup,
          zone: layout.vacuumZone,
          count: vacuumCount,
          cleaningSpeed: vacuumSpeed,
          energyProfile: energyProfiles.vacuum,
          obstacles: [
            ...(level.armFleet?.obstacles ?? []),
            ...(level.sorterFleet?.obstacles ?? []),
            ...(level.conveyorFleet?.obstacles ?? []),
            ...rackObstacles,
          ],
          trail: { ctx: level.trailCtx, texture: level.trailTexture },
          grid: level.grid,
          robotFactory: vacuumFactoryOf(vacuumType),
        });
      }

      // Ворота и фуры — только на первом этаже; выше склад пуст.
      //   storagecube — стационарные башни (без дорог/фур/погрузчика), работает
      //     на любой форме через кластеры ворот (layout.gates).
      //   стандартная форма — штатный loaderSystem.js (проезды/полосы/LIFO).
      //   своя форма — упрощённый маршрут в 2 плеча (customLoaderFleet.js),
      //     полноценные проезды для произвольного контура — вне рамок этого захода.
      // Всё — в тот же слот level.loaderSystem (общий интерфейс step/getStats/dispose).
      if (useLoader && index === 0 && loaderCount > 0 && modelState === "ready") {
        if (loaderType === "storagecube") {
          level.loaderSystem = createStorageCubeFleet({
            group: level.loaderGroup,
            gates: layout.gates,
            area: layout.free,
            count: loaderCount,
            towerCount: loader.storageTowers,
            energyProfile: energyProfiles.loader,
          });
        } else if (isDefaultShape(shape)) {
          level.loaderSystem = createLoaderSystem({
            group: level.loaderGroup,
            count: loaderCount,
            capacityKg: loader.capacityKg,
            cargoWeightKg: loader.cargoWeightKg,
            speedMps: loader.speedMps,
            metersPerUnit: chunkGrid.metersPerUnit,
            cargoPerHour: loader.cargoPerHour / floorsCount,
            truckPayload: loader.truckPayload,
            slotsPerLane: loader.slotsPerLane,
            routeLengthM: loader.routeLengthM,
            cargo: loader.cargo,
            startDelay: index * FLOOR_STAGGER_SECONDS,
            energyProfile: energyProfiles.loader,
            robotFactory: loaderFactoryOf(loaderType),
          });
        } else {
          level.loaderSystem = createCustomLoaderFleet({
            group: level.loaderGroup,
            shape,
            count: loaderCount,
            capacityKg: loader.capacityKg,
            cargoWeightKg: loader.cargoWeightKg,
            speedMps: loader.speedMps,
            metersPerUnit: chunkGrid.metersPerUnit,
            cargo: loader.cargo,
            energyProfile: energyProfiles.loader,
            robotFactory: loaderFactoryOf(loaderType),
          });
        }
      }
    });

    drawFloorBase(st.floorCtx, { shape, layout, armCount, vacuumCount, chunkGrid, slotsPerLane: loader.slotsPerLane });
    st.floorTexture.needsUpdate = true;

    st.simAcc = 0;
    setStats(EMPTY_STATS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    shape,
    layout,
    chunkGrid,
    floorsCount,
    vacuumCount,
    vacuumSpeed,
    vacuumType,
    armCount,
    armProd,
    armType,
    loaderCount,
    loaderType,
    sorterCount,
    sorterThroughput,
    conveyorCount,
    conveyorThroughput,
    energyProfiles,
    loader.capacityKg,
    loader.speedMps,
    loader.cargoWeightKg,
    loader.cargoPerHour,
    loader.truckPayload,
    loader.slotsPerLane,
    loader.routeLengthM,
    loader.cargo.lengthCm,
    loader.cargo.widthCm,
    loader.cargo.heightCm,
    loader.cargo.skuCount,
    loader.cargo.oversizedSharePct,
    resetKey,
    modelState,
  ]);

  // ==========================================================
  // Покадровый цикл
  // ==========================================================

  useEffect(() => {
    if (!st.scene) return;

    // Все шаги множителя скорости за один кадр; если кадр не укладывается в бюджет
    // времени, лишние шаги пропускаются — симуляция замедляется, а страница не
    // зависает. Возвращает, сколько шагов выполнено.
    const stepSimulation = (dt, wanted) => {
      const startedAt = performance.now();
      let executed = 0;

      while (executed < wanted && (executed === 0 || performance.now() - startedAt < STEP_BUDGET_MS)) {
        for (const level of st.levels) {
          level.vacuumFleet?.step(dt);
          level.armFleet?.step(dt);
          level.loaderSystem?.step(dt);
          level.sorterFleet?.step(dt);
          level.conveyorFleet?.step(dt);
        }

        executed++;
      }

      return executed;
    };

    const tick = (timestamp) => {
      st.raf = requestAnimationFrame(tick);
      st.profiler.frameStart(timestamp);
      st.clock.update(timestamp);
      const realDt = Math.min(st.clock.getDelta(), MAX_FRAME_SECONDS);

      st.cameraState.theta += (st.cameraState.thetaTarget - st.cameraState.theta) * 0.12;
      st.updateCamera(st.activeFloor);

      if (running) {
        const executed = st.profiler.time("step", () => stepSimulation(realDt, speedMult));

        st.simAcc += realDt * executed;
        if (st.beltTexture) st.beltTexture.offset.y -= 0.45 * realDt * executed;

        // Угасание следа — в реальном времени, один раз за кадр (не за шаг).
        for (const level of st.levels) level.vacuumFleet?.updateFades(realDt);

        if (timestamp - st.lastPublish >= STATS_INTERVAL_MS) {
          st.lastPublish = timestamp;
          publish();
        }
      }

      // Кадр перерисовывается, только если в нём что-то изменилось: идёт симуляция,
      // камера ещё доезжает до цели, поменялись параметры сцены или размер канваса
      // (смена размера очищает канвас). На паузе и вне экрана GPU простаивает.
      const canvas = st.renderer.domElement;
      const canvasSize = `${canvas.width}x${canvas.height}`;
      if (canvasSize !== st.lastCanvasSize) {
        st.lastCanvasSize = canvasSize;
        st.needsRender = true;
      }

      if (st.onScreen && (running || st.needsRender || isCameraSettling(st.cameraState, st.activeFloor))) {
        st.needsRender = false;
        if (st.quality.onRenderedFrame(timestamp)) st.lastCanvasSize = "";
        st.profiler.time("render", () => st.render(st.activeFloor));
      } else {
        st.quality.onSkippedFrame();
        st.profiler.skipRender();
      }
      st.profiler.frameEnd();
    };

    tick(performance.now());

    return () => cancelAnimationFrame(st.raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, speedMult, vacuumZoneCells]);

  // Переключение этажа: показатели сразу берём с нового этажа, а не ждём следующего обновления.
  useEffect(() => {
    if (st.scene) publish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floorIndex]);

  // Любой коммит (смена этажа, вида, зума, пересборка роботов, загрузка моделей)
  // мог поменять сцену — на паузе её нужно перерисовать хотя бы один раз.
  // Эффект объявлен последним, чтобы сработать после всех, что правят сцену.
  useEffect(() => {
    st.needsRender = true;
  });

  return {
    mountRef,
    stats,
    modelState,
    rotate: (direction) => {
      st.cameraState.thetaTarget += direction * QUARTER;
    },
  };
}
