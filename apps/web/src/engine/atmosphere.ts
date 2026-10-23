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

/** 波光海面：ShaderMaterial GPU 波浪（零 CPU 顶点遍历）+ 菲涅尔假反射 + 像素波光 + 深浅水色。
 * 波浪从 CPU 每帧 2304 顶点遍历移至 GPU（平面仅 1x1 细分），
 * 由片元着色器用世界坐标多频正弦做法线扰动，并叠加波光闪烁与距离雾。 */
export function buildSea(): { mesh: THREE.Mesh; update: (t: number) => void } {
  const geo = new THREE.PlaneGeometry(16000, 16000, 1, 1);
  geo.rotateX(-Math.PI / 2);

  const uniforms = {
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color(0x1d4a5a) },     // 深海/深水色
    uShallow: { value: new THREE.Color(0x2e6f9e) },  // 近岸浅水色
    uSky: { value: new THREE.Color(0x9fc4dc) },      // 菲涅尔天空反射色
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    fog: true, // 跟随 scene.fog（含昼夜雾色/远近变化），与天空/建筑雾一致
    vertexShader: `
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uDeep, uShallow, uSky;
      varying vec3 vWorld;
      #include <fog_pars_fragment>

      void main() {
        // 波浪法线扰动：多频正弦组合，替代顶点波浪（GPU 端，零 CPU 开销）
        float ddx = sin(vWorld.x * 0.008 + uTime * 1.1) + cos(vWorld.z * 0.011 + uTime * 0.8)
                  + sin((vWorld.x - vWorld.z) * 0.03 + uTime * 2.0) * 0.4;
        float ddz = cos(vWorld.z * 0.008 - uTime * 1.1) + sin(vWorld.x * 0.013 - uTime * 0.9)
                  + cos((vWorld.x + vWorld.z) * 0.02 + uTime * 1.6) * 0.4;
        vec3 N = normalize(vec3(ddx * 0.12, 1.0, ddz * 0.12));

        // 菲涅尔假反射：法线越倾斜越亮（反射天空色），平面处偏水色
        float fres = 0.35 + 0.65 * pow(1.0 - clamp(N.y, 0.0, 1.0), 2.5);

        // 深浅水色插值（近岸浅、远海深）
        vec3 water = mix(uDeep, uShallow, clamp(vWorld.y + 8.0, 0.0, 1.0));
        vec3 col = mix(water, uSky, fres * 0.8);

        // 像素波光闪烁（方块化高光，随时间的网格噪声）
        vec2 cell = floor(vWorld.xz * 0.5);
        float sp = step(0.985, fract(sin(dot(cell, vec2(12.9898, 78.233)) + floor(uTime * 3.0)) * 43758.5453));
        col += sp * 0.10;

        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = -8;
  // 海面覆盖全图，禁视锥剔除避免边界闪没；ShaderMaterial 不参与投影，海洋远景无需阴影
  mesh.frustumCulled = false;

  function update(t: number) {
    uniforms.uTime.value = t;
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
