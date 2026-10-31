import * as THREE from 'three';
import { BODIES, BODY_BY_ID, SCALES } from './data.js';
import { createGlowTexture, createStarSprite } from './textures.js';

const TAU = Math.PI * 2;
const gauss = () => {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
};

/* ============================================================
   着色器
   ============================================================ */

const EARTH_VERT = /* glsl */`
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
    #include <logdepthbuf_vertex>
  }
`;

const EARTH_FRAG = /* glsl */`
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform vec3 sunDir;
  uniform float nightBoost;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    #include <logdepthbuf_fragment>
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vPosW);
    float ndl = dot(N, sunDir);
    float dayMix = smoothstep(-0.09, 0.22, ndl);

    vec3 day = texture2D(dayMap, vUv).rgb;
    vec3 night = texture2D(nightMap, vUv).rgb;

    float diff = clamp(ndl, 0.0, 1.0);
    vec3 dayLit = day * (0.13 + 0.88 * pow(diff, 0.85));

    // 海面镜面高光：偏蓝且较暗的区域视作海洋
    float ocean = smoothstep(0.015, 0.13, day.b - day.r * 0.86) * smoothstep(0.035, 0.36, day.b);
    vec3 H = normalize(sunDir + V);
    float spec = pow(max(dot(N, H), 0.0), 46.0) * ocean * 0.55;

    // 城市灯光：暖白，夜面可见，近景可增强
    vec2 lightUv = vUv;
    vec3 lights = night * vec3(1.06, 0.9, 0.68) * (1.7 + nightBoost * 2.2);

    float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    float terminator = exp(-pow((ndl + 0.015) / 0.085, 2.0));

    vec3 color = mix(lights, dayLit, dayMix);
    color += vec3(1.0, 0.93, 0.78) * spec * dayMix;
    color += vec3(0.24, 0.46, 0.8) * rim * (0.2 + 0.7 * dayMix) * 0.42;
    color += vec3(0.5, 0.26, 0.1) * terminator * 0.14;

    gl_FragColor = vec4(color, 1.0);
  }
`;

const CLOUD_FRAG = /* glsl */`
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D cloudMap;
  uniform vec3 sunDir;
  uniform float opacity;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    #include <logdepthbuf_fragment>
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vPosW);
    float ndl = dot(N, sunDir);
    vec3 tex = texture2D(cloudMap, vUv).rgb;
    float density = max(max(tex.r, tex.g), tex.b);
    float alpha = smoothstep(0.045, 0.7, density) * opacity;
    if (alpha < 0.004) discard;

    float lit = smoothstep(-0.22, 0.42, ndl);
    vec3 color = vec3(1.0, 0.995, 0.98) * (0.035 + 0.965 * lit);
    // 晨昏线附近的暖色散射
    float term = exp(-pow((ndl + 0.02) / 0.12, 2.0));
    color = mix(color, vec3(1.0, 0.72, 0.48), term * 0.35);
    float rim = pow(1.0 - max(dot(N, V), 0.0), 2.0);
    color += vec3(0.35, 0.5, 0.75) * rim * 0.08;

    gl_FragColor = vec4(color, alpha);
  }
`;

const ATMO_FRAG = /* glsl */`
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform vec3 sunDir;
  uniform vec3 glowColor;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    #include <logdepthbuf_fragment>
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vPosW);
    float fres = pow(1.0 - abs(dot(N, V)), 3.1);
    float lit = smoothstep(-0.42, 0.55, dot(-N, sunDir));
    float forward = pow(max(dot(-V, sunDir), 0.0), 2.0) * 0.35;
    float alpha = fres * (0.13 + 0.82 * lit);
    vec3 color = mix(vec3(0.12, 0.34, 0.72), glowColor, 0.55 + 0.35 * lit);
    color += vec3(1.0, 0.55, 0.3) * forward * fres * 0.55;
    gl_FragColor = vec4(color * alpha, alpha * 0.9);
  }
`;

const SUN_FRAG = /* glsl */`
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D map;
  uniform float time;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    #include <logdepthbuf_fragment>
    vec2 uv = vUv;
    vec3 base = texture2D(map, uv).rgb;
    float detail = texture2D(map, uv * 3.0 + vec2(time * 0.004, 0.0)).r;
    vec3 color = base * vec3(1.1, 0.94, 0.68);
    color *= 0.82 + detail * 0.45;

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vPosW);
    float mu = clamp(dot(N, V), 0.0, 1.0);
    color *= 0.74 + 0.55 * pow(mu, 0.55);
    color += vec3(1.0, 0.4, 0.08) * pow(1.0 - mu, 3.2) * 0.36;

    gl_FragColor = vec4(color, 1.0);
  }
`;

const GALAXY_VERT = /* glsl */`
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aSeed;
  uniform float uPixelScale;
  uniform float uTime;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float d = max(-mv.z, 1.0);
    float twinkle = 0.86 + 0.14 * sin(uTime * 0.7 + aSeed * 6.2831);
    gl_PointSize = clamp(aSize * uPixelScale / d, 0.9, 30.0);
    vColor = aColor * twinkle;
    vAlpha = smoothstep(400.0, 2400.0, d);
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }
`;

const GALAXY_FRAG = /* glsl */`
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    #include <logdepthbuf_fragment>
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c);
    if (r > 0.5) discard;
    float core = smoothstep(0.5, 0.0, r);
    float alpha = pow(core, 2.1) * uOpacity * vAlpha;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

/* ============================================================
   工具
   ============================================================ */

function circleLine(radius, segments, color, opacity, rotation) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * TAU;
    points.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const line = new THREE.Line(geometry, material);
  if (rotation) line.quaternion.copy(rotation);
  return line;
}

function ringGeometry(inner, outer, segments = 220) {
  const geometry = new THREE.RingGeometry(inner, outer, segments, 1);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    const r = Math.hypot(v.x, v.y);
    uv.setXY(i, (r - inner) / (outer - inner), 0.5);
  }
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function buildStarLayer(count, radius, size, brightness, banded = false) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();
  const bandNormal = new THREE.Vector3(0.18, 0.94, 0.3).normalize();
  const tangentA = new THREE.Vector3(1, 0, 0).cross(bandNormal).normalize();
  const tangentB = new THREE.Vector3().crossVectors(bandNormal, tangentA).normalize();
  const dir = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    if (banded) {
      const a = Math.random() * TAU;
      const offset = gauss() * 0.16;
      dir.copy(tangentA).multiplyScalar(Math.cos(a))
        .addScaledVector(tangentB, Math.sin(a))
        .addScaledVector(bandNormal, offset)
        .normalize();
      brightness = 0.28 + Math.random() * 0.42;
    } else {
      dir.set(gauss(), gauss(), gauss()).normalize();
    }
    dir.multiplyScalar(radius);
    positions[i * 3] = dir.x;
    positions[i * 3 + 1] = dir.y;
    positions[i * 3 + 2] = dir.z;

    const warm = Math.random();
    if (warm > 0.86) color.setRGB(1.0, 0.88, 0.72);
    else if (warm > 0.6) color.setRGB(1.0, 0.97, 0.92);
    else color.setRGB(0.78, 0.87, 1.0);
    const b = brightness * (0.45 + Math.random() * 0.7);
    color.multiplyScalar(b);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size,
    map: createStarSprite(64),
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.95,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = -10;
  return points;
}

/* ============================================================
   世界
   ============================================================ */

export function createWorld(scene, textures, { mobile = false, pixelRatio = 1 } = {}) {
  const bodies = {};
  const pickables = [];
  const orbitLines = [];
  const satelliteOrbitLines = [];

  const sunDirection = new THREE.Vector3(0, 0, 1);

  /* ---------- 太阳 ---------- */
  const sunDef = BODY_BY_ID.sun;
  const sunGroup = new THREE.Group();
  sunGroup.name = 'sun';
  const sunMaterial = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: textures.sun },
      time: { value: 0 },
    },
    vertexShader: EARTH_VERT,
    fragmentShader: SUN_FRAG,
  });
  const sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(sunDef.radius, mobile ? 64 : 96, mobile ? 48 : 64),
    sunMaterial
  );
  sunGroup.add(sunMesh);

  const glowTexture = createGlowTexture();
  const softGlowTexture = createGlowTexture('rgba(255,255,255,.95)', 'rgba(255,255,255,.22)');
  const corona = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xffc47a,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
  }));
  corona.scale.setScalar(sunDef.radius * 6.5);
  sunGroup.add(corona);

  const coronaOuter = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xff9a4a,
    transparent: true,
    opacity: 0.11,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  coronaOuter.scale.setScalar(sunDef.radius * 26);
  sunGroup.add(coronaOuter);

  const sunLight = new THREE.PointLight(0xfff3df, 3.1, 0, 0);
  sunGroup.add(sunLight);
  scene.add(sunGroup);

  const ambient = new THREE.AmbientLight(0x5f7f9c, 0.42);
  scene.add(ambient);

  pickables.push(sunMesh);
  sunMesh.userData.bodyId = 'sun';

  bodies.sun = { def: sunDef, group: sunGroup, mesh: sunMesh, radius: sunDef.radius };

  /* ---------- 行星 ---------- */
  for (const def of BODIES) {
    if (def.kind === 'star') continue;
    if (def.parent) continue;

    const group = new THREE.Group();
    group.name = def.id;
    const tilt = new THREE.Group();
    tilt.rotation.z = def.tilt || 0;
    group.add(tilt);

    let mesh;
    if (def.id === 'earth') {
      mesh = buildEarth(group, textures, { mobile });
      tilt.add(mesh.root);
    } else {
      const material = new THREE.MeshStandardMaterial({
        map: textures[def.texture],
        roughness: def.kind === 'planet' ? 0.92 : 0.88,
        metalness: 0.02,
      });
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(def.radius, mobile ? 48 : 72, mobile ? 32 : 48),
        material
      );
      mesh.userData.bodyId = def.id;
      tilt.add(mesh);
      pickables.push(mesh);

      if (def.ring) {
        const ring = new THREE.Mesh(
          ringGeometry(def.radius * def.ring.inner, def.radius * def.ring.outer),
          new THREE.MeshBasicMaterial({
            map: textures[def.ring.texture],
            color: new THREE.Color(0xfff6e6).multiplyScalar(1.28),
            transparent: true,
            opacity: 0.98,
            alphaTest: 0.02,
            side: THREE.DoubleSide,
            depthWrite: false,
          })
        );
        ring.rotation.x = 0;
        tilt.add(ring);
      }
    }

    // 远距离时以一颗柔和的光点代替过小的行星
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: softGlowTexture,
      color: new THREE.Color(def.color),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    glow.scale.setScalar(def.radius * 2);
    group.add(glow);

    group.userData.tilt = tilt;
    scene.add(group);
    bodies[def.id] = { def, group, mesh, tilt, radius: def.radius, glow };

    if (def.orbit > 0) {
      const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(def.inclination, 0, 0));
      const line = circleLine(def.orbit, 320, 0x6fa9b4, 0.16, rotation);
      line.material.opacity = def.kind === 'planet' ? 0.14 : 0.09;
      scene.add(line);
      orbitLines.push(line);
      bodies[def.id].orbitLine = line;
      bodies[def.id].orbitRotation = rotation;
    }
  }

  /* ---------- 地球（大气 / 云层 / 月球 / 卫星 / 空间站） ---------- */
  function buildEarth(parentGroup, tex, { mobile }) {
    const root = new THREE.Group();
    const uniforms = {
      dayMap: { value: tex.earthDay },
      nightMap: { value: tex.earthNight },
      sunDir: { value: sunDirection },
      nightBoost: { value: 0 },
    };
    const earthMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, mobile ? 96 : 144, mobile ? 64 : 96),
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: EARTH_VERT,
        fragmentShader: EARTH_FRAG,
      })
    );
    earthMesh.name = 'earth-surface';
    earthMesh.userData.bodyId = 'earth';
    root.add(earthMesh);
    pickables.push(earthMesh);

    const cloudUniforms = {
      cloudMap: { value: tex.earthClouds },
      sunDir: { value: sunDirection },
      opacity: { value: 0.72 },
    };
    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(1.0065, mobile ? 80 : 112, mobile ? 56 : 80),
      new THREE.ShaderMaterial({
        uniforms: cloudUniforms,
        vertexShader: EARTH_VERT,
        fragmentShader: CLOUD_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.FrontSide,
      })
    );
    clouds.renderOrder = 1;
    root.add(clouds);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.038, mobile ? 64 : 96, mobile ? 48 : 64),
      new THREE.ShaderMaterial({
        uniforms: {
          sunDir: { value: sunDirection },
          glowColor: { value: new THREE.Color(0x79b7e8) },
        },
        vertexShader: EARTH_VERT,
        fragmentShader: ATMO_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.BackSide,
      })
    );
    atmosphere.renderOrder = 2;
    root.add(atmosphere);

    parentGroup.userData.earth = { earthMesh, clouds, atmosphere, uniforms, cloudUniforms };

    // 月球
    const moonDef = BODY_BY_ID.moon;
    const moonPivot = new THREE.Group();
    moonPivot.rotation.x = moonDef.inclination;
    const moonGroup = new THREE.Group();
    moonGroup.position.x = moonDef.orbit;
    const moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(moonDef.radius, mobile ? 48 : 72, mobile ? 32 : 48),
      new THREE.MeshStandardMaterial({ map: tex.moon, roughness: 0.97, metalness: 0 })
    );
    moonMesh.userData.bodyId = 'moon';
    moonGroup.add(moonMesh);
    moonPivot.add(moonGroup);
    root.add(moonPivot);
    pickables.push(moonMesh);
    bodies.moon = { def: moonDef, group: moonGroup, mesh: moonMesh, radius: moonDef.radius, pivot: moonPivot };

    const moonOrbit = circleLine(moonDef.orbit, 220, 0x7fa8b3, 0.2);
    moonPivot.add(moonOrbit);
    orbitLines.push(moonOrbit);

    // 人造卫星
    const satelliteGroup = new THREE.Group();
    const satellites = [];
    const satCount = mobile ? 16 : 24;
    const bodyGeo = new THREE.BoxGeometry(0.0055, 0.0055, 0.0125);
    const panelGeo = new THREE.BoxGeometry(0.022, 0.0009, 0.008);
    const satBody = new THREE.InstancedMesh(
      bodyGeo,
      new THREE.MeshBasicMaterial({ color: 0xd7e8ec }),
      satCount
    );
    const satPanels = new THREE.InstancedMesh(
      panelGeo,
      new THREE.MeshBasicMaterial({ color: 0x4b78a3 }),
      satCount * 2
    );
    satBody.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    satPanels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    satelliteGroup.add(satBody, satPanels);
    root.add(satelliteGroup);

    for (let i = 0; i < satCount; i++) {
      const radius = 1.075 + Math.random() * 0.42;
      const inclination = (Math.random() - 0.5) * 1.8;
      const node = Math.random() * TAU;
      const phase = Math.random() * TAU;
      const speed = (0.35 + Math.random() * 0.55) * (Math.random() > 0.5 ? 1 : -1);
      const quaternion = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(inclination, node, 0, 'YXZ')
      );
      satellites.push({ radius, inclination, node, phase, speed, quaternion });
      const line = circleLine(radius, 96, 0x5c8b99, 0.06, quaternion);
      satelliteGroup.add(line);
      satelliteOrbitLines.push(line);
    }

    // 简化国际空间站
    const issGroup = new THREE.Group();
    const issMetal = new THREE.MeshStandardMaterial({
      color: 0x9fadb3,
      metalness: 0.6,
      roughness: 0.45,
      emissive: 0x1a2833,
      emissiveIntensity: 0.45,
    });
    const issPanel = new THREE.MeshStandardMaterial({
      color: 0x2b5680,
      metalness: 0.55,
      roughness: 0.5,
      emissive: 0x14283a,
      emissiveIntensity: 0.4,
    });
    const truss = new THREE.Mesh(new THREE.BoxGeometry(0.108, 0.0036, 0.0036), issMetal);
    issGroup.add(truss);
    const moduleGeo = new THREE.CylinderGeometry(0.0042, 0.0042, 0.036, 10);
    for (let i = 0; i < 3; i++) {
      const module = new THREE.Mesh(moduleGeo, issMetal);
      module.rotation.z = Math.PI / 2;
      module.position.set(-0.014 + i * 0.018, 0, 0);
      issGroup.add(module);
    }
    const panelGeoBig = new THREE.BoxGeometry(0.034, 0.0007, 0.0125);
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? -1 : 1;
      const index = i % 4;
      const panel = new THREE.Mesh(panelGeoBig, issPanel);
      panel.position.set(side * (0.026 + index * 0.0135), 0, index % 2 === 0 ? 0.013 : -0.013);
      panel.rotation.x = index % 2 === 0 ? 0.06 : -0.06;
      issGroup.add(panel);
    }
    const radiator = new THREE.Mesh(
      new THREE.BoxGeometry(0.006, 0.001, 0.026),
      new THREE.MeshStandardMaterial({ color: 0xd8dfe0, roughness: 0.6, metalness: 0.2 })
    );
    radiator.position.set(0.004, 0.007, 0);
    issGroup.add(radiator);
    issGroup.userData.bodyId = 'station';
    root.add(issGroup);

    const issOrbit = circleLine(1.3, 180, 0x86b4c2, 0.26);
    issOrbit.rotation.x = 0.92;
    issOrbit.rotation.z = 0.2;
    root.add(issOrbit);
    orbitLines.push(issOrbit);

    return {
      root,
      earthMesh,
      clouds,
      atmosphere,
      uniforms,
      cloudUniforms,
      moonGroup,
      moonMesh,
      moonOrbit,
      satellites,
      satBody,
      satPanels,
      satelliteGroup,
      satelliteOrbitLines,
      issGroup,
      issOrbit,
    };
  }

  const earthSystem = bodies.earth;
  const earthRoot = earthSystem.mesh.root;
  earthSystem.satellites = earthSystem.mesh.satellites;
  earthSystem.satBody = earthSystem.mesh.satBody;
  earthSystem.satPanels = earthSystem.mesh.satPanels;
  earthSystem.issGroup = earthSystem.mesh.issGroup;
  earthSystem.issOrbit = earthSystem.mesh.issOrbit;
  earthSystem.moonGroup = earthSystem.mesh.moonGroup;
  earthSystem.moonOrbit = earthSystem.mesh.moonOrbit;
  earthSystem.moonMesh = earthSystem.mesh.moonMesh;
  earthSystem.uniforms = earthSystem.mesh.uniforms;
  earthSystem.clouds = earthSystem.mesh.clouds;
  earthSystem.earthMesh = earthSystem.mesh.earthMesh;

  /* ---------- 银河系 ---------- */
  const galaxyGroup = new THREE.Group();
  galaxyGroup.name = 'galaxy';
  galaxyGroup.position.set(...SCALES.galaxyCenter);
  galaxyGroup.rotation.set(0.16, 0.5, 0.04);

  const pointCount = mobile ? 30000 : 105000;
  const galaxyGeometry = new THREE.BufferGeometry();
  const positions = new Float32Array(pointCount * 3);
  const colors = new Float32Array(pointCount * 3);
  const sizes = new Float32Array(pointCount);
  const seeds = new Float32Array(pointCount);
  const R = SCALES.galaxyRadius;
  const color = new THREE.Color();
  const bulgeFraction = 0.12;

  for (let i = 0; i < pointCount; i++) {
    let x, y, z, size;
    if (i < pointCount * bulgeFraction) {
      const r = Math.abs(gauss()) * 760;
      const theta = Math.random() * TAU;
      const phi = Math.acos(2 * Math.random() - 1);
      x = r * Math.sin(phi) * Math.cos(theta);
      z = r * Math.sin(phi) * Math.sin(theta);
      y = r * Math.cos(phi) * 0.48;
      const warm = 0.72 + Math.random() * 0.28;
      color.setRGB(1.0, 0.74 + 0.14 * warm, 0.42 + 0.24 * warm);
      color.multiplyScalar(0.34 + Math.random() * 0.2);
      size = 26 + Math.random() * 50;
    } else {
      let r = 620 + Math.pow(Math.random(), 0.62) * (R - 620);
      const arm = Math.floor(Math.random() * 4);
      const armAngle = (arm / 4) * TAU;
      let theta = armAngle + 4.55 * Math.log(r / 620);
      theta += gauss() * (0.055 + 0.15 * (r / R));
      if (Math.random() > 0.82) theta += (Math.random() - 0.5) * 0.5;
      if (Math.random() > 0.9) theta = Math.random() * TAU;
      r *= 1 + gauss() * 0.038;
      x = Math.cos(theta) * r;
      z = Math.sin(theta) * r;
      const thickness = 46 + 200 * (1 - r / R);
      y = gauss() * thickness * 0.5 + Math.sin(theta * 2) * 10 * (r / R);
      size = 22 + Math.random() * 52;

      const t = r / R;
      if (Math.random() > 0.965) {
        // 年轻星团与电离氢区
        color.setRGB(1.0, 0.5 + Math.random() * 0.16, 0.56 + Math.random() * 0.16);
        color.multiplyScalar(1.5);
        size *= 1.9;
      } else if (Math.random() > 0.9) {
        color.setRGB(0.58, 0.76, 1.0);
        size *= 1.45;
      } else {
        if (t < 0.34) {
          color.setRGB(1.0, 0.82, 0.56);
        } else if (t < 0.72) {
          color.setRGB(0.86, 0.9, 1.0);
        } else {
          color.setRGB(0.55, 0.7, 1.0);
        }
      }
      color.multiplyScalar(0.26 + Math.random() * 0.24);
    }
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
    sizes[i] = size;
    seeds[i] = Math.random();
  }

  galaxyGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  galaxyGeometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  galaxyGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  galaxyGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

  const galaxyMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: 0 },
      uPixelScale: { value: 1200 },
      uTime: { value: 0 },
    },
    vertexShader: GALAXY_VERT,
    fragmentShader: GALAXY_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const galaxyPoints = new THREE.Points(galaxyGeometry, galaxyMaterial);
  galaxyPoints.frustumCulled = false;
  galaxyPoints.renderOrder = 1;
  galaxyGroup.add(galaxyPoints);

  // 暗尘带：普通混合的深色柔点，压在旋臂内侧形成层次
  const dustCount = mobile ? 6000 : 16000;
  const dustGeometry = new THREE.BufferGeometry();
  const dustPositions = new Float32Array(dustCount * 3);
  const dustColors = new Float32Array(dustCount * 3);
  const dustSizes = new Float32Array(dustCount);
  const dustSeeds = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    let r = 760 + Math.pow(Math.random(), 0.5) * (R - 760);
    const arm = Math.floor(Math.random() * 4);
    let theta = (arm / 4) * TAU + 4.55 * Math.log(r / 620) - 0.12;
    theta += gauss() * 0.035;
    r *= 1 + gauss() * 0.03;
    dustPositions[i * 3] = Math.cos(theta) * r;
    dustPositions[i * 3 + 1] = gauss() * 26;
    dustPositions[i * 3 + 2] = Math.sin(theta) * r;
    const shade = 0.6 + Math.random() * 0.5;
    dustColors[i * 3] = 0.026 * shade;
    dustColors[i * 3 + 1] = 0.03 * shade;
    dustColors[i * 3 + 2] = 0.045 * shade;
    dustSizes[i] = 110 + Math.random() * 240;
    dustSeeds[i] = Math.random();
  }
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  dustGeometry.setAttribute('aColor', new THREE.BufferAttribute(dustColors, 3));
  dustGeometry.setAttribute('aSize', new THREE.BufferAttribute(dustSizes, 1));
  dustGeometry.setAttribute('aSeed', new THREE.BufferAttribute(dustSeeds, 1));

  const dustMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: 0 },
      uPixelScale: { value: 1200 },
      uTime: { value: 0 },
    },
    vertexShader: GALAXY_VERT,
    fragmentShader: GALAXY_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const dustPoints = new THREE.Points(dustGeometry, dustMaterial);
  dustPoints.frustumCulled = false;
  dustPoints.renderOrder = 2;
  galaxyGroup.add(dustPoints);

  // 银河核心的光晕
  const coreSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xffd6a0,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  coreSprite.scale.setScalar(3600);
  galaxyGroup.add(coreSprite);

  const coreInner = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xfff2d0,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  coreInner.scale.setScalar(1150);
  galaxyGroup.add(coreInner);

  // 太阳在银河中的位置标记
  const sunMarker = new THREE.Group();
  const markerLocal = new THREE.Vector3(0, 0, 0)
    .sub(new THREE.Vector3(...SCALES.galaxyCenter))
    .applyQuaternion(galaxyGroup.quaternion.clone().invert());
  sunMarker.position.copy(markerLocal);
  const markerSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0x9ff5e6,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  }));
  markerSprite.scale.setScalar(520);
  sunMarker.add(markerSprite);
  const markerRing = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1.0, 64),
    new THREE.MeshBasicMaterial({
      color: 0x93ecdc,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    })
  );
  markerRing.scale.setScalar(760);
  markerRing.userData.billboard = true;
  sunMarker.add(markerRing);
  galaxyGroup.add(sunMarker);

  scene.add(galaxyGroup);

  /* ---------- 背景星空 ---------- */
  const starLayers = [
    buildStarLayer(mobile ? 3200 : 9800, 52000, Math.max(1, pixelRatio * 0.85), 0.9),
    buildStarLayer(mobile ? 1100 : 3200, 52000, Math.max(1.2, pixelRatio * 1.3), 1.0),
    buildStarLayer(mobile ? 240 : 620, 52000, Math.max(1.8, pixelRatio * 2.2), 1.0, true),
  ];
  for (const layer of starLayers) scene.add(layer);
  const starGroup = new THREE.Group();
  starLayers.forEach(layer => starGroup.add(layer));
  scene.add(starGroup);

  /* ---------- 更新 ---------- */
  const earthWorld = new THREE.Vector3();
  const dummy = new THREE.Object3D();
  const panelDummy = new THREE.Object3D();
  const orbitPoint = new THREE.Vector3();

  function update(dt, state) {
    const time = state.time;
    const speed = state.speed;
    const camera = state.camera;

    sunMaterial.uniforms.time.value = state.time * 0.35;
    const distanceToSun = camera.position.length();
    const coronaFade = THREE.MathUtils.smoothstep(distanceToSun, sunDef.radius * 9, sunDef.radius * 24);
    corona.material.opacity = 0.72 * coronaFade;
    coronaOuter.material.opacity = 0.12 * coronaFade;

    // 行星位置
    for (const def of BODIES) {
      const body = bodies[def.id];
      if (!body || def.kind === 'star' || def.parent) continue;
      const angle = def.phase + (time / def.period) * TAU;
      const x = Math.cos(angle) * def.orbit;
      const z = Math.sin(angle) * def.orbit;
      const rotation = body.orbitRotation;
      if (rotation) {
        const p = new THREE.Vector3(x, 0, z).applyQuaternion(rotation);
        body.group.position.copy(p);
      } else {
        body.group.position.set(x, 0, z);
      }
      if (def.id !== 'earth') {
        body.mesh.rotation.y = time * def.spin;
      }
    }

    // 地球（直接使用行星组的世界坐标，避免父级矩阵尚未刷新）
    earthRoot.getWorldPosition(earthWorld);
    bodies.earth.group.getWorldPosition(earthWorld);
    sunDirection.copy(earthWorld).multiplyScalar(-1).normalize();
    const earthSpin = time * 0.26;
    earthSystem.earthMesh.rotation.y = earthSpin;
    earthSystem.clouds.rotation.y = earthSpin * 1.045 + 0.6;
    earthSystem.uniforms.nightBoost.value = state.nightBoost || 0;

    // 月球
    const moonAngle = 1.1 + (time / 18) * TAU;
    earthSystem.moonGroup.position.set(
      Math.cos(moonAngle) * 9,
      0,
      Math.sin(moonAngle) * 9
    );
    earthSystem.moonMesh.rotation.y = -moonAngle + Math.PI / 2;

    // 卫星
    const distToEarth = camera.position.distanceTo(earthWorld);
    const nearEarth = distToEarth < 24;
    earthSystem.satBody.visible = nearEarth && state.satellitesVisible;
    earthSystem.satPanels.visible = nearEarth && state.satellitesVisible;
    if (nearEarth) {
      earthSystem.satellites.forEach((sat, i) => {
        const angle = sat.phase + time * sat.speed;
        orbitPoint.set(Math.cos(angle) * sat.radius, 0, Math.sin(angle) * sat.radius)
          .applyQuaternion(sat.quaternion);
        dummy.position.copy(orbitPoint);
        dummy.quaternion.copy(sat.quaternion);
        dummy.rotateY(angle * 1.4);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        earthSystem.satBody.setMatrixAt(i, dummy.matrix);

        for (let p = 0; p < 2; p++) {
          panelDummy.position.copy(orbitPoint);
          panelDummy.quaternion.copy(dummy.quaternion);
          panelDummy.scale.setScalar(1);
          panelDummy.updateMatrix();
          panelDummy.translateX(p === 0 ? -0.012 : 0.012);
          panelDummy.updateMatrix();
          earthSystem.satPanels.setMatrixAt(i * 2 + p, panelDummy.matrix);
        }
      });
      earthSystem.satBody.instanceMatrix.needsUpdate = true;
      earthSystem.satPanels.instanceMatrix.needsUpdate = true;
    }

    // 国际空间站
    const issAngle = 0.8 + (time / 26) * TAU;
    earthSystem.issGroup.position.set(
      Math.cos(issAngle) * 1.3,
      Math.sin(issAngle) * 0.6,
      Math.sin(issAngle) * 1.12
    );
    earthSystem.issGroup.rotation.y = issAngle * 2.4;
    earthSystem.issGroup.rotation.z = 0.3;
    earthSystem.issGroup.visible = state.satellitesVisible && distToEarth < 60;

    // 银河：随镜头拉远渐显
    const cameraDistance = camera.position.length();
    const galaxyOpacity = THREE.MathUtils.smoothstep(cameraDistance, 9000, 19000);
    galaxyMaterial.uniforms.uOpacity.value = galaxyOpacity;
    galaxyMaterial.uniforms.uTime.value = performance.now() / 1000;
    galaxyMaterial.uniforms.uPixelScale.value =
      (state.viewportHeight * pixelRatio) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    dustMaterial.uniforms.uOpacity.value = galaxyOpacity * 0.6;
    dustMaterial.uniforms.uPixelScale.value = galaxyMaterial.uniforms.uPixelScale.value;
    dustMaterial.uniforms.uTime.value = galaxyMaterial.uniforms.uTime.value;
    coreSprite.material.opacity = 0.24 * galaxyOpacity;
    coreInner.material.opacity = 0.42 * galaxyOpacity;
    sunMarker.visible = galaxyOpacity > 0.05;
    markerSprite.material.opacity = 0.9 * galaxyOpacity;
    markerRing.material.opacity = 0.55 * galaxyOpacity;
    markerRing.lookAt(camera.position);

    // 星场跟随镜头，制造无穷远
    starGroup.position.copy(camera.position);
    starLayers.forEach(layer => { layer.material.opacity = state.starOpacity ?? 0.95; });

    // 行星光点：近看时隐去，远看时作为星点出现
    for (const def of BODIES) {
      const body = bodies[def.id];
      if (!body || !body.glow) continue;
      const distance = camera.position.distanceTo(body.group.position);
      const apparent = body.radius / Math.max(distance, 0.001);
      const far = THREE.MathUtils.smoothstep(apparent, 0.00001, 0.00012);
      const near = THREE.MathUtils.smoothstep(distance, 90, 900);
      body.glow.material.opacity = far * near * 0.85;
      body.glow.scale.setScalar(Math.max(body.radius * 1.8, distance * 0.019));
      body.glow.visible = body.glow.material.opacity > 0.01;
    }

    // 轨道 / 卫星轨道可见性
    const showOrbits = state.orbits;
    for (const def of BODIES) {
      const body = bodies[def.id];
      if (!body?.orbitLine) continue;
      body.orbitLine.visible = showOrbits && cameraDistance > 2200 && distToEarth > 8;
    }
    const focusDistance = state.focusDistance ?? distToEarth;
    earthSystem.moonOrbit.visible = showOrbits && focusDistance > 6.5;
    earthSystem.issOrbit.visible = showOrbits && focusDistance > 5.2;
    satelliteOrbitLines.forEach(line => {
      line.visible = showOrbits && distToEarth < 4.1 && distToEarth > 2.2;
    });
    sunGroup.visible = true;
    state.onSunProximity?.(distanceToSun / sunDef.radius);
  }

  function getBody(id) {
    return bodies[id] || null;
  }

  return {
    bodies,
    earth: earthSystem,
    galaxy: {
      group: galaxyGroup,
      points: galaxyPoints,
      dust: dustPoints,
      material: galaxyMaterial,
      sunMarker,
      markerSprite,
    },
    stars: starGroup,
    sunGroup,
    sunMarker,
    satelliteGroup: earthSystem.mesh.satelliteGroup,
    iss: earthSystem.issGroup,
    pickables,
    orbitLines,
    update,
    getBody,
    sunDirection,
  };
}
