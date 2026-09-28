import * as THREE from 'three';
import { PALETTE } from './constants.js';

/**
 * Студия как в референсе: белый зал, но с явной шкалой яркости —
 * тёмные опоры/ленты, бежевые короба, синий акцент на роботах.
 * Без этого всё сливается в одну светлую кашу.
 */
export const STUDIO_PALETTE = {
  floor: '#ECEEF2',
  // Конструктор формы склада (upstream): снаружи контура, стеллажи, зоны ворот.
  exterior: '#D5DAE2',
  rack: '#5B6472',
  invalidGate: '#C0392B',
  gateOut: '#2F86F0',
  gateIn: '#8DBBF3',
  pad: '#D6E6FA',
  storage: '#3A3F4A',
  crateA: '#C9A87A',
  crateB: '#D8B892',
  crateC: '#B8956A',
  robotBody: '#F5F6F8',
  armAccents: ['#2F86F0', '#3D92F5', '#1A6FD4', '#5BA3F5', '#2F86F0', '#3D92F5'],
  belt: '#2A2D36',
  beltStripe: '#4A5160',
  wall: '#F7F8FA',
  wallTrim: '#2F86F0',
  dockPad: '#2F86F0',
  cargoPallet: '#8B7355',
  cargoCrate: '#C9A87A',
  cargoStrap: '#2F86F0',
};

const ACCENT = new THREE.Color('#2F86F0');
const BODY = new THREE.Color('#F2F4F7');
const STRUCTURE = new THREE.Color('#2A2D36');

let studio = false;

export function setStudioLook(enabled) {
  studio = Boolean(enabled);
}

export function isStudioLook() {
  return studio;
}

export function activePalette() {
  return studio ? STUDIO_PALETTE : PALETTE;
}

/** Матовый белый «clay» корпус — объём за счёт света и тени, не бликов. */
export function makeStudioBodyMaterial() {
  return new THREE.MeshStandardMaterial({
    color: BODY.clone(),
    roughness: 0.72,
    metalness: 0.02,
    flatShading: false,
  });
}

/** Насыщенный синий акцент — как оранжевый на референсе. */
export function makeStudioAccentMaterial() {
  return new THREE.MeshStandardMaterial({
    color: ACCENT.clone(),
    roughness: 0.45,
    metalness: 0.08,
    emissive: ACCENT.clone(),
    emissiveIntensity: 0.08,
    flatShading: false,
  });
}

/** Тёмная конструкция: базы, рамы, ленты — якорь контраста на белом полу. */
export function makeStudioStructureMaterial() {
  return new THREE.MeshStandardMaterial({
    color: STRUCTURE.clone(),
    roughness: 0.78,
    metalness: 0.12,
    flatShading: false,
  });
}

/**
 * Трёхступенчатая перекраска glb:
 * тёмное → структура, тёплое/среднее → синий акцент, светлое → белый корпус.
 */
export function applyStudioRobotMaterials(root) {
  if (!studio) return root;

  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;

    const sourceList = Array.isArray(obj.material) ? obj.material : [obj.material];
    const next = sourceList.map((source) => {
      const color = source.color ? source.color.clone() : new THREE.Color(0x888888);
      const lum = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
      const warm = color.r > color.b * 1.12 && color.r > 0.32;

      if (lum < 0.28) return makeStudioStructureMaterial();
      if (warm || (lum >= 0.28 && lum < 0.55)) return makeStudioAccentMaterial();
      return makeStudioBodyMaterial();
    });

    obj.material = Array.isArray(obj.material) ? next : next[0];
  });

  return root;
}
