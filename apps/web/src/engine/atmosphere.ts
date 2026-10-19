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
}

export function buildLighting(): LightingRig {
  const g = new THREE.Group();
  // 天光：偏蓝顶光 + 暖地面反光
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x6b7f52, 1.0);
  g.add(hemi);
  // 主日光（略偏暖，投软阴影）
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.0);
  sun.position.set(500, 800, 350);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 2200;
  // 阴影覆盖范围：以主城为核心 ±1200 单位
  sun.shadow.camera.left = -1200;
  sun.shadow.camera.right = 1200;
  sun.shadow.camera.top = 1200;
  sun.shadow.camera.bottom = -1200;
  sun.shadow.bias = -0.0005;
  g.add(sun);
  // 补光（弱冷光，暗部提蓝）
  const fill = new THREE.DirectionalLight(0x88a8ff, 0.28);
  fill.position.set(-400, 300, -350);
  g.add(fill);
  return { group: g, sun, hemi, fill };
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
