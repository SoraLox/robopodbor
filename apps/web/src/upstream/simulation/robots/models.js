import { vacuumModel } from "./vacuumRobot.js";
import { forkliftModel } from "./forkliftRobot.js";
import { truckModel } from "./truckRobot.js";
import { transporterModel } from "./transporterRobot.js";
import { weldArmModel } from "./weldArmRobot.js";
import { storageCubeModel } from "./storageCubeRobot.js";
import { stackerModel } from "./stackerRobot.js";
import { pickArmModel } from "./pickArmRobot.js";

// Все glb-модели роботов и техники, которые нужны сцене, — в одном месте, чтобы
// main.jsx и WarehouseScene не знали, сколько их и как они называются.
const MODELS = [
  vacuumModel,
  forkliftModel,
  truckModel,
  transporterModel,
  weldArmModel,
  storageCubeModel,
  stackerModel,
  pickArmModel,
];

export const areRobotModelsReady = () => MODELS.every((model) => model.isReady());

/**
 * Грузит все glb. onProgress(0…1) — доля готовых моделей (для ползунка на экране сцены).
 */
export const loadRobotModels = (onProgress) => {
  const total = MODELS.length || 1;
  let done = MODELS.filter((model) => model.isReady()).length;
  onProgress?.(done / total);
  if (done === MODELS.length) return Promise.resolve();

  return Promise.all(
    MODELS.filter((model) => !model.isReady()).map((model) =>
      model.load().then(() => {
        done += 1;
        onProgress?.(done / total);
      }),
    ),
  );
};

// Прогрев: пока пользователь на экране настроек, модели уже грузятся.
export const preloadRobotModels = () => MODELS.forEach((model) => model.preload());
