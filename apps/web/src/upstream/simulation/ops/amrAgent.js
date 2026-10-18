import { createEnergyMeter } from "../energy.js";
import { createLabel } from "./labels.js";

// Плоский транспортировщик (AMR-платформа) — исполнитель: сам груз не берёт.
// Задание: «встань на стоянку погрузки → жди, пока поставят → вези на стоянку
// разгрузки → жди, пока снимут». Ставят и снимают рука или погрузчик — через
// load(unit) / unload().

export function createAmrAgent({ group, driver, traffic, robotFactory, start, home, speedUnits, energyProfile, name, rehome = null }) {
  const model = robotFactory();
  model.group.position.set(start.x, 0, start.z);
  group.add(model.group);
  const label = createLabel(model.group, { height: 5 });
  const agent = {
    name,
    model,
    // Корпус платформы (2,1 × 2,9 ед.) — меньше погрузчика.
    pos: { x: start.x, z: start.z, heading: 0, body: { radius: 1.1, offsets: [-0.4, 0.4] } },
    home,
    state: "idle",
    task: null,
    cargo: null,
    meter: createEnergyMeter(energyProfile),
    busySeconds: 0,
    seconds: 0,
  };
  traffic.add(agent);
  label.set(`${name} · свободен`, "idle");

  function assign(task) {
    agent.task = task;
    agent.state = "toLoad";
  }

  function step(dt) {
    agent.seconds += dt;
    const task = agent.task;
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
      case "toLoad":
        agent.meter.consume(dt, "work");
        label.set(`${name} · еду за ${task.jobLabel}: ${task.load.label}`);
        if (driver.drive(agent, task.load.spot, dt, speedUnits)) agent.state = "waitLoad";
        break;
      case "waitLoad":
        agent.meter.consume(dt, "idle");
        label.set(`${name} · жду ${task.jobLabel}: ${task.load.waitLabel}`, "wait");
        break;
      case "toUnload":
        agent.meter.consume(dt, "work");
        label.set(`${name} · везу ${task.jobLabel} → ${task.unload.label}`);
        if (driver.drive(agent, task.unload.spot, dt, speedUnits)) agent.state = "waitUnload";
        break;
      case "waitUnload":
        agent.meter.consume(dt, "idle");
        label.set(`${name} · жду: ${task.unload.waitLabel}`, "wait");
        break;
      default:
        break;
    }
  }

  // Поставили груз (рука или погрузчик) — везём.
  function load(unit) {
    if (agent.state !== "waitLoad" || agent.cargo) return false;
    agent.cargo = unit;
    unit.removeFromParent();
    unit.position.set(0, 0, 0);
    unit.rotation.set(0, 0, 0);
    model.carry.add(unit);
    driver.release(agent, agent.task.load.spot);
    agent.state = "toUnload";
    agent.task.onLoaded?.();
    return true;
  }

  // Сняли груз (погрузчик) — задание выполнено.
  function unload() {
    if (agent.state !== "waitUnload" || !agent.cargo) return null;
    const unit = agent.cargo;
    agent.cargo = null;
    unit.removeFromParent();
    driver.release(agent, agent.task.unload.spot);
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
    // Стоит на стоянке погрузки пустой и ждёт груз.
    waitingLoad: () => agent.state === "waitLoad" && !agent.cargo,
    waitingUnload: () => agent.state === "waitUnload" && Boolean(agent.cargo),
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
