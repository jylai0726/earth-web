import * as THREE from 'three';

const _world = new THREE.Vector3();
const _center = new THREE.Vector3();
const _toCenter = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _closest = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _camBack = new THREE.Vector3();
const _point = new THREE.Vector3();

/**
 * 三维标记层：投影到屏幕、按距离显示、被其他天体遮挡时隐藏。
 */
export function createLabels({ camera, world, onSelect }) {
  const layer = document.getElementById('labels');
  const planetBodies = Object.values(world.bodies).filter(body => body.def.kind === 'planet');

  const targets = [
    { id: 'sun', object: world.bodies.sun.group, radius: world.bodies.sun.radius, major: true },
    ...planetBodies.map(body => ({
      id: body.def.id,
      object: body.group,
      radius: body.radius,
      major: ['earth', 'jupiter', 'saturn'].includes(body.def.id),
    })),
    { id: 'moon', object: world.bodies.moon.group, radius: world.bodies.moon.radius, major: false },
    { id: 'station', object: world.iss, radius: 0.08, major: false, station: true, label: '国际空间站' },
    {
      id: 'galaxy-sun',
      object: world.galaxy.sunMarker,
      radius: 0,
      label: '太阳系 · 你在这里',
      major: true,
      galaxyOnly: true,
      noOffset: true,
    },
  ];

  for (const target of targets) {
    target.el = document.createElement('div');
    target.el.className = `label${target.major ? ' major' : ''}`;
    target.el.textContent = target.label || world.bodies[target.id]?.def.cn || target.id;
    target.el.addEventListener('click', event => {
      event.stopPropagation();
      onSelect?.(target.id);
    });
    layer.appendChild(target.el);
  }

  const occluders = Object.values(world.bodies)
    .filter(body => body.def.kind !== 'moon')
    .map(body => ({ object: body.group, radius: body.radius }));

  const state = {
    visible: true,
    stage: 'earth',
    activeId: 'earth',
  };

  function isOccluded(point, selfId) {
    const origin = camera.position;
    _dir.copy(point).sub(origin);
    const length = _dir.length();
    if (length < 1e-6) return false;
    _dir.divideScalar(length);

    for (const occluder of occluders) {
      if (occluder.object === world.bodies[selfId]?.group) continue;
      occluder.object.getWorldPosition(_center);
      _toCenter.copy(_center).sub(origin);
      const t = _toCenter.dot(_dir);
      if (t <= 0 || t >= length - occluder.radius) continue;
      _closest.copy(origin).addScaledVector(_dir, t);
      if (_closest.distanceTo(_center) < occluder.radius * 0.94) return true;
    }
    return false;
  }

  function hide(target) {
    target.el.classList.remove('visible');
  }

  function update(options = {}) {
    Object.assign(state, options);
    const placed = [];
    const width = window.innerWidth;
    const height = window.innerHeight;
    const panels = [document.getElementById('info-panel'), document.querySelector('.bottom-ui'), document.querySelector('.topbar')]
      .filter(Boolean)
      .map(el => el.getBoundingClientRect())
      .filter(rect => rect.width > 0 && rect.height > 0);
    world.bodies.earth.group.getWorldPosition(_center);
    const distanceToEarth = camera.position.distanceTo(_center);

    for (const target of targets) {
      const el = target.el;
      let visible = state.visible;

      if (target.galaxyOnly) {
        visible = visible && state.stage === 'galaxy';
      } else if (state.stage === 'galaxy') {
        visible = false;
      } else if (target.station) {
        visible = visible && state.stage === 'earth' && distanceToEarth < 26;
      } else if (state.stage === 'earth') {
        visible = visible && ['earth', 'moon'].includes(target.id);
      } else if (target.id === 'moon') {
        visible = false;
      }

      if (!visible) {
        hide(target);
        continue;
      }

      target.object.getWorldPosition(_world);
      const distance = camera.position.distanceTo(_world);

      if (!target.noOffset) {
        if (distance / Math.max(target.radius, 0.001) < 2.3) {
          hide(target);
          continue;
        }
        if (distance > 42000) {
          hide(target);
          continue;
        }
        _world.y += target.radius * 1.05 + distance * 0.0035;
      }

      _camDir.copy(_world).sub(camera.position);
      _camBack.setFromMatrixColumn(camera.matrixWorld, 2);
      if (_camDir.dot(_camBack) > 0) {
        hide(target);
        continue;
      }

      _point.copy(_world).project(camera);
      if (_point.z > 1 || _point.z < -1) {
        hide(target);
        continue;
      }
      const x = (_point.x * 0.5 + 0.5) * width;
      const y = (-_point.y * 0.5 + 0.5) * height;
      if (x < -90 || x > width + 90 || y < 96 || y > height - 196) {
        hide(target);
        continue;
      }
      if (panels.some(rect => x > rect.left - 8 && x < rect.right + 8 && y > rect.top - 4 && y < rect.bottom + 4)) {
        hide(target);
        continue;
      }

      if (!target.noOffset && isOccluded(_world, target.id)) {
        hide(target);
        continue;
      }

      const collides = placed.some(item => Math.abs(item.x - x) < 46 && Math.abs(item.y - y) < 17);
      if (collides) {
        hide(target);
        continue;
      }
      placed.push({ x, y });

      const offsetY = target.noOffset ? 26 : 9;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${(y - offsetY).toFixed(1)}px, 0) translate(-50%, -50%)`;
      el.classList.toggle('active', target.id === state.activeId);
      el.classList.add('visible');
    }
  }

  return { update, el: layer };
}
