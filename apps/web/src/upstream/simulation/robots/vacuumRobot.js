import { createGlbModel, normalizeModel } from "./glbModel.js";
import { applyStudioRobotMaterials } from "../studioLook.js";

// Модель пылесоса лежит в public/models/vacuum.glb.
export const vacuumModel = createGlbModel("vacuum.glb", normalizeModel);

// Вызывать только когда vacuumModel.isReady().
export function makeVacuumRobot() {
  return applyStudioRobotMaterials(vacuumModel.clone());
}
