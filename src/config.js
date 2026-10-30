/**
 * ORBIT · 运行配置
 * 修改这里即可更换线上体验地址与 GitHub 源码地址，无需改动其他文件。
 * 也可以在 index.html 中通过 window.ORBIT_CONFIG 覆盖。
 */
export const CONFIG = Object.assign({
  siteUrl: 'https://jylai0726.github.io/earth-web/',
  repoUrl: 'https://github.com/jylai0726/earth-web',
  projectName: 'ORBIT',
  // 渲染：桌面端像素比上限、移动端像素比上限
  maxPixelRatio: 1.75,
  mobilePixelRatio: 1.35,
  // 泛光强度
  bloomStrength: 0.62,
  bloomRadius: 0.45,
  bloomThreshold: 0.82,
}, (typeof window !== 'undefined' && window.ORBIT_CONFIG) || {});
