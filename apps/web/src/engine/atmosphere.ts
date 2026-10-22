// 天空/海洋/氛围：渐变天空穹顶 + 波光海面 + 距离雾 + 环境色调
import * as THREE from 'three';

/** 渐变天空穹顶（顶蓝底白，像素风色带） */
export function buildSky(): { mesh: THREE.Mesh; mat: THREE.ShaderMaterial } {
  const geo = new THREE.SphereGeometry(7200, 16, 10);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x3a7ca8) },
      midColor: { value: new THREE.Color(0x87c5eb) },
      botColor: { value: new THREE.Color(0xd8e8f2) },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vPos;
      uniform vec3 topColor, midColor, botColor;
      void main() {
        float h = normalize(vPos).y;
        // 三段色带（像素风阶梯）
        vec3 c = h > 0.35 ? topColor : (h > 0.08 ? midColor : botColor);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(geo, mat);
  return { mesh: sky, mat };
}

/** 波光海面：大平面 + 顶点波动动画（低频省性能） */
export function buildSea(): { mesh: THREE.Mesh; update: (t: number) => void } {
  const geo = new THREE.PlaneGeometry(16000, 16000, 48, 48);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0x2e6f9e, transparent: true, opacity: 0.96, roughness: 0.35, metalness: 0.05 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = -8;
  mesh.receiveShadow = true;

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const base = pos.array.slice() as Float32Array;

  function update(t: number) {
    // 波浪：两组正弦叠加（振幅小、波长长）
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], z = base[i * 3 + 2];
      pos.setY(i, Math.sin(x * 0.008 + t * 1.1) * 1.6 + Math.cos(z * 0.011 + t * 0.8) * 1.4);
    }
    pos.needsUpdate = true;
  }
  return { mesh, update };
}

/** 环境光照组合（像素风高对比 + P0 主光投影） */
export interface LightingRig {
  group: THREE.Group;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  fill: THREE.DirectionalLight;
  /**
   * 阴影相机跟随玩家：主光 + 目标平移同一偏移，保持方向不变。
   * 阴影覆盖范围固定 ±SHADOW_SPAN，随玩家移动 → 近景阴影密度大幅提升。
   */
  followShadow(x: number, z: number): void;
}

/** 阴影相机半覆盖范围（跟随玩家，600 单位内高清投影） */
const SHADOW_SPAN = 600;
/** 主光相对目标的位置偏移（保持原光照方向） */
const SUN_OFFSET = new THREE.Vector3(500, 800, 350);

export function buildLighting(): LightingRig {
  const g = new THREE.Group();
  // 天光：偏蓝顶光 + 暖地面反光
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x6b7f52, 1.0);
  g.add(hemi);
  // 主日光（略偏暖，投软阴影）
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.0);
  sun.position.copy(SUN_OFFSET);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 2200;
  // 阴影覆盖：跟随玩家的 ±SHADOW_SPAN 方块（2048 贴图 → 每单位 ≈1.7 像素）
  sun.shadow.camera.left = -SHADOW_SPAN;
  sun.shadow.camera.right = SHADOW_SPAN;
  sun.shadow.camera.top = SHADOW_SPAN;
  sun.shadow.camera.bottom = -SHADOW_SPAN;
  sun.shadow.bias = -0.0005;
  // 目标物必须在场景树内，阴影相机才会跟随其位置
  const sunTarget = new THREE.Object3D();
  g.add(sunTarget);
  sun.target = sunTarget;
  g.add(sun);
  // 补光（弱冷光，暗部提蓝）
  const fill = new THREE.DirectionalLight(0x88a8ff, 0.28);
  fill.position.set(-400, 300, -350);
  g.add(fill);

  function followShadow(x: number, z: number) {
    // 目标点与主光同步平移，保持光照方向恒定
    sunTarget.position.set(x, 0, z);
    sun.position.set(x + SUN_OFFSET.x, SUN_OFFSET.y, z + SUN_OFFSET.z);
  }

  return { group: g, sun, hemi, fill, followShadow };
}

/** 远山剪影环（深圳郊野远景） */
export function buildDistantHills(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x7fa0b8, roughness: 1, metalness: 0 });
  // 环形分布的低多边形山影
  let seed = 42;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let i = 0; i < 22; i++) {
    const ang = (i / 22) * Math.PI * 2 + rnd() * 0.2;
    const dist = 3800 + rnd() * 1600;
    const h = 240 + rnd() * 380;
    const r = 320 + rnd() * 260;
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), mat);
    m.position.set(Math.cos(ang) * dist, h / 2 - 60, Math.sin(ang) * dist);
    g.add(m);
  }
  return g;
}
