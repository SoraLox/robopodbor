// Страховка от наезда погрузчиков друг на друга.
//
// Погрузчики разных ворот работают в разных полосах склада (storageLayout.js) и
// вообще не встречаются, а внутри полосы работает один погрузчик, так что на деле
// это правило не срабатывает. Оно остаётся на случай изменений раскладки: корпус
// — два круга вдоль курса, и погрузчик не делает шаг, после которого подойдёт к
// другому ближе, чем позволяют корпуса.
export const BODY_RADIUS = 1.65;
const BODY_OFFSETS = [-0.85, 0.85];

// Корпус по умолчанию — погрузчик; у позы может быть свой: pose.body = {radius, offsets}.
function bodyCircles(pose, body) {
  const fx = Math.sin(pose.heading);
  const fz = Math.cos(pose.heading);

  return (body?.offsets ?? BODY_OFFSETS).map((offset) => ({ x: pose.x + fx * offset, z: pose.z + fz * offset }));
}

// Зазор между корпусами: расстояние между ближайшими кругами минус сумма радиусов.
function bodyGap(a, b, bodyA, bodyB) {
  let best = Infinity;

  for (const ca of bodyCircles(a, bodyA)) {
    for (const cb of bodyCircles(b, bodyB)) {
      best = Math.min(best, Math.hypot(ca.x - cb.x, ca.z - cb.z));
    }
  }

  return best - (bodyA?.radius ?? BODY_RADIUS) - (bodyB?.radius ?? BODY_RADIUS);
}

// Возвращает погрузчика, из-за которого нельзя перейти из позы me в позу next
// (иначе null). Приближаться к другому ближе допустимого нельзя, удаляться можно.
export function findBlocker(me, next, others) {
  for (const other of others) {
    if (other === me) continue;

    const after = bodyGap(next, other, me.body, other.body);
    if (after < 0 && after < bodyGap(me, other, me.body, other.body)) return other;
  }

  return null;
}
