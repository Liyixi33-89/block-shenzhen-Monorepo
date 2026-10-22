// 共享 GPU 资源登记表：模块级缓存的几何体/材质跨世界复用，
// 世界销毁时必须跳过，否则重入游戏会用到已 dispose 的资源（黑块/报错）。
import * as THREE from 'three';

const sharedGeo = new WeakSet<THREE.BufferGeometry>();
const sharedMat = new WeakSet<THREE.Material>();
const sharedTex = new WeakSet<THREE.Texture>();

/** 登记共享几何体（模块级缓存，永不随世界释放） */
export function markSharedGeo(g: THREE.BufferGeometry): THREE.BufferGeometry {
  sharedGeo.add(g);
  return g;
}

/** 登记共享材质（模块级缓存，永不随世界释放） */
export function markSharedMat<T extends THREE.Material>(m: T): T {
  sharedMat.add(m);
  return m;
}

/** 登记共享贴图（贴图缓存被多个材质共用，不能随单个材质释放） */
export function markSharedTex<T extends THREE.Texture>(t: T): T {
  sharedTex.add(t);
  return t;
}

/** 遍历释放世界独占的几何体/材质/贴图（跳过已登记的共享资源） */
export function disposeObjectAssets(root: THREE.Object3D) {
  root.traverse(o => {
    const obj = o as THREE.Mesh & THREE.Sprite;
    if (!(obj as any).isMesh && !(obj as any).isSprite) return;

    const geo = obj.geometry;
    if (geo && !sharedGeo.has(geo)) geo.dispose();

    const raw = obj.material as THREE.Material | THREE.Material[] | undefined;
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const m of list) {
      if (sharedMat.has(m)) continue;
      // 贴图可能被多个材质共用（纹理缓存），仅释放本世界独占的
      const std = m as THREE.MeshStandardMaterial;
      for (const key of ['map', 'normalMap', 'emissiveMap', 'alphaMap'] as const) {
        const tex = std[key];
        if (tex && !sharedTex.has(tex)) tex.dispose();
      }
      m.dispose();
    }
  });
}
