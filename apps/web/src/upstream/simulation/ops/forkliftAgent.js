import { createEnergyMeter } from "../energy.js";
import { FORK_CARRY_LIFT, FORK_LIFT_SPEED, LOAD_SLOWDOWN } from "../constants.js";
import { createLabel } from "./labels.js";

// Погрузчик-исполнитель: сам ничего не решает. Без задания стоит на своём месте;
// диспетчер даёт задание «забрать здесь → поставить там»:
//   едет к точке забора → поднимает вилы → ждёт, пока груз можно взять → берёт →
//   опускает вилы → едет к точке сдачи → поднимает вилы → ждёт, пока можно
//   поставить → ставит → докладывает диспетчеру.
// Работа вилами — HANDLING_S, как в расчёте (половина цикла 25 с — у каждой точки).

const HANDLING_S = 12.5;

export function createForkliftAgent({ group, driver, traffic, robotFactory, start, home, speedUnits, loadRatio, energyProfile, name, rehome = null }) {
  const model = robotFactory();
  model.group.position.set(start.x, 0, start.z);
  group.add(model.group);
  const label = createLabel(model.group);
  const agent = {
    name,
    model,
    pos: { x: start.x, z: start.z, heading: 0 },
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
  traffic.add(agent);
  label.set(`${name} · свободен`, "idle");

  function moveFork(dt) {
    const diff = agent.forkTarget - agent.forkLift;
    const step = FORK_LIFT_SPEED * dt;
    agent.forkLift += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;
    model.setForkLift(agent.forkLift);
    return Math.abs(agent.forkTarget - agent.forkLift) < 1e-3;
  }

  // Операция у точки: вилы на высоту → (готово? → действие) → вилы в транспортное.
  function handle(dt, lift, tryAct) {
    if (!agent.acted) {
      agent.forkTarget = lift;
      const raised = moveFork(dt);
      agent.timer += dt;
      if (!raised || agent.timer < HANDLING_S / 2) return false;
      if (!tryAct()) return false;
      agent.acted = true;
    }
    agent.forkTarget = agent.cargo ? FORK_CARRY_LIFT : 0;
    agent.timer += dt;
    return moveFork(dt) && agent.timer >= HANDLING_S;
  }

  function attach(unit) {
    agent.cargo = unit;
    unit.removeFromParent();
    unit.position.set(0, 0, 0);
    unit.rotation.set(0, 0, 0);
    model.carry.add(unit);
  }

  function assign(task) {
    agent.task = task;
    agent.state = "toPick";
    agent.timer = 0;
    agent.acted = false;
  }

  function step(dt) {
    agent.seconds += dt;
    const task = agent.task;
    const speed = speedUnits * (agent.cargo ? 1 - LOAD_SLOWDOWN * loadRatio : 1);
    if (agent.state !== "idle") agent.busySeconds += dt;
    switch (agent.state) {
      case "idle":
        agent.meter.consume(dt, "idle");
        label.set(`${name} · свободен`, "idle");
        // Свободный робот кому-то мешает проехать — переезжает на другое место ожидания.
        if (agent.yieldTo && rehome) {
          agent.yieldTo = null;
          agent.home = rehome(agent.home);
        }
        if (Math.hypot(agent.pos.x - agent.home.x, agent.pos.z - agent.home.z) > 0.5) driver.drive(agent, agent.home, dt, speedUnits);
        break;
      case "toPick":
        agent.meter.consume(dt, "work");
        label.set(`${name} · еду: ${task.pick.label}`);
        if (driver.drive(agent, task.pick.spot, dt, speed)) {
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
            attach(unit);
            return true;
          })
        ) {
          driver.release(agent, task.pick.spot);
          agent.state = "toDrop";
        }
        break;
      }
      case "toDrop":
        agent.meter.consume(dt, "work");
        label.set(`${name} · везу ${task.jobLabel} → ${task.drop.label}`);
        if (driver.drive(agent, task.drop.spot, dt, speed)) {
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
            const unit = agent.cargo;
            if (!task.drop.put(unit)) return false;
            // Груз теперь у точки сдачи (лента, AMR) или убран (ячейка, фура).
            if (unit.parent === model.carry) model.carry.remove(unit);
            agent.cargo = null;
            return true;
          })
        ) {
          driver.release(agent, task.drop.spot);
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
      traffic.remove(agent);
      label.dispose();
      group.remove(model.group);
      model.dispose?.();
    },
  };
}
