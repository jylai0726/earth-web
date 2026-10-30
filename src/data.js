/**
 * 天体目录
 * 尺寸、轨道半径与运行周期均为可视化演示值，不是精确天文数据。
 * 单位：1 = 地球半径（用于三维场景的视觉比例）。
 */

export const BODIES = [
  {
    id: 'sun',
    kind: 'star',
    cn: '太阳',
    en: 'SUN',
    category: '恒星 / G2V 主序星',
    index: '00',
    radius: 14,
    texture: 'sun',
    color: '#ffb45e',
    orbit: 0,
    period: 0,
    phase: 0,
    inclination: 0,
    spin: 0.02,
    tilt: 0.12,
    description:
      '太阳是这颗蓝色星球唯一的恒星。它把氢聚变成氦，已经持续燃烧了四十六亿年。地球接收到的光，八分二十秒前才刚刚离开它的表面。',
    stats: [
      ['直径', '1,392,700', 'km'],
      ['表面温度', '5,772', 'K'],
    ],
    meta: [
      ['质量占比', '太阳系的 99.86%'],
      ['自转周期', '25.4 天（赤道）'],
      ['光谱型', 'G2V'],
    ],
  },
  {
    id: 'mercury',
    kind: 'planet',
    cn: '水星',
    en: 'MERCURY',
    category: '太阳系 / 类地行星',
    index: '01',
    radius: 0.55,
    texture: 'mercury',
    color: '#a9a29b',
    orbit: 330,
    period: 26,
    phase: 0.7,
    inclination: 0.12,
    spin: 0.03,
    tilt: 0.001,
    description:
      '离太阳最近的行星，也是太阳系里最小的一颗。没有真正的大气，白天被烤到 430 ℃，夜晚又降到 −180 ℃，昼夜之间几乎没有缓冲。',
    stats: [
      ['直径', '4,879', 'km'],
      ['公转周期', '88', '天'],
    ],
    meta: [
      ['平均日距', '0.39 AU'],
      ['自转周期', '58.6 天'],
      ['已知卫星', '0'],
    ],
  },
  {
    id: 'venus',
    kind: 'planet',
    cn: '金星',
    en: 'VENUS',
    category: '太阳系 / 类地行星',
    index: '02',
    radius: 1.15,
    texture: 'venus',
    color: '#e6cf9a',
    orbit: 470,
    period: 48,
    phase: 2.4,
    inclination: 0.06,
    spin: -0.012,
    tilt: 3.09,
    description:
      '被厚达数十公里的硫酸云包裹，温室效应把地表维持在 465 ℃。它自转得比公转还慢，在金星上，一天比一年更长。',
    stats: [
      ['直径', '12,104', 'km'],
      ['公转周期', '224.7', '天'],
    ],
    meta: [
      ['平均日距', '0.72 AU'],
      ['自转周期', '243 天（逆行）'],
      ['已知卫星', '0'],
    ],
  },
  {
    id: 'earth',
    kind: 'planet',
    cn: '地球',
    en: 'EARTH',
    category: '太阳系 / 类地行星',
    index: '03',
    radius: 1,
    texture: 'earth',
    color: '#7fb3d5',
    orbit: 620,
    period: 72,
    phase: 0,
    inclination: 0,
    spin: 0.26,
    tilt: 0.409,
    description:
      '越过蔚蓝的大气层，看见云海之下的万家灯火。液态水、板块运动与一颗刚刚好的恒星，让这里成为目前已知唯一有生命的世界。',
    stats: [
      ['直径', '12,742', 'km'],
      ['公转周期', '365.25', '天'],
    ],
    meta: [
      ['平均日距', '1 AU · 1.496 亿 km'],
      ['自转周期', '23 小时 56 分'],
      ['已知卫星', '1'],
    ],
  },
  {
    id: 'moon',
    kind: 'moon',
    cn: '月球',
    en: 'MOON',
    category: '地球 / 天然卫星',
    index: '03·I',
    radius: 0.27,
    texture: 'moon',
    color: '#c8c5bd',
    orbit: 9,
    period: 18,
    phase: 1.1,
    inclination: 0.09,
    spin: 0.26,
    tilt: 0.03,
    parent: 'earth',
    description:
      '潮汐锁定的伴侣，永远以同一面朝向地球。它稳住了地轴的倾角，也替地球挡下过许多来不及预警的撞击。',
    stats: [
      ['直径', '3,475', 'km'],
      ['公转周期', '27.32', '天'],
    ],
    meta: [
      ['距地球', '384,400 km'],
      ['自转周期', '27.32 天（同步）'],
      ['表面重力', '0.165 g'],
    ],
  },
  {
    id: 'mars',
    kind: 'planet',
    cn: '火星',
    en: 'MARS',
    category: '太阳系 / 类地行星',
    index: '04',
    radius: 0.72,
    texture: 'mars',
    color: '#c1683f',
    orbit: 790,
    period: 110,
    phase: 4.1,
    inclination: 0.03,
    spin: 0.25,
    tilt: 0.44,
    description:
      '铁锈色的荒漠覆盖整颗行星。这里有太阳系最高的火山与最长的峡谷，稀薄的大气仍会在午后卷起全球性的沙尘暴。',
    stats: [
      ['直径', '6,779', 'km'],
      ['公转周期', '687', '天'],
    ],
    meta: [
      ['平均日距', '1.52 AU'],
      ['自转周期', '24 小时 37 分'],
      ['已知卫星', '2'],
    ],
  },
  {
    id: 'jupiter',
    kind: 'planet',
    cn: '木星',
    en: 'JUPITER',
    category: '太阳系 / 气态巨行星',
    index: '05',
    radius: 3.1,
    texture: 'jupiter',
    color: '#d9b48b',
    orbit: 1180,
    period: 260,
    phase: 5.6,
    inclination: 0.02,
    spin: 0.42,
    tilt: 0.05,
    description:
      '太阳系质量最大的行星，本身就是一个失败的恒星。大红斑是一场比地球还大的风暴，已经旋转了至少两个世纪。',
    stats: [
      ['直径', '139,820', 'km'],
      ['公转周期', '11.86', '年'],
    ],
    meta: [
      ['平均日距', '5.20 AU'],
      ['自转周期', '9 小时 56 分'],
      ['已知卫星', '95'],
    ],
  },
  {
    id: 'saturn',
    kind: 'planet',
    cn: '土星',
    en: 'SATURN',
    category: '太阳系 / 气态巨行星',
    index: '06',
    radius: 2.7,
    texture: 'saturn',
    color: '#e0c58f',
    orbit: 1500,
    period: 420,
    phase: 1.9,
    inclination: 0.05,
    spin: 0.38,
    tilt: 0.466,
    description:
      '环由数以亿计的冰粒与岩石组成，厚度平均不足百米，却横跨二十八万公里。它们也许是一颗被撕碎的卫星留下的遗骸。',
    stats: [
      ['直径', '116,460', 'km'],
      ['公转周期', '29.45', '年'],
    ],
    meta: [
      ['平均日距', '9.58 AU'],
      ['自转周期', '10 小时 42 分'],
      ['已知卫星', '146'],
    ],
    ring: { inner: 1.35, outer: 2.35, texture: 'saturnRings' },
  },
  {
    id: 'uranus',
    kind: 'planet',
    cn: '天王星',
    en: 'URANUS',
    category: '太阳系 / 冰巨行星',
    index: '07',
    radius: 1.75,
    texture: 'uranus',
    color: '#a7dbe0',
    orbit: 1820,
    period: 700,
    phase: 3.3,
    inclination: 0.02,
    spin: -0.18,
    tilt: 1.706,
    description:
      '整颗行星几乎躺着公转，自转轴倾斜 98°。甲烷吸收红光，使它呈现出安静的青蓝色，也让它成为太阳系里最冷的世界之一。',
    stats: [
      ['直径', '50,724', 'km'],
      ['公转周期', '84', '年'],
    ],
    meta: [
      ['平均日距', '19.2 AU'],
      ['自转周期', '17 小时 14 分（逆行）'],
      ['已知卫星', '28'],
    ],
  },
  {
    id: 'neptune',
    kind: 'planet',
    cn: '海王星',
    en: 'NEPTUNE',
    category: '太阳系 / 冰巨行星',
    index: '08',
    radius: 1.7,
    texture: 'neptune',
    color: '#5b7fd4',
    orbit: 2080,
    period: 1000,
    phase: 5.2,
    inclination: 0.03,
    spin: 0.2,
    tilt: 0.494,
    description:
      '先被算出来、后被看见的行星。它的风速可以超过 2,000 km/h，是太阳系里最猛烈的大气，而阳光到这里已经微弱得像黄昏。',
    stats: [
      ['直径', '49,244', 'km'],
      ['公转周期', '164.8', '年'],
    ],
    meta: [
      ['平均日距', '30.1 AU'],
      ['自转周期', '16 小时 6 分'],
      ['已知卫星', '16'],
    ],
  },
];

export const PLANETS = BODIES.filter(body => body.kind === 'planet');
export const DESTINATIONS = [
  ...BODIES.filter(body => body.kind === 'star'),
  ...PLANETS,
  ...BODIES.filter(body => body.kind === 'moon'),
];

export const BODY_BY_ID = Object.fromEntries(BODIES.map(body => [body.id, body]));

/** 场景尺度：太阳系、银河 */
export const SCALES = {
  solarRadius: 2080,
  galaxyRadius: 9000,
  galaxyCenter: [-4300, 0, -4300],
  // 太阳在银河系中的位置（可视作猎户臂内侧）
  solarGalacticRadius: 6080,
};

export const SCALE_VIEWS = {
  earth: { label: '地球近轨', caption: '近地轨道', distance: 3.55, pitch: 0.12 },
  solar: { label: '太阳系', caption: '太阳系全景', distance: 6400, pitch: 0.62 },
  galaxy: { label: '银河系', caption: '银河系 · 猎户臂', distance: 30500, pitch: 0.92 },
};

/** 演示时间：1× 时，地球公转一周约 72 秒 */
export const SPEEDS = [0.25, 1, 5, 20];

/** 银河系资料（作为银河尺度的信息面板内容） */
export const GALAXY_INFO = {
  id: 'galaxy',
  kind: 'galaxy',
  cn: '银河系',
  en: 'MILKY WAY',
  category: '星系 / 棒旋星系',
  index: '—',
  description:
    '一亿颗恒星组成的光带横过夜空，我们就在其中一条不起眼的旋臂上。银河系的中心藏着一颗四百万倍太阳质量的黑洞，而太阳要花两亿三千万年才能绕它一圈。',
  stats: [
    ['直径', '100,000', '光年'],
    ['恒星数量', '1,000–4,000', '亿'],
  ],
  meta: [
    ['太阳位置', '猎户臂内侧'],
    ['距银心', '约 26,000 光年'],
    ['公转周期', '约 2.3 亿年'],
  ],
};

/** 国际空间站资料 */
export const STATION_INFO = {
  id: 'station',
  kind: 'station',
  cn: '国际空间站',
  en: 'ISS',
  category: '近地轨道 / 载人空间站',
  index: 'LEO',
  description:
    '以每秒 7.66 公里的速度掠过地表，每 92 分钟绕地球一圈。自 2000 年起，这里持续有人类驻留，是我们在近地轨道上最长久的一次停留。',
  stats: [
    ['轨道高度', '408', 'km'],
    ['运行周期', '92.7', '分钟'],
  ],
  meta: [
    ['质量', '约 419,700 kg'],
    ['翼展', '109 m'],
    ['常驻人数', '7 人'],
  ],
};
