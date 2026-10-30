import * as THREE from 'three';

/** 需要使用的纹理清单与压缩尺寸（宽度） */
const TEXTURE_RULES = {
  sun:            { desktop: 2048, mobile: 1024 },
  mercury:        { desktop: 1024, mobile: 512 },
  venus:          { desktop: 1024, mobile: 512 },
  earthDay:       { desktop: 2048, mobile: 2048 },
  earthNight:     { desktop: 2048, mobile: 2048 },
  earthClouds:    { desktop: 1024, mobile: 1024 },
  moon:           { desktop: 2048, mobile: 1024 },
  mars:           { desktop: 1024, mobile: 512 },
  jupiter:        { desktop: 2048, mobile: 1024 },
  saturn:         { desktop: 2048, mobile: 1024 },
  saturnRings:    { desktop: 2048, mobile: 1024 },
  uranus:         { desktop: 1024, mobile: 512 },
  neptune:        { desktop: 1024, mobile: 512 },
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('纹理加载失败'));
    img.src = src;
  });
}

function resizedSource(img, maxWidth) {
  if (img.width <= maxWidth) return img;
  const canvas = document.createElement('canvas');
  const width = maxWidth;
  const height = Math.round((img.height / img.width) * width);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

function makeTexture(source, { srgb = true, anisotropy = 1, repeat = true } = {}) {
  const texture = new THREE.Texture(source);
  texture.needsUpdate = true;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
  }
  return texture;
}

/**
 * 载入内置纹理。资源来自 window.ORBIT_ASSETS（构建时内嵌的 data URL）。
 * @returns {{ textures: Record<string, THREE.Texture>, images: Record<string, HTMLImageElement> }}
 */
export async function loadAssets({ mobile = false, anisotropy = 8, onProgress = () => {} } = {}) {
  const assets = window.ORBIT_ASSETS || {};
  const keys = Object.keys(assets);
  if (!keys.length) throw new Error('未找到内嵌纹理资源');

  const images = {};
  let completed = 0;
  await Promise.all(keys.map(async key => {
    images[key] = await loadImage(assets[key]);
    completed += 1;
    onProgress(completed / keys.length);
  }));

  const textures = {};
  for (const key of keys) {
    const rule = TEXTURE_RULES[key] || { desktop: 1024, mobile: 512 };
    const maxWidth = mobile ? rule.mobile : rule.desktop;
    const source = key === 'saturnRings'
      ? resizedSource(images[key], maxWidth)   // 环纹理是横向条带，不能按 2:1 处理
      : resizedSource(images[key], maxWidth);
    textures[key] = makeTexture(source, {
      anisotropy,
      repeat: key !== 'saturnRings',
    });
  }

  return { textures, images };
}

/** 从等距柱状纹理裁剪一颗球形缩略图（用于底部目的地栏） */
export function createThumbnail(img, { sun = false } = {}) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const crop = Math.round(img.width * 0.235);
  const sx = Math.round((img.width - crop) / 2);
  const sy = Math.round(img.height * 0.5 - crop * 0.52);

  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(img, sx, sy, crop, crop, 0, 0, size, size);

  const shade = ctx.createRadialGradient(
    size * 0.34, size * 0.3, size * 0.06,
    size * 0.5, size * 0.52, size * 0.67
  );
  if (sun) {
    shade.addColorStop(0, 'rgba(255,246,214,.34)');
    shade.addColorStop(0.45, 'rgba(255,196,110,.06)');
    shade.addColorStop(1, 'rgba(6,10,14,.55)');
  } else {
    shade.addColorStop(0, 'rgba(255,255,255,.10)');
    shade.addColorStop(0.42, 'rgba(2,6,10,.02)');
    shade.addColorStop(0.78, 'rgba(2,6,10,.36)');
    shade.addColorStop(1, 'rgba(2,6,10,.86)');
  }
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();

  return canvas.toDataURL('image/jpeg', 0.85);
}

/** 径向渐变纹理：用于太阳光晕 */
export function createGlowTexture(inner = 'rgba(255,214,152,.95)', mid = 'rgba(255,140,60,.28)', size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.24, mid);
  g.addColorStop(0.55, 'rgba(255,120,50,.06)');
  g.addColorStop(1, 'rgba(255,90,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 圆形星点贴图 */
export function createStarSprite(size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.28, 'rgba(255,255,255,.86)');
  g.addColorStop(0.62, 'rgba(210,232,255,.18)');
  g.addColorStop(1, 'rgba(180,210,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
