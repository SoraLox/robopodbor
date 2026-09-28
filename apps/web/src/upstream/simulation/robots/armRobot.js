import * as THREE from "three";
import { ARM_BELT_X, ARM_BELT_HALF_WIDTH, ARM_BELT_HALF_LENGTH, ARM_LENGTH, ARM_CARRY_Y, ARM_BELT_START_Z, BOX_GAP } from "../constants.js";
import { activePalette, isStudioLook, makeStudioAccentMaterial, makeStudioBodyMaterial, makeStudioStructureMaterial } from "../studioLook.js";

export function makeArmRobot(accentColor, beltTexture) {
  const group = new THREE.Group();
  const palette = activePalette();
  const studio = isStudioLook();

  const baseMat = studio
    ? makeStudioBodyMaterial()
    : new THREE.MeshStandardMaterial({ color: palette.robotBody, flatShading: true, roughness: 0.56, metalness: 0.0 });
  const accentMat = studio
    ? makeStudioAccentMaterial()
    : new THREE.MeshStandardMaterial({ color: accentColor, flatShading: true, roughness: 0.48, metalness: 0.0 });
  const darkMat = studio
    ? makeStudioStructureMaterial()
    : new THREE.MeshStandardMaterial({ color: palette.storage, flatShading: true, roughness: 0.6, metalness: 0.0 });
  const beltMat = new THREE.MeshStandardMaterial({
    map: beltTexture,
    flatShading: !studio,
    roughness: studio ? 0.7 : 0.7,
    metalness: studio ? 0.1 : 0.0,
  });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1, 1.1, 16), baseMat);
  base.position.y = 0.55;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 16), accentMat);
  collar.position.y = 1.25;
  collar.castShadow = true;
  collar.receiveShadow = true;
  group.add(collar);

  const pivot = new THREE.Group();
  pivot.position.y = 1.4;
  group.add(pivot);

  const arm = new THREE.Mesh(new THREE.BoxGeometry(ARM_LENGTH, 0.35, 0.35), accentMat);
  arm.position.x = ARM_LENGTH / 2;
  arm.castShadow = true;
  arm.receiveShadow = true;
  pivot.add(arm);

  const claw = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), darkMat);
  claw.position.set(ARM_LENGTH, ARM_CARRY_Y, 0);
  claw.castShadow = true;
  claw.receiveShadow = true;
  pivot.add(claw);

  const tipMat = studio
    ? makeStudioAccentMaterial()
    : new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: new THREE.Color(accentColor),
        emissiveIntensity: 0.52,
        roughness: 0.45,
        metalness: 0.0,
        flatShading: true,
      });

  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), tipMat);
  tip.position.set(ARM_LENGTH, ARM_CARRY_Y, 0.27);
  pivot.add(tip);

  const boxes = buildConveyors(group, beltMat);

  return { group, pivot, claw, boxes };
}

function buildConveyors(group, beltMat) {
  const beltWidth = ARM_BELT_HALF_WIDTH * 2;
  const beltLength = ARM_BELT_HALF_LENGTH * 2;
  const palette = activePalette();
  const studio = isStudioLook();
  const frameMat = studio
    ? makeStudioStructureMaterial()
    : new THREE.MeshStandardMaterial({ color: 0x202236, flatShading: true, roughness: 0.68, metalness: 0.0 });
  const railMat = studio
    ? makeStudioStructureMaterial()
    : new THREE.MeshStandardMaterial({ color: 0x85899f, flatShading: true, roughness: 0.58, metalness: 0.05 });

  [-1, 1].forEach((side) => {
    const x = side * ARM_BELT_X;

    const frame = new THREE.Mesh(new THREE.BoxGeometry(beltWidth, 0.45, beltLength), frameMat);
    frame.position.set(x, 0.0, 0);
    frame.castShadow = true;
    frame.receiveShadow = true;
    group.add(frame);

    const belt = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 11.7), beltMat);
    belt.position.set(x, 0.32, 0);
    belt.castShadow = true;
    belt.receiveShadow = true;
    group.add(belt);

    [-0.58, 0.58].forEach((offset) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 11.8), railMat);
      rail.position.set(x + offset, 0.48, 0);
      rail.castShadow = true;
      rail.receiveShadow = true;
      group.add(rail);
    });
  });

  const colors = [palette.crateA, palette.crateB, palette.crateC];
  const boxes = [];

  for (let i = 0; i < 5; i++) {
    const material = studio
      ? new THREE.MeshStandardMaterial({
          color: colors[i % colors.length],
          roughness: 0.68,
          metalness: 0.0,
        })
      : new THREE.MeshStandardMaterial({
          color: colors[i % colors.length],
          flatShading: true,
          roughness: 0.6,
          metalness: 0.0,
        });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.68, 0.68), material);

    const startZ = ARM_BELT_START_Z + 0.5 + i * BOX_GAP;
    box.position.set(-ARM_BELT_X, 0.82, startZ);
    box.castShadow = true;
    box.receiveShadow = true;

    box.userData = { state: "input", z: startZ, side: -1, transferT: 0 };

    group.add(box);
    boxes.push(box);
  }

  return boxes;
}
