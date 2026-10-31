import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { CONFIG } from './config.js';
import {
  BODIES, BODY_BY_ID, DESTINATIONS, GALAXY_INFO, SCALES, STATION_INFO,
} from './data.js';
import { loadAssets, createThumbnail } from './textures.js';
import { createWorld } from './world.js';
import { CameraRig } from './nav.js';
import { createLabels } from './labels.js';
import { createUI } from './ui.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const isMobile = () => window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;

function fail(message) {
  const loader = document.getElementById('loading');
  const error = document.getElementById('error');
  document.getElementById('error-message').textContent = message;
  error.hidden = false;
  loader?.classList.add('done');
}

async function boot() {
  const mobile = isMobile();
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      logarithmicDepthBuffer: true,
    });
  } catch (error) {
    fail('当前浏览器未能启用 WebGL。请更换 Chrome、Edge 或 Safari 的最新版本，并在设置中开启硬件加速。');
    return;
  }

  const pixelRatio = Math.min(
    window.devicePixelRatio || 1,
    mobile ? CONFIG.mobilePixelRatio : CONFIG.maxPixelRatio
  );
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.setClearColor(0x04070b, 1);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  document.getElementById('universe').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04070b);

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.02, 200000);
  camera.position.set(10, 4, 12);

  const rig = new CameraRig(camera, document.getElementById('universe'));
  rig.setComposition(0.2, 0.06);

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(pixelRatio);
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    CONFIG.bloomStrength,
    CONFIG.bloomRadius,
    CONFIG.bloomThreshold
  );
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const loadProgress = document.getElementById('load-progress');
  const loadText = document.getElementById('load-text');

  let assets;
  try {
    assets = await loadAssets({
      mobile,
      anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
      onProgress: fraction => {
        loadProgress.style.width = `${Math.round(fraction * 86)}%`;
        loadText.textContent = fraction < 0.4 ? '正在读取天体纹理' : fraction < 0.85 ? '正在点亮恒星' : '正在铺开旋臂';
      },
    });
  } catch (error) {
    console.error(error);
    fail('天体纹理加载失败。请重新加载页面，或使用支持 WebGL 2 的新版浏览器。');
    return;
  }

  const world = createWorld(scene, assets.textures, {
    mobile,
    pixelRatio,
  });

  /* ---------- 缩略图 ---------- */
  const thumbnails = {};
  for (const body of DESTINATIONS) {
    const key = body.texture === 'earth' ? 'earthDay' : body.texture;
    const image = assets.images[key];
    if (image) thumbnails[body.id] = createThumbnail(image, { sun: body.kind === 'star' });
  }

  /* ---------- 状态 ---------- */
  const state = {
    time: 0,
    speed: 1,
    paused: false,
    orbits: true,
    labels: true,
    satellitesVisible: true,
    nightBoost: 0,
    stage: 'earth',
    focusId: 'earth',
  };

  const galaxyAnchor = new THREE.Object3D();
  galaxyAnchor.position.set(...SCALES.galaxyCenter);
  scene.add(galaxyAnchor);

  const sunAnchor = world.sunGroup;
  const earthAnchor = world.bodies.earth.group;

  const infoById = id => {
    if (id === 'galaxy') return GALAXY_INFO;
    if (id === 'station') return STATION_INFO;
    return BODY_BY_ID[id] || BODY_BY_ID.earth;
  };

  const labels = createLabels({
    camera,
    world,
    onSelect: id => focus(id),
  });

  const compositionFor = id => {
    if (id === 'earth') return mobile ? 0.03 : 0.2;
    if (id === 'sun') return mobile ? 0.02 : 0.12;
    if (id === 'galaxy') return mobile ? 0.02 : 0.04;
    return mobile ? 0.02 : 0.14;
  };

  function nightView({ instant = false } = {}) {
    const earthPosition = new THREE.Vector3();
    earthAnchor.getWorldPosition(earthPosition);
    const direction = earthPosition.clone().normalize();
    direction.y += 0.22;
    direction.z += 0.12;
    direction.normalize();

    state.nightBoost = 1;
    state.focusId = 'earth';
    rig.setLimits(1);
    rig.setComposition(compositionFor('earth'), mobile ? 0.02 : 0.05);
    const distance = mobile ? 4.4 : 3.05;
    if (instant) {
      rig.setAnchor(earthAnchor, {
        distance,
        yaw: Math.atan2(direction.x, direction.z),
        pitch: Math.asin(clamp(direction.y, -1, 1)),
      });
    } else {
      rig.flyTo({ anchor: earthAnchor, distance, direction });
    }
    ui.setInfo(BODY_BY_ID.earth);
    ui.setActive('earth');
    ui.showHint('夜面 · 城市灯光', 3000);
  }

  const ui = createUI({
    thumbnails,
    onSelect: id => focus(id),
    onView: view => goView(view),
    onZoom: direction => {
      rig.cancelFlight();
      const changed = rig.zoomBy(direction === 'in' ? 0.72 : 1.38);
      if (changed) maybeReanchor(direction);
    },
    onOrbits: value => {
      state.orbits = value;
      ui.setToggles(state);
    },
    onLabels: value => {
      state.labels = value;
      ui.setToggles(state);
    },
    onPause: () => {
      state.paused = !state.paused;
      ui.setPaused(state.paused);
      ui.showHint(state.paused ? '天体运动已暂停' : '天体运动继续');
    },
    onSpeed: speed => {
      state.speed = speed;
      ui.setSpeed(speed);
    },
    onNight: () => nightView(),
    onStation: () => focus('station'),
  });

  rig.onUserZoom = direction => {
    if (rig.flight) return;
    maybeReanchor(direction);
  };

  rig.onTap = event => {
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.x - rect.left) / rect.width) * 2 - 1,
      -((event.y - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(world.pickables, false);
    if (!hits.length) return;
    const id = hits[0].object.userData.bodyId;
    if (id) focus(id);
  };

  /* ---------- 导航 ---------- */
  function stageOf() {
    if (rig.anchor === galaxyAnchor) return 'galaxy';
    if (rig.anchor === earthAnchor || rig.anchor === world.bodies.moon.group || rig.anchor === world.iss) {
      return rig.distance > 1400 ? 'solar' : 'earth';
    }
    if (rig.anchor === sunAnchor) return rig.distance > 15000 ? 'galaxy' : 'solar';
    return 'solar';
  }

  function refreshStage() {
    if (rig.flight) return;
    const stage = stageOf();
    if (stage !== state.stage) {
      state.stage = stage;
      ui.setStage(stage);
    }
  }

  function focus(id, { instant = false } = {}) {
    if (id === 'galaxy-sun') id = 'sun';
    if (id === 'galaxy') return goView('galaxy');
    if (id === 'earth' && state.stage === 'galaxy') return goView('earth');

    let anchor;
    let distance;
    let radius;
    let info;

    if (id === 'station') {
      anchor = world.iss;
      radius = 0.09;
      distance = mobile ? 0.56 : 0.42;
      info = STATION_INFO;
    } else {
      const body = world.bodies[id];
      if (!body) return;
      anchor = body.group;
      radius = body.radius;
      info = body.def;
      const extent = body.def.ring ? body.def.ring.outer : 1;
      const halfFov = THREE.MathUtils.degToRad(camera.fov * (mobile ? 0.75 : 0.58) / 2);
      distance = (radius * extent) / Math.tan(halfFov);
      if (id === 'earth') distance = mobile ? 6.5 : 4.75;
      if (id === 'sun') distance = radius * 5.2;
    }

    state.focusId = id;
    state.stage = ['earth', 'moon', 'station'].includes(id) ? 'earth' : 'solar';
    if (id !== 'earth') state.nightBoost = 0;
    rig.setLimits(radius);
    rig.setComposition(compositionFor(id), mobile ? 0.015 : (id === 'earth' ? 0.06 : 0.045));

    let direction = null;
    if (id === 'station') {
      const earthPosition = earthAnchor.getWorldPosition(new THREE.Vector3());
      const stationPosition = world.iss.getWorldPosition(new THREE.Vector3());
      const radial = stationPosition.clone().sub(earthPosition).normalize();
      const tangent = new THREE.Vector3().crossVectors(radial, new THREE.Vector3(0, 1, 0)).normalize();
      direction = tangent.multiplyScalar(0.92).addScaledVector(radial, 0.34);
      direction.y += 0.3;
      direction.normalize();
    } else if (id !== 'sun') {
      // 从向阳一侧略偏的角度接近行星，保证主要半球被照亮
      const planetPosition = anchor.getWorldPosition(new THREE.Vector3());
      const sunward = planetPosition.clone().negate().normalize();
      sunward.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.95);
      sunward.y += 0.26;
      direction = sunward.normalize();
    }

    if (instant) {
      const yaw = direction ? Math.atan2(direction.x, direction.z) : rig.yaw;
      const pitch = direction ? Math.asin(clamp(direction.y, -1, 1)) : clamp(rig.pitch, -0.95, 1.05);
      rig.setAnchor(anchor, { distance, yaw, pitch });
    } else if (direction) {
      rig.flyTo({ anchor, distance, direction });
    } else {
      rig.flyTo({
        anchor,
        distance,
        yaw: rig.yaw,
        pitch: clamp(rig.pitch, -0.95, 1.05),
      });
    }
    ui.setInfo(info);
    ui.setActive(id);
    ui.setStage(state.stage);
    if (!instant) ui.showHint(`正在前往 ${info.cn}`, 2000);
  }

  function reanchor(anchor, radius, focusId) {
    const position = camera.position.clone();
    const target = anchor.getWorldPosition(new THREE.Vector3());
    const offset = position.clone().sub(target);
    const length = Math.max(offset.length(), radius * 1.18);

    rig.flight = null;
    rig.anchor = anchor;
    rig.target.copy(target);
    rig.distance = length;
    rig.yaw = Math.atan2(offset.x, offset.z);
    rig.pitch = Math.asin(clamp(offset.y / length, -1, 1));
    rig.setLimits(radius);
    rig.setComposition(compositionFor(focusId));
    rig.applyCamera();

    state.focusId = focusId;
    state.stage = focusId === 'galaxy' ? 'galaxy' : focusId === 'sun' ? 'solar' : 'earth';
    ui.setInfo(infoById(focusId));
    ui.setActive(focusId === 'galaxy' ? null : focusId);
    ui.setStage(state.stage);
  }

  let lastHint = 0;
  function maybeReanchor(direction) {
    if (rig.flight) return;
    if (performance.now() - lastHint < 500) return;

    const earthPosition = earthAnchor.getWorldPosition(new THREE.Vector3());
    const sunPosition = new THREE.Vector3(0, 0, 0);
    const cameraPosition = camera.position;

    if (direction === 'out') {
      if (rig.anchor === earthAnchor && cameraPosition.distanceTo(earthPosition) > 920) {
        lastHint = performance.now();
        reanchor(sunAnchor, world.bodies.sun.radius, 'sun');
        ui.showHint('进入太阳系尺度 · 继续滚动前往银河', 3400);
      } else if (rig.anchor === sunAnchor && cameraPosition.distanceTo(sunPosition) > 9200) {
        lastHint = performance.now();
        reanchor(galaxyAnchor, 2200, 'galaxy');
        ui.showHint('进入银河系尺度', 3200);
      }
    } else {
      if (rig.anchor === galaxyAnchor && cameraPosition.distanceTo(sunPosition) < 7600) {
        lastHint = performance.now();
        reanchor(sunAnchor, world.bodies.sun.radius, 'sun');
        ui.showHint('回到太阳系尺度', 3000);
      } else if (rig.anchor === sunAnchor && cameraPosition.distanceTo(earthPosition) < 26) {
        lastHint = performance.now();
        reanchor(earthAnchor, 1, 'earth');
        ui.showHint('回到近地轨道', 3000);
      }
    }
  }

  function goView(view, { instant = false } = {}) {
    if (view === 'earth') {
      state.nightBoost = 0;
      state.focusId = 'earth';
      rig.setLimits(1);
      rig.setComposition(compositionFor('earth'), mobile ? 0.02 : 0.06);
      const distance = mobile ? 6.5 : 4.75;
      if (instant) {
        rig.setAnchor(earthAnchor, { distance, yaw: -2.72, pitch: 0.16 });
      } else {
        rig.flyTo({ anchor: earthAnchor, distance, yaw: -2.72, pitch: 0.16 });
      }
      ui.setInfo(BODY_BY_ID.earth);
      ui.setActive('earth');
    } else if (view === 'solar') {
      state.nightBoost = 0;
      state.focusId = 'sun';
      rig.setLimits(world.bodies.sun.radius);
      rig.setComposition(compositionFor('sun'), 0.05);
      const distance = mobile ? 11200 : 3700;
      if (instant) {
        rig.setAnchor(sunAnchor, { distance, yaw: -0.7, pitch: 0.66 });
      } else {
        rig.flyTo({ anchor: sunAnchor, distance, yaw: rig.yaw, pitch: 0.66 });
      }
      ui.setInfo(BODY_BY_ID.sun);
      ui.setActive('sun');
    } else if (view === 'galaxy') {
      state.nightBoost = 0;
      state.focusId = 'galaxy';
      rig.setLimits(1800);
      rig.setComposition(compositionFor('galaxy'), 0.07);
      const distance = mobile ? 50000 : 35500;
      if (instant) {
        rig.setAnchor(galaxyAnchor, { distance, yaw: 0.45, pitch: 0.9 });
      } else {
        rig.flyTo({ anchor: galaxyAnchor, distance, yaw: 0.45, pitch: 0.9 });
      }
      ui.setInfo(GALAXY_INFO);
      ui.setActive(null);
    }
    ui.setStage(view);
    state.stage = view;
  }

  /* ---------- 初始镜头 ---------- */
  rig.setAnchor(earthAnchor, { distance: 12, yaw: -1.8, pitch: 0.3 });
  rig.setLimits(1);
  rig.setComposition(0.2, 0.06);
  ui.setInfo(BODY_BY_ID.earth);
  ui.setActive('earth');
  ui.setStage('earth');
  ui.setToggles(state);
  ui.setSpeed(1);

  /* ---------- 尺寸 ---------- */
  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    composer.setSize(width, height);
    bloom.setSize(width, height);
  }
  window.addEventListener('resize', resize);

  /* ---------- 循环 ---------- */
  let lastFrame = performance.now();
  let frameCount = 0;

  function tick() {
    requestAnimationFrame(tick);
    const now = performance.now();
    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    const speed = state.paused ? 0 : state.speed;
    state.time += dt * speed;

    world.update(dt, {
      time: state.time,
      speed,
      camera,
      orbits: state.orbits,
      satellitesVisible: state.satellitesVisible,
      viewportHeight: window.innerHeight,
      nightBoost: state.nightBoost,
      starOpacity: 0.95,
      focusDistance: rig.distance,
      onSunProximity: ratio => {
        const target = ratio < 26 ? CONFIG.bloomStrength * 0.3 : CONFIG.bloomStrength;
        bloom.strength += (target - bloom.strength) * 0.08;
      },
    });

    // 先推进天体位置，再让镜头跟随，避免高速公转时目标落在画面一侧
    rig.update(dt);

    refreshStage();

    frameCount += 1;
    if (frameCount % 3 === 0) {
      labels.update({
        visible: state.labels && !document.body.classList.contains('immersive'),
        stage: state.stage,
        activeId: state.focusId,
      });
    }
    if (frameCount % 6 === 0) {
      const earthPosition = earthAnchor.getWorldPosition(new THREE.Vector3());
      ui.setHUD({
        stage: state.stage,
        distance: state.focusId === 'station' ? (world.iss.getWorldPosition(new THREE.Vector3()).distanceTo(earthPosition)) : rig.distance,
        focusName: infoById(state.focusId).cn,
        focusId: state.focusId,
        radius: state.focusId === 'station' ? 0 : (world.bodies[state.focusId]?.radius || 1),
      });
    }

    composer.render();
  }

  /* ---------- 启动 ---------- */
  loadProgress.style.width = '92%';
  loadText.textContent = '正在校准航线';
  try {
    await renderer.compileAsync(scene, camera);
  } catch (error) {
    console.warn('预编译着色器失败，继续渲染', error);
  }

  resize();
  composer.render();
  loadProgress.style.width = '100%';
  loadText.textContent = '欢迎回到地球';
  await new Promise(resolve => setTimeout(resolve, 260));
  document.getElementById('loading').classList.add('done');
  setTimeout(() => document.getElementById('loading')?.remove(), 900);

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    rig.setAnchor(earthAnchor, { distance: mobile ? 6.5 : 4.75, yaw: -2.72, pitch: 0.16 });
  } else {
    rig.flyTo({ anchor: earthAnchor, distance: mobile ? 6.5 : 4.75, yaw: -2.72, pitch: 0.16, duration: 3.2 });
  }
  tick();

  window.ORBIT = {
    version: '1.0.0',
    goTo: (id, options) => focus(id, options),
    goView: (view, options) => goView(view, options),
    night: options => nightView(options),
    zoom: direction => {
      rig.zoomBy(direction === 'in' ? 0.72 : 1.38);
      refreshStage();
    },
    setPaused: value => {
      state.paused = value;
      ui.setPaused(value);
    },
    getState: () => ({
      stage: state.stage,
      focus: state.focusId,
      distance: rig.distance,
      time: state.time,
      speed: state.speed,
      paused: state.paused,
      orbits: state.orbits,
      labels: state.labels,
      galaxyStars: world.galaxy.points.geometry.attributes.position.count,
      pixelRatio: renderer.getPixelRatio(),
    }),
  };

  window.addEventListener('error', event => {
    console.error(event.error || event.message);
  });
}

boot().catch(error => {
  console.error(error);
  fail('初始化三维场景时出现问题。请确认浏览器已开启硬件加速，或使用新版 Chrome、Edge、Safari 重试。');
});
