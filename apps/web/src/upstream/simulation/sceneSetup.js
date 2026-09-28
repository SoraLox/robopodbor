import * as THREE from "three";
import { FLOOR } from "./layout.js";
import { ISO_ELEV, SCENE_HEIGHT_PX } from "./constants.js";
import { applyColorSpace, disposeTree } from "./sceneUtils.js";
import { createFloorLevel, createSharedLevelAssets, FLOOR_PITCH } from "./floorLevel.js";
import { setStudioLook, activePalette } from "./studioLook.js";

const CAM_DIST = 108;
const FOCUS_EASE = 0.12;
const TOP_ELEVATION = 1.553; // ~89°: почти строго сверху (строго — вырожденный «вверх» камеры)

// Как выглядят «прозрачные» этажи: полупрозрачный силуэт вместо обычных материалов.
const GHOST_OPACITY = 0.17;

// Единоразовая сборка сцены: свет, основание, камера, рендерер и то, что общее
// для всех этажей. Сами этажи (createFloorLevel) добавляются и убираются по
// мере надобности через setLevelCount.
export function createWarehouseScene(mount, { fogColor = 0x77798f, mono = false } = {}) {
  // Высота берётся из контейнера (immersive hero) с запасным SCENE_HEIGHT_PX.
  const sceneHeight = () => Math.max(1, mount.clientHeight || SCENE_HEIGHT_PX);
  const width = Math.max(1, mount.clientWidth);

  // Палитра сцены: studioLook включается только при mono (сейчас выкл.).
  setStudioLook(mono);

  const scene = new THREE.Scene();
  if (mono) {
    scene.fog = null;
  } else {
    scene.fog = new THREE.Fog(fogColor, 145, 245);
  }

  addLights(scene, { mono });

  const shared = createSharedLevelAssets();
  const beltTexture = createBeltTexture();

  const staticGroup = new THREE.Group(); // основание — не участвует в «прозрачном» проходе
  addBase(staticGroup, { mono });
  scene.add(staticGroup);

  const levelsGroup = new THREE.Group();
  scene.add(levelsGroup);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // updateStyle=false: размеры буфера отдельно от CSS. Иначе canvas style width/height
  // в пикселях раздувает absolute-контейнер (clientWidth растёт → setSize → ещё больше).
  renderer.setSize(width, sceneHeight(), false);
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.display = "block";
  applyColorSpace(renderer, true);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = mono ? 1.02 : 0.92;
  renderer.shadowMap.enabled = true;
  // THREE.PCFSoftShadowMap был убран в этой версии three.js (рендерер тихо
  // подменял его на жёсткий PCFShadowMap и заодно игнорировал keyLight.shadow.radius
  // ниже — размытие край теней работает только с VSM/старым PCFSoft).
  renderer.shadowMap.type = THREE.VSMShadowMap;
  mount.appendChild(renderer.domElement);

  const ghostMaterial = new THREE.MeshStandardMaterial({
    color: 0xd8d0f5,
    transparent: true,
    opacity: GHOST_OPACITY,
    depthWrite: false,
    flatShading: true,
    roughness: 0.8,
  });

  const levels = [];
  // focusZ — куда смотрит камера по оси Z: со складом погрузчиков она смещена к
  // воротам, чтобы фуры на подъезде были в кадре.
  const cameraState = { theta: Math.PI / 4, thetaTarget: Math.PI / 4, zoom: 40, focusY: 0, focusZ: 0, focusZTarget: 0, elevation: ISO_ELEV, elevationTarget: ISO_ELEV };

  const updateCamera = (activeFloor = 0) => {
    const t = cameraState.theta;
    const targetY = activeFloor * FLOOR_PITCH;
    cameraState.focusY += (targetY - cameraState.focusY) * FOCUS_EASE;
    cameraState.focusZ += (cameraState.focusZTarget - cameraState.focusZ) * FOCUS_EASE;
    cameraState.elevation += (cameraState.elevationTarget - cameraState.elevation) * FOCUS_EASE;

    const elevation = cameraState.elevation;

    camera.position.set(
      CAM_DIST * Math.cos(elevation) * Math.sin(t),
      cameraState.focusY + CAM_DIST * Math.sin(elevation),
      cameraState.focusZ + CAM_DIST * Math.cos(elevation) * Math.cos(t)
    );

    camera.lookAt(0, cameraState.focusY, cameraState.focusZ);

    // Стены, ближайшие к камере, растворяются — считаем от того же угла.
    for (const level of levels) level.walls.update(t);
  };

  const applyFrustum = () => {
    const a = Math.max(1, mount.clientWidth) / sceneHeight();
    const hh = cameraState.zoom;

    camera.left = -hh * a;
    camera.right = hh * a;
    camera.top = hh;
    camera.bottom = -hh;
    camera.updateProjectionMatrix();
  };

  // Ровно столько этажей, сколько нужно: лишние убираем, недостающие строим.
  const setLevelCount = (count) => {
    while (levels.length > count) {
      const level = levels.pop();
      levelsGroup.remove(level.group);
      level.dispose();
    }

    while (levels.length < count) {
      const level = createFloorLevel(shared, levels.length);
      levels.push(level);
      levelsGroup.add(level.group);
    }
  };

  // Активный этаж рисуется как обычно, остальные — полупрозрачными силуэтами:
  // вторым проходом с подменой материала и без стен, следа и подписей.
  const render = (activeFloor) => {
    if (levels.length <= 1) {
      renderer.render(scene, camera);
      return;
    }

    renderer.autoClear = false;
    renderer.clear();

    levels.forEach((level, i) => {
      level.group.visible = i === activeFloor;
    });
    renderer.render(scene, camera);

    levels.forEach((level, i) => {
      level.group.visible = i !== activeFloor;
      level.decals.forEach((decal) => {
        decal.visible = false;
      });
    });
    staticGroup.visible = false;
    scene.overrideMaterial = ghostMaterial;
    renderer.render(scene, camera);

    scene.overrideMaterial = null;
    staticGroup.visible = true;
    levels.forEach((level) => {
      level.group.visible = true;
      level.decals.forEach((decal) => {
        decal.visible = true;
      });
    });
    renderer.autoClear = true;
  };

  updateCamera();
  applyFrustum();

  const onResize = () => {
    const nextW = Math.max(1, mount.clientWidth);
    const nextH = sceneHeight();
    // Защита от разгона: если контейнер внезапно стал гигантским — не пишем в буфер.
    if (nextW > 4000 || nextH > 4000) return;
    renderer.setSize(nextW, nextH, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    applyFrustum();
  };

  window.addEventListener("resize", onResize);
  const resizeObserver =
    typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => onResize()) : null;
  resizeObserver?.observe(mount);

  const dispose = (raf) => {
    resizeObserver?.disconnect();
    window.removeEventListener("resize", onResize);
    cancelAnimationFrame(raf);
    setLevelCount(0);
    setStudioLook(false);
    renderer.dispose();
    ghostMaterial.dispose();
    beltTexture.dispose();
    disposeTree(staticGroup);

    shared.floorTexture.dispose();
    shared.floorMaterial.dispose();
    shared.slabGeometry.dispose();
    shared.trailGeometry.dispose();

    if (renderer.domElement.parentNode === mount) {
      mount.removeChild(renderer.domElement);
    }
  };

  return {
    scene,
    renderer,
    camera,
    levels,
    TOP_ELEVATION,
    floorCtx: shared.floorCtx,
    floorTexture: shared.floorTexture,
    beltTexture,
    cameraState,
    setLevelCount,
    updateCamera,
    applyFrustum,
    render,
    dispose,
  };
}

function addLights(scene, { mono = false } = {}) {
  if (mono) {
    // High-key, но с тёмным «полом» в hemisphere — мягкий AO и читаемые тени.
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8B919C, 1.15));
    scene.add(new THREE.AmbientLight(0xffffff, 0.28));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.85);
    keyLight.position.set(42, 110, 28);
    keyLight.castShadow = true;
    keyLight.shadow.camera.left = -85;
    keyLight.shadow.camera.right = 85;
    keyLight.shadow.camera.top = 85;
    keyLight.shadow.camera.bottom = -85;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 260;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.bias = -0.00015;
    keyLight.shadow.normalBias = 0.04;
    keyLight.shadow.radius = 6;
    keyLight.shadow.intensity = 0.85;
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xdce6f5, 0.38);
    fillLight.position.set(-50, 40, -35);
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0x2f86f0, 0.22);
    rimLight.position.set(-20, 28, 60);
    scene.add(rimLight);
    return;
  }

  const hemisphereLight = new THREE.HemisphereLight(0xe9e3ff, 0x35384e, 3);
  scene.add(hemisphereLight);

  const ambientLight = new THREE.AmbientLight(0x777b9d, 0.17);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xffdca2, 3);
  keyLight.position.set(38, 90, 32);
  keyLight.castShadow = true;
  keyLight.shadow.camera.left = -85;
  keyLight.shadow.camera.right = 85;
  keyLight.shadow.camera.top = 85;
  keyLight.shadow.camera.bottom = -85;
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 260;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  keyLight.shadow.bias = -0.00012;
  keyLight.shadow.normalBias = 0.035;
  keyLight.shadow.radius = 4;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x8498d4, 0.3);
  fillLight.position.set(-45, 48, -42);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffb36f, 0.26);
  rimLight.position.set(-25, 34, 58);
  scene.add(rimLight);
}

// Тёмное основание под самым нижним этажом.
function addBase(group, { mono = false } = {}) {
  const floorBase = new THREE.Mesh(
    new THREE.BoxGeometry(FLOOR + 6, 6, FLOOR + 6),
    new THREE.MeshStandardMaterial({
      color: mono ? 0xd5d9e0 : 0x27293b,
      roughness: mono ? 0.88 : 0.92,
      metalness: 0.0,
      flatShading: !mono,
    })
  );
  floorBase.position.y = -5.35;
  floorBase.receiveShadow = true;
  group.add(floorBase);
}

function createBeltTexture() {
  const beltCanvas = document.createElement("canvas");
  beltCanvas.width = 128;
  beltCanvas.height = 32;

  const palette = activePalette();
  const bctx = beltCanvas.getContext("2d");
  bctx.fillStyle = palette.belt;
  bctx.fillRect(0, 0, 128, 32);
  bctx.fillStyle = palette.beltStripe;

  for (let i = -32; i < 128; i += 24) {
    bctx.beginPath();
    bctx.moveTo(i, 32);
    bctx.lineTo(i + 12, 0);
    bctx.lineTo(i + 17, 0);
    bctx.lineTo(i + 5, 32);
    bctx.fill();
  }

  const beltTexture = new THREE.CanvasTexture(beltCanvas);
  beltTexture.wrapS = THREE.RepeatWrapping;
  beltTexture.wrapT = THREE.RepeatWrapping;
  beltTexture.repeat.set(3, 1);
  beltTexture.anisotropy = 8;
  applyColorSpace(beltTexture, false);

  return beltTexture;
}
