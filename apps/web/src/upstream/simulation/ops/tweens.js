import * as THREE from "three";

// Передача груза без телепортов: груз переходит к новому «держателю» (вилы,
// платформа AMR, лента, рука, горка у ворот, полка) с сохранением положения в
// мире и плавно доезжает до своего места у него. arc — высота дуги (коробки,
// вылетающие из фуры).

const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

export function createTweens() {
  const list = [];

  /**
   * Перевесить unit на parent и довести до локальной позы { x, y, z, rotY }
   * за duration секунд. onDone — когда доехал.
   */
  function move(unit, parent, target, duration = 0.6, { arc = 0, onDone = null } = {}) {
    // Уже летит — завершить прежний перелёт мгновенно (новый начнётся с того места).
    for (let i = list.length - 1; i >= 0; i--) if (list[i].unit === unit) finish(list.splice(i, 1)[0]);
    parent.updateMatrixWorld(true);
    unit.parent?.updateMatrixWorld(true);
    parent.attach(unit);
    list.push({
      unit,
      from: unit.position.clone(),
      fromRot: unit.rotation.y,
      to: new THREE.Vector3(target.x ?? 0, target.y ?? 0, target.z ?? 0),
      // Кратчайший поворот — без лишнего оборота.
      toRot: unit.rotation.y + Math.atan2(Math.sin((target.rotY ?? 0) - unit.rotation.y), Math.cos((target.rotY ?? 0) - unit.rotation.y)),
      t: 0,
      duration: Math.max(0.05, duration),
      arc,
      onDone,
    });
    unit.rotation.x = 0;
    unit.rotation.z = 0;
  }

  function finish(tw) {
    tw.unit.position.copy(tw.to);
    tw.unit.rotation.y = tw.toRot;
    tw.onDone?.();
  }

  function step(dt) {
    for (let i = list.length - 1; i >= 0; i--) {
      const tw = list[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.duration);
      const e = ease(k);
      tw.unit.position.lerpVectors(tw.from, tw.to, e);
      if (tw.arc) tw.unit.position.y += Math.sin(Math.PI * k) * tw.arc;
      tw.unit.rotation.y = tw.fromRot + (tw.toRot - tw.fromRot) * e;
      if (k >= 1) {
        list.splice(i, 1);
        finish(tw);
      }
    }
  }

  return { move, step, busy: (unit) => list.some((t) => t.unit === unit) };
}
