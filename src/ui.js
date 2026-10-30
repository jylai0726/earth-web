import { CONFIG } from './config.js';
import { DESTINATIONS, SPEEDS } from './data.js';

const km = value => `${Math.round(value).toLocaleString('en-US')}`;

/**
 * 界面层：资料面板、目的地、图层开关、时间控制、快捷键与弹窗。
 */
export function createUI({
  thumbnails,
  onSelect,
  onView,
  onZoom,
  onOrbits,
  onLabels,
  onPause,
  onSpeed,
  onNight,
  onStation,
}) {
  const $ = selector => document.querySelector(selector);
  const info = {
    panel: $('#info-panel'),
    category: $('#info-category'),
    en: $('#info-en'),
    name: $('#info-name'),
    description: $('#info-description'),
    statLabel1: $('#stat-label-1'),
    statValue1: $('#stat-value-1'),
    statLabel2: $('#stat-label-2'),
    statValue2: $('#stat-value-2'),
    meta: $('#info-meta'),
    earthActions: $('#earth-actions'),
    observation: $('#observation-text'),
  };

  const dock = $('#planet-list');
  const dockButtons = new Map();
  for (const body of DESTINATIONS) {
    const button = document.createElement('button');
    button.className = 'planet-button';
    button.dataset.id = body.id;
    button.setAttribute('role', 'listitem');
    button.title = `${body.cn} · ${body.en}`;
    button.innerHTML = `
      <span class="planet-thumb" style="background-image:url(${thumbnails[body.id] || ''})"></span>
      <span>${body.cn}</span>`;
    button.addEventListener('click', () => onSelect?.(body.id));
    dock.appendChild(button);
    dockButtons.set(body.id, button);
  }

  const scenes = [...document.querySelectorAll('.scenes button')];
  const waypoints = [...document.querySelectorAll('.waypoint')];
  scenes.forEach(button => button.addEventListener('click', () => onView?.(button.dataset.view)));
  waypoints.forEach(button => button.addEventListener('click', () => onView?.(button.dataset.view)));

  $('#github-link').href = CONFIG.repoUrl;
  $('#site-link').href = CONFIG.siteUrl;
  $('#home').addEventListener('click', event => {
    event.preventDefault();
    onView?.('earth');
  });
  $('#zoom-in').addEventListener('click', () => onZoom?.('in'));
  $('#zoom-out').addEventListener('click', () => onZoom?.('out'));

  const orbitsButton = $('#toggle-orbits');
  const labelsButton = $('#toggle-labels');
  orbitsButton.addEventListener('click', () => onOrbits?.(orbitsButton.getAttribute('aria-pressed') !== 'true'));
  labelsButton.addEventListener('click', () => onLabels?.(labelsButton.getAttribute('aria-pressed') !== 'true'));

  $('#pause').addEventListener('click', () => onPause?.());

  const speedGroup = $('#speeds');
  for (const speed of SPEEDS) {
    const button = speedGroup.querySelector(`[data-speed="${speed}"]`);
    button?.addEventListener('click', () => onSpeed?.(speed));
  }

  info.earthActions.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    if (button.dataset.action === 'night') onNight?.();
    if (button.dataset.action === 'station') onStation?.();
  });

  /* ---------- 弹窗 ---------- */
  const dialogs = [...document.querySelectorAll('dialog')];
  const openDialog = dialog => {
    if (!dialog) return;
    dialogs.forEach(item => { if (item.open) item.close(); });
    dialog.showModal();
  };
  const closeDialogs = () => dialogs.forEach(dialog => { if (dialog.open) dialog.close(); });
  dialogs.forEach(dialog => {
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });
    dialog.querySelectorAll('[data-close]').forEach(button => {
      button.addEventListener('click', () => dialog.close());
    });
  });
  $('#help-button').addEventListener('click', () => openDialog($('#help-dialog')));
  $('#credits-button').addEventListener('click', () => openDialog($('#credits-dialog')));

  /* ---------- 移动端资料折叠 ---------- */
  const toggle = $('#panel-toggle');
  toggle?.addEventListener('click', () => {
    const expanded = info.panel.classList.toggle('expanded');
    info.panel.classList.toggle('collapsed', !expanded);
    toggle.setAttribute('aria-expanded', String(expanded));
  });
  if (window.matchMedia('(max-width: 900px)').matches) {
    info.panel.classList.add('collapsed');
  }

  /* ---------- 全屏 / 沉浸 ---------- */
  const fullscreen = () => {
    const root = document.documentElement;
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      root.requestFullscreen?.().catch(() => {});
    }
  };
  $('#fullscreen').addEventListener('click', fullscreen);

  let immersive = false;
  const hint = $('#hint');
  let hintTimer = 0;
  const showHint = (text, duration = 2600) => {
    if (!hint) return;
    hint.textContent = text;
    hint.classList.add('show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hint.classList.remove('show'), duration);
  };

  const toggleImmersive = () => {
    immersive = !immersive;
    document.body.classList.toggle('immersive', immersive);
    if (immersive) showHint('界面已隐藏 · 按 I 恢复', 3200);
  };

  /* ---------- 快捷键 ---------- */
  window.addEventListener('keydown', event => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      onZoom?.('in');
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      onZoom?.('out');
    } else if (event.code === 'Space') {
      event.preventDefault();
      onPause?.();
    } else if (event.key.toLowerCase() === 'h') {
      onView?.('earth');
    } else if (event.key.toLowerCase() === 'f') {
      fullscreen();
    } else if (event.key.toLowerCase() === 'i') {
      toggleImmersive();
    } else if (event.key === '?') {
      event.preventDefault();
      openDialog($('#help-dialog'));
    } else if (event.key === 'Escape') {
      if (immersive) {
        immersive = false;
        document.body.classList.remove('immersive');
      }
    }
  });

  /* ---------- 对外更新 ---------- */
  function setInfo(body, { tracking = true } = {}) {
    info.category.textContent = body.category;
    info.en.textContent = body.en;
    info.name.replaceChildren(document.createTextNode(body.cn));
    info.name.classList.toggle('long-name', body.cn.length >= 5);
    const index = document.createElement('span');
    index.className = 'object-index';
    index.textContent = body.index;
    info.name.appendChild(index);
    info.description.textContent = body.description;

    info.statLabel1.textContent = body.stats[0][0];
    info.statLabel2.textContent = body.stats[1][0];
    info.statValue1.replaceChildren(
      document.createTextNode(body.stats[0][1]),
      Object.assign(document.createElement('small'), { textContent: ` ${body.stats[0][2]}` })
    );
    info.statValue2.replaceChildren(
      document.createTextNode(body.stats[1][1]),
      Object.assign(document.createElement('small'), { textContent: ` ${body.stats[1][2]}` })
    );

    info.meta.replaceChildren(...body.meta.map(([label, value]) => {
      const row = document.createElement('div');
      const left = document.createElement('span');
      left.textContent = label;
      const right = document.createElement('b');
      right.textContent = value;
      row.append(left, right);
      return row;
    }));

    info.earthActions.style.display = body.id === 'earth' ? '' : 'none';
    info.observation.textContent = tracking ? `正在追踪${body.cn}` : `已定位${body.cn}`;
    info.panel.scrollTop = 0;
  }

  function setActive(id) {
    dockButtons.forEach((button, key) => button.classList.toggle('active', key === id));
  }

  function setStage(stage) {
    scenes.forEach(button => button.classList.toggle('active', button.dataset.view === stage));
    waypoints.forEach(button => button.classList.toggle('active', button.dataset.view === stage));
  }

  function setHUD({ stage, distance, focusName, focusId, radius = 1 }) {
    const caption = $('#view-caption');
    const detail = $('#view-distance');
    const readout = $('#scale-readout');

    if (focusId === 'station') {
      caption.textContent = '国际空间站';
      detail.textContent = '近地轨道 · 408 km';
      readout.textContent = 'LEO';
    } else if (stage === 'earth') {
      caption.textContent = `${focusName}近轨`;
      detail.textContent = `距地表 ${km(Math.max(0, (distance - radius) * 6371))} km`;
      readout.textContent = `${km(Math.max(0, (distance - radius) * 6371))} km`;
    } else if (stage === 'solar') {
      caption.textContent = focusId === 'sun' ? '太阳系' : focusName;
      if (focusId === 'sun') {
        detail.textContent = `视野 ${(distance / 620).toFixed(2)} AU`;
        readout.textContent = `${(distance / 620).toFixed(2)} AU`;
      } else {
        detail.textContent = `距地表 ${km(Math.max(0, (distance - radius) * 6371))} km`;
        readout.textContent = `${Math.round(Math.max(0, (distance - radius) * 6371) / 1000)}k km`;
      }
    } else {
      caption.textContent = '银河系 · 猎户臂';
      detail.textContent = `距银心 ${km(distance * 5.6)} 光年`;
      readout.textContent = `${Math.round(distance * 5.6 / 1000)} kly`;
    }

    const dot = $('#scale-indicator');
    if (stage === 'galaxy') {
      dot.style.opacity = '0';
    } else {
      dot.style.opacity = '';
      const p = Math.min(1, Math.max(0, Math.log(distance / 1200) / Math.log(62000 / 1200)));
      dot.style.top = `${stage === 'earth' ? 55 + p * 45 : p * 45}%`;
    }
  }

  function setToggles({ orbits, labels }) {
    orbitsButton.setAttribute('aria-pressed', String(orbits));
    labelsButton.setAttribute('aria-pressed', String(labels));
  }

  function setPaused(paused) {
    document.body.classList.toggle('paused', paused);
    $('#pause').setAttribute('aria-label', paused ? '继续天体运动' : '暂停天体运动');
  }

  function setSpeed(speed) {
    speedGroup.querySelectorAll('button').forEach(button => {
      button.classList.toggle('active', Number(button.dataset.speed) === speed);
    });
  }

  return {
    setInfo,
    setActive,
    setStage,
    setHUD,
    setToggles,
    setPaused,
    setSpeed,
    showHint,
    toggleImmersive,
    isImmersive: () => immersive,
    closeDialogs,
  };
}
