import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { poseArm, preparePickArm, PICK_HEIGHT } from '@/upstream/simulation/robots/pickArmRobot.js';

async function loadArm() {
  const buffer = readFileSync(new URL('../../../../assets-src/models/pick_arm.glb', import.meta.url));
  const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const gltf = await new GLTFLoader().parseAsync(data, '');
  return preparePickArm(gltf.scene) as THREE.Group;
}

describe('роборука отбора (pick_arm.glb)', () => {
  it('собирается в цепочку звеньев, плита стоит на полу у оси колонны', async () => {
    const arm = await loadArm();
    for (const name of ['turret', 'shoulder', 'elbow', 'wrist', 'grip']) expect(arm.getObjectByName(name)).toBeTruthy();
    const box = new THREE.Box3().setFromObject(arm, true);
    expect(box.min.y).toBeCloseTo(0, 1);
    expect(Math.abs((box.min.x + box.max.x) / 2)).toBeLessThan(1.5);
  });

  it('обратная кинематика: присоски приходят на коробку у обеих лент и в точку переноса', async () => {
    const arm = await loadArm();
    const joints = Object.fromEntries(['turret', 'shoulder', 'elbow', 'wrist'].map((n) => [n, arm.getObjectByName(n)!]));
    const grip = arm.getObjectByName('grip')!;
    const cases = [
      { yaw: Math.PI, radius: 2, height: PICK_HEIGHT, at: new THREE.Vector3(-2, PICK_HEIGHT, 0) },
      { yaw: 0, radius: 2, height: PICK_HEIGHT, at: new THREE.Vector3(2, PICK_HEIGHT, 0) },
      { yaw: (3 * Math.PI) / 2, radius: 2, height: 1.9, at: new THREE.Vector3(0, 1.9, 2) },
    ];
    for (const c of cases) {
      poseArm(joints as never, c.yaw, c.radius, c.height);
      arm.updateMatrixWorld(true);
      const p = grip.getWorldPosition(new THREE.Vector3());
      expect(p.distanceTo(c.at)).toBeLessThan(0.05);
      // Присоски смотрят вниз: ось захвата вертикальна.
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(grip.getWorldQuaternion(new THREE.Quaternion()));
      expect(up.y).toBeGreaterThan(0.99);
    }
  });
});
