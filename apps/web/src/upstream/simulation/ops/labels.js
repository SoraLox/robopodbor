import * as THREE from "three";

// Подпись над роботом: что он делает прямо сейчас («Везу №12 → B-3», «Жду груз»).
// Спрайт с текстом на канве; перерисовывается, только когда текст поменялся.
const W = 512;
const H = 96;

export function createLabel(parent, { height = 6.5, scale = 7.2 } = {}) {
  const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
  const ctx = canvas?.getContext?.("2d") ?? null;
  if (canvas) {
    canvas.width = W;
    canvas.height = H;
  }
  const texture = canvas && ctx ? new THREE.CanvasTexture(canvas) : null;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(scale, (scale * H) / W, 1);
  sprite.position.y = height;
  sprite.renderOrder = 10;
  parent.add(sprite);
  let current = "";

  function set(text, tone = "neutral") {
    const key = `${tone}|${text}`;
    if (key === current) return;
    current = key;
    if (!ctx || !texture) return;
    ctx.clearRect(0, 0, W, H);
    ctx.font = "600 34px -apple-system, 'Segoe UI', Roboto, sans-serif";
    const width = Math.min(W - 8, ctx.measureText(text).width + 40);
    const x = (W - width) / 2;
    ctx.fillStyle = tone === "wait" ? "rgba(255,244,214,0.96)" : tone === "idle" ? "rgba(242,242,244,0.92)" : "rgba(255,255,255,0.96)";
    ctx.strokeStyle = tone === "wait" ? "#E5A100" : "rgba(0,0,0,0.12)";
    ctx.lineWidth = 3;
    const r = 26;
    ctx.beginPath();
    ctx.moveTo(x + r, 10);
    ctx.arcTo(x + width, 10, x + width, H - 10, r);
    ctx.arcTo(x + width, H - 10, x, H - 10, r);
    ctx.arcTo(x, H - 10, x, 10, r);
    ctx.arcTo(x, 10, x + width, 10, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#1D1D1F";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, W / 2, H / 2 + 1, W - 48);
    texture.needsUpdate = true;
  }

  return {
    set,
    text: () => current.split("|").slice(1).join("|"),
    dispose() {
      parent.remove(sprite);
      texture?.dispose();
      material.dispose();
    },
  };
}
