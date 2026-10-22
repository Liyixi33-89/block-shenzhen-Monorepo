// 遮挡检测：相机 → 目标点射线是否被实体建筑挡住（拍照入镜判定用）。
// 【engine 横切层】纯函数模块，不依赖 GameEngine 实例；从 engine.ts 抽出便于独立复用/测试。
import * as THREE from 'three';

/**
 * 判断 from → to 之间是否被世界静态建筑遮挡。
 * 只检测世界静态建筑（world 组），排除透明装饰（光圈/光柱/名牌）。
 * 每次调用现收集 mesh 列表：流式加载会挂载/卸载区块，缓存会失效（快门频率低，可接受）。
 */
export function isOccluded(world: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3): boolean {
  const list: THREE.Mesh[] = [];
  world.traverse(o => {
    const m = o as THREE.Mesh;
    if (!(m as any).isMesh || (m as any).isSprite) return;
    const mat = m.material as THREE.Material & { transparent?: boolean };
    if (mat?.transparent) return;   // 光圈/光柱等透明装饰不算遮挡
    list.push(m);
  });
  const dir = new THREE.Vector3().subVectors(to, from);
  const dist = dir.length();
  if (dist < 1) return false;
  dir.divideScalar(dist);
  const ray = new THREE.Raycaster(from, dir);
  ray.far = dist - 4;   // 留出目标点自身厚度余量
  return ray.intersectObjects(list, false).length > 0;
}