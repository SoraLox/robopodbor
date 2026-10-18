import { createEnergyMeter } from "../energy.js";
import { createLabel } from "./labels.js";
import { createMover } from "./mover.js";

// Плоский транспортировщик (AMR-платформа) — исполнитель: сам груз не берёт.
// Задание: «встань на стоянку погрузки → жди, пока поставят → вези на стоянку
// разгрузки → жди, пока снимут». Ставят и снимают рука или погрузчик — через
// load(unit) / unload(); груз плавно ложится на платформу (tweens).

const TRANSFER_S = 0.7;

export function createAmrAgent({ id, group, planner, nav, clock, tweens, robotFactory, start, home, speedUnits, energyProfile, name }) {
  const model = robotFactory();
  model.group.position.set(start.pose.x, 0, start.pose.z);
  model.group.rotation.y = start.pose.heading;
  group.add(model.group);
  const label = createLabel(model.group, { height: 5 });
  const agent = {
    id,
    name,
    model,
    pos: { x: start.pose.x, z: start.pose.z, heading: start.pose.heading },
    home,
    state: "idle",
    task: null,
    cargo: null,
    meter: createEnergyMeter(energyProfile),
    busySeconds: 0,
    seconds: 0,
  };
  const mover = createMover({ planner, nav, agent, speedUnits, clock });
  label.set(`${name} · свободен`, "idle");

  function assign(task) {
    agent.task = task;
    agent.state = "toLoad";
    mover.goTo(task.load.spot);
  }

  function step(dt) {
    agent.seconds += dt;
    mover.step(dt);
    const task = agent.task;
    if (agent.state !== "idle") agent.busySeconds += dt;
    const waitingRoute = mover.phase() === "waitPlan";
    switch (agent.state) {
      case "idle":
        agent.meter.consume(dt, mover.moving() ? "work" : "idle");
        label.set(`${name} · свободен`, "idle");
        if (!mover.moving() && !mover.at(agent.home)) mover.goTo(agent.home);
        break;
      case "toLoad":
        agent.meter.consume(dt, "work");
        label.set(waitingRoute ? `${name} · жду проезда` : `${name} · еду за ${task.jobLabel}: ${task.load.label}`, waitingRoute ? "wait" : "neutral");
        if (mover.at(task.load.spot)) agent.state = "waitLoad";
        break;
      case "waitLoad":
        agent.meter.consume(dt, "idle");
        label.set(`${name} · жду ${task.jobLabel}: ${task.load.waitLabel}`, "wait");
        break;
      case "toUnload":
        agent.meter.consume(dt, "work");
        label.set(waitingRoute ? `${name} · жду проезда` : `${name} · везу ${task.jobLabel} → ${task.unload.label}`, waitingRoute ? "wait" : "neutral");
        if (mover.at(task.unload.spot)) agent.state = "waitUnload";
        break;
      case "waitUnload":
        agent.meter.consume(dt, "idle");
        label.set(`${name} · жду: ${task.unload.waitLabel}`, "wait");
        break;
      default:
        break;
    }
  }

  // Поставили груз (рука или погрузчик) — ложится на платформу, потом везём.
  function load(unit) {
    if (agent.state !== "waitLoad" || agent.cargo) return false;
    agent.cargo = unit;
    agent.state = "loading";
    tweens.move(unit, model.carry, { x: 0, y: 0, z: 0, rotY: 0 }, TRANSFER_S, {
      onDone: () => {
        agent.state = "toUnload";
        mover.goTo(agent.task.unload.spot);
        agent.task.onLoaded?.();
      },
    });
    return true;
  }

  // Снимают груз (погрузчик): отдаём его, задание выполнено.
  function unload() {
    if (agent.state !== "waitUnload" || !agent.cargo) return null;
    const unit = agent.cargo;
    agent.cargo = null;
    const task = agent.task;
    agent.task = null;
    agent.state = "idle";
    task.onDone?.();
    return unit;
  }

  return {
    agent,
    assign,
    step,
    load,
    unload,
    isIdle: () => agent.state === "idle",
    waitingLoad: () => agent.state === "waitLoad" && !agent.cargo,
    waitingUnload: () => agent.state === "waitUnload" && Boolean(agent.cargo),
    status: () => label.text(),
    utilization: () => (agent.seconds ? agent.busySeconds / agent.seconds : 0),
    dispose() {
      label.dispose();
      group.remove(model.group);
      model.dispose?.();
    },
  };
}
