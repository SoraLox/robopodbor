import { createEnergyMeter } from "../energy.js";
import { FORK_CARRY_LIFT, FORK_LIFT_SPEED } from "../constants.js";
import { createLabel } from "./labels.js";
import { createMover } from "./mover.js";

// Погрузчик-исполнитель: сам ничего не решает. Без задания стоит на своём месте;
// диспетчер даёт задание «забрать здесь → поставить там».
//   Едет по забронированному пути (mover.js) и встаёт точно в позу точки — вилами
//   к грузу → поднимает вилы до высоты груза → ждёт, пока груз можно взять →
//   груз плавно переходит на вилы → вилы — в транспортное положение → едет к точке
//   сдачи → вилы на высоту места → ставит (точка сама плавно принимает груз).
// Работа вилами — HANDLING_S, как в расчёте (половина цикла 25 с — у каждой точки).

const HANDLING_S = 12.5;
const TRANSFER_S = 0.7;

export function createForkliftAgent({ id, group, planner, nav, clock, tweens, robotFactory, start, home, speedUnits, energyProfile, name }) {
  const model = robotFactory();
  model.group.position.set(start.pose.x, 0, start.pose.z);
  model.group.rotation.y = start.pose.heading;
  group.add(model.group);
  const label = createLabel(model.group);
  const agent = {
    id,
    name,
    model,
    pos: { x: start.pose.x, z: start.pose.z, heading: start.pose.heading },
    home,
    state: "idle",
    task: null,
    cargo: null,
    forkLift: 0,
    forkTarget: 0,
    timer: 0,
    acted: false,
    meter: createEnergyMeter(energyProfile),
    busySeconds: 0,
    seconds: 0,
  };
  const mover = createMover({ planner, nav, agent, speedUnits, clock });
  label.set(`${name} · свободен`, "idle");

  function moveFork(dt) {
    const diff = agent.forkTarget - agent.forkLift;
    const step = FORK_LIFT_SPEED * dt;
    agent.forkLift += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;
    model.setForkLift(agent.forkLift);
    return Math.abs(agent.forkTarget - agent.forkLift) < 1e-3;
  }

  // Операция у точки: вилы на высоту → (готово? → передача груза) → вилы в транспортное.
  function handle(dt, lift, tryAct) {
    agent.timer += dt;
    if (!agent.acted) {
      agent.forkTarget = lift;
      const raised = moveFork(dt);
      if (!raised || agent.timer < HANDLING_S / 2) return false;
      if (!tryAct()) return false;
      agent.acted = true;
      agent.actedAt = agent.timer;
    }
    // Пока груз переходит — вилы стоят.
    if (agent.timer - agent.actedAt < TRANSFER_S) return false;
    agent.forkTarget = agent.cargo ? FORK_CARRY_LIFT : 0;
    return moveFork(dt) && agent.timer >= HANDLING_S;
  }

  function assign(task) {
    agent.task = task;
    agent.state = "toPick";
    mover.goTo(task.pick.spot);
  }

  function step(dt) {
    agent.seconds += dt;
    mover.step(dt);
    const task = agent.task;
    if (agent.state !== "idle") agent.busySeconds += dt;
    switch (agent.state) {
      case "idle":
        agent.meter.consume(dt, mover.moving() ? "work" : "idle");
        label.set(`${name} · свободен`, "idle");
        if (!mover.moving() && !mover.at(agent.home)) mover.goTo(agent.home);
        break;
      case "toPick":
        agent.meter.consume(dt, "work");
        label.set(mover.phase() === "waitPlan" ? `${name} · жду проезда` : `${name} · еду: ${task.pick.label}`, mover.phase() === "waitPlan" ? "wait" : "neutral");
        if (mover.at(task.pick.spot)) {
          agent.state = "picking";
          agent.timer = 0;
          agent.acted = false;
        }
        break;
      case "picking": {
        agent.meter.consume(dt, "work");
        const waiting = agent.timer >= HANDLING_S / 2 && !agent.acted;
        label.set(waiting ? `${name} · жду: ${task.pick.waitLabel ?? task.pick.label}` : `${name} · беру: ${task.pick.label}`, waiting ? "wait" : "neutral");
        if (
          handle(dt, task.pick.lift, () => {
            const unit = task.pick.take();
            if (!unit) return false;
            agent.cargo = unit;
            tweens.move(unit, model.carry, { x: 0, y: 0, z: 0, rotY: 0 }, TRANSFER_S);
            return true;
          })
        ) {
          agent.state = "toDrop";
          mover.goTo(task.drop.spot);
        }
        break;
      }
      case "toDrop":
        agent.meter.consume(dt, "work");
        label.set(mover.phase() === "waitPlan" ? `${name} · жду проезда` : `${name} · везу ${task.jobLabel} → ${task.drop.label}`, mover.phase() === "waitPlan" ? "wait" : "neutral");
        if (mover.at(task.drop.spot)) {
          agent.state = "dropping";
          agent.timer = 0;
          agent.acted = false;
        }
        break;
      case "dropping": {
        agent.meter.consume(dt, "work");
        const waiting = agent.timer >= HANDLING_S / 2 && !agent.acted;
        label.set(waiting ? `${name} · жду: ${task.drop.waitLabel ?? task.drop.label}` : `${name} · ставлю: ${task.drop.label}`, waiting ? "wait" : "neutral");
        if (
          handle(dt, task.drop.lift, () => {
            if (!task.drop.put(agent.cargo)) return false;
            agent.cargo = null;
            return true;
          })
        ) {
          agent.task = null;
          agent.state = "idle";
          task.onDone?.();
        }
        break;
      }
      default:
        break;
    }
  }

  return {
    agent,
    assign,
    step,
    isIdle: () => agent.state === "idle",
    status: () => label.text(),
    utilization: () => (agent.seconds ? agent.busySeconds / agent.seconds : 0),
    dispose() {
      label.dispose();
      group.remove(model.group);
      model.dispose?.();
    },
  };
}
