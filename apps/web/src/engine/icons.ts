// SVG 图标集：统一 stroke 风格（16×16 viewBox），替代 emoji 占位
// 用法：iconSvg('money') / el('span', 'icon', 'money')
export type IconName =
  | 'location' | 'money' | 'photo' | 'quest' | 'visit' | 'build' | 'teleport'
  | 'camera' | 'metro' | 'bus' | 'map' | 'exit' | 'lock' | 'clock' | 'check'
  | 'building' | 'tree' | 'train' | 'lamp' | 'box' | 'keys' | 'info' | 'gamepad';

const P: Record<IconName, string> = {
  // 定位：圆点+光标形
  location: '<path d="M8 1.5c-2.8 0-5 2.2-5 5 0 3.6 5 8 5 8s5-4.4 5-8c0-2.8-2.2-5-5-5z"/><circle cx="8" cy="6.5" r="1.8"/>',
  // 金钱：圆+¥
  money: '<circle cx="8" cy="8" r="6.2"/><path d="M5.8 5.2L8 8l2.2-2.8M8 8v3.4M6.2 9.2h3.6M6.2 10.8h3.6"/>',
  // 相机
  photo: '<rect x="1.8" y="4.2" width="12.4" height="9" rx="1.5"/><path d="M5.5 4.2l1-1.8h3l1 1.8"/><circle cx="8" cy="8.6" r="2.4"/>',
  // 任务：清单
  quest: '<rect x="2.5" y="1.8" width="11" height="12.4" rx="1.5"/><path d="M5 5h6M5 8h6M5 11h4"/>',
  // 到访：旗帜
  visit: '<path d="M4 1.8v12.4M4 2.5h8l-1.8 2.8L12 8.1H4"/>',
  // 建造：扳手/砖
  build: '<path d="M2.5 13.5v-3l6.8-6.8a2.2 2.2 0 013 3l-6.8 6.8h-3z"/><path d="M9.5 4.5l2 2"/>',
  // 传送：闪电
  teleport: '<path d="M9 1.5L3.5 9.2h4L7 14.5l5.5-7.7h-4L9 1.5z"/>',
  // 相机模式取景
  camera: '<path d="M1.5 5.5h3l1-1.8h5l1 1.8h3v7h-13v-7z" fill="none"/><circle cx="8" cy="8.8" r="2.2"/>',
  // 地铁
  metro: '<rect x="2.5" y="2" width="11" height="9" rx="2"/><path d="M4.5 12.5l-1 2M11.5 12.5l1 2"/><circle cx="5.5" cy="7" r=".8" fill="currentColor" stroke="none"/><circle cx="10.5" cy="7" r=".8" fill="currentColor" stroke="none"/>',
  // 巴士
  bus: '<rect x="2" y="3" width="12" height="8" rx="1.5"/><path d="M2 8.5h12M4.5 13.5v-1M11.5 13.5v-1"/>',
  // 地图
  map: '<path d="M1.8 4l4-1.5L10.2 4l4-1.5v9.5l-4 1.5-4.4-1.5-4 1.5V4z"/><path d="M5.8 2.5v9.5M10.2 4v9.5"/>',
  // 退出
  exit: '<path d="M6.5 2.5h-4v11h4M9 5l3 3-3 3M12 8H5.5"/>',
  // 锁定
  lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/>',
  // 冷却时钟
  clock: '<circle cx="8" cy="8" r="6.2"/><path d="M8 4.5V8l2.5 1.5"/>',
  // 完成
  check: '<path d="M2.5 8.5l3.5 3.5 7-8"/>',
  // 建筑（砖）
  building: '<rect x="2.5" y="5.5" width="11" height="8"/><path d="M5.5 5.5V3.5h5v2M4.5 8h7M4.5 10.5h7"/>',
  // 自然（树）
  tree: '<path d="M8 1.8l3.5 5h-2l2.5 3.5h-8L6.5 6.8h-2L8 1.8z"/><path d="M8 10.5v3.5"/>',
  // 交通（列车）
  train: '<rect x="4" y="2" width="8" height="9" rx="2"/><path d="M6 13.5l-1 1M10 13.5l1 1M4.5 8h7"/>',
  // 装饰（灯泡）
  lamp: '<path d="M8 1.8a4.2 4.2 0 012.8 7.3v1.6H5.2V9.1A4.2 4.2 0 018 1.8z"/><path d="M6 12.8h4"/>',
  // 通用方块
  box: '<path d="M8 1.8l6 3v6.4l-6 3-6-3V4.8l6-3z"/><path d="M2 4.8l6 3 6-3M8 7.8v6.4"/>',
  // 键位
  keys: '<rect x="1.5" y="4.5" width="13" height="7" rx="1.5"/><path d="M4.5 8h.01M7 8h.01M9.5 8h.01M12 8h.01"/>',
  // 信息
  info: '<circle cx="8" cy="8" r="6.2"/><path d="M8 7.2v4M8 4.8v.01"/>',
  // 手柄（进入世界）
  gamepad: '<path d="M5 5h6a4.5 4.5 0 014.4 5.4c-.3 1.4-1.7 2.2-3 1.5L10.2 10H5.8L3.6 11.9c-1.3.7-2.7-.1-3-1.5A4.5 4.5 0 015 5z"/><path d="M5.5 7v2M4.5 8h2M10.5 7.5v.01M12 8.5v.01"/>',
};

/** 生成内联 SVG 字符串 */
export function iconSvg(name: IconName, size = 16): string {
  return `<svg viewBox="0 0 16 16" width="${size}" height="${size}" fill="none"
    stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"
    xmlns="http://www.w3.org/2000/svg">${P[name] ?? P.info}</svg>`;
}

/** 创建带图标的 span.icon 元素 */
export function iconEl(name: IconName, size = 16): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = 'icon';
  s.innerHTML = iconSvg(name, size);
  return s;
}

/** 建造元素分类 → 图标 */
export function categoryIcon(c: string): IconName {
  return ({ building: 'building', nature: 'tree', transport: 'train', decoration: 'lamp' } as Record<string, IconName>)[c] ?? 'box';
}
