import * as THREE from "three";
import { createGlbModel, normalizeModel } from "./glbModel.js";
import { applyStudioRobotMaterials } from "../studioLook.js";

// Модель пылесоса пользователя («Мойдодыр», public/models/vacuum.glb) — одна на
// все роботы уборки: и сухая уборка, и мойка пола.
export const vacuumModel = createGlbModel("vacuum.glb", normalizeModel);

// В файле щётка смотрит вдоль локальной +X, флажок — над корпусом. Флот каждый
// кадр крутит модель по курсу (нос — по +Z), поэтому поправка — внутри обёртки:
// щётка спереди, флажок сзади.
const FORWARD_CORRECTION_Y = -Math.PI / 2;

// Вызывать только когда vacuumModel.isReady().
export function makeVacuumRobot() {
  const wrapper = new THREE.Group();
  const model = applyStudioRobotMaterials(vacuumModel.clone());
  model.rotation.y = FORWARD_CORRECTION_Y;
  wrapper.add(model);
  return wrapper;
}
