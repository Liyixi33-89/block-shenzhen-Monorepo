// 第三人称玩家控制器：WASD 移动 / 鼠标拖拽转视角 / 滚轮缩放 / Shift 疾跑
// 阶段二：移动改为「试探移动 + 碰撞响应」（AABB 空间哈希），沿墙滑行而非穿墙。
// 飞升 fly 解锁：flightMode 空中自由飞行（Space 升 / Ctrl 降），落地自动退出。
import * as THREE from 'three';
import type { Landmark } from '@block-sz/schema';
import { collision } from './collision';

export interface PlayerInit {
  x: number;
  z: number;
  facing: number;   // 弧度
}

const WALK = 26;     // 单位/秒（步行）
const RUN = 52;      // 疾跑
const FLY = 70;      // 飞行速度
const FLY_VERT = 40; // 升降速度
const FLY_MIN_Y = 12;   // 最低巡航高度（地面之上）
const FLY_MAX_Y = 260;  // 最高巡航高度
const CAM_DIST = 30;
const CAM_HEIGHT = 16;
/** 玩家碰撞半径（圆柱近似） */
const BODY_R = 2.2;

export interface PlayerAPI {
  avatar: THREE.Group;
  position: THREE.Vector3;
  facing: number;
  keys: Set<string>;
  /** 乘车/面板期间挂起玩家控制 */
  suspended: boolean;
  /** 观景台登顶俯瞰模式：active 时冻结地面移动，相机绕塔顶环视俯瞰 */
  deckMode(active: boolean, x?: number, z?: number, height?: number): void;
  /** 飞行模式（飞升 fly 解锁）：on 时空中自由飞行，Space 升 / Ctrl 降 */
  flightMode(on: boolean): void;
  /** 速度加成（speed 道具效果）：>1 时移动速度倍增 */
  speedBoost: number;
  /** 飞行模式是否激活（只读） */
  readonly flying: boolean;
  update(dt: number, _landmarks: Landmark[]): void;
  dispose(): void;
  teleport(x: number, z: number, f?: number): void;
  /** 视角/缩放外部注入（移动端触屏用；dx dy 为屏幕像素增量） */
  look(dx: number, dy: number): void;
  zoom(d: number): void;
}

export function createPlayer(camera: THREE.PerspectiveCamera, init: PlayerInit): PlayerAPI {
  const position = new THREE.Vector3(init.x, 0, init.z);
  let facing = init.facing;
  let camDist = CAM_DIST;
  let camPitch = 0.42;   // 俯仰（弧度）
  const keys = new Set<string>();
  let suspended = false;
  let dragging = false, lastX = 0, lastY = 0;
  // 观景台俯瞰相机（登顶时非空：{塔顶x,z,height}）
  let deckCam: { x: number; z: number; height: number } | null = null;
  // 飞行模式（飞升 fly 解锁）：非 0 时 position.y 在空中，无碰撞
  let flying = false;
  // 速度加成倍率（speed 道具效果，由引擎每帧注入）
  let speedBoost = 1;

  // 玩家化身：像素小人（方块身体 + 头 + 可摆动四肢）
  // P1：四肢做成独立 pivot，行走时摆动、奔跑加速、闲置微呼吸
  const avatar = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 4.4, 1.6),
    new THREE.MeshStandardMaterial({ color: 0xe8554d, roughness: 0.6 }),
  );
  body.position.y = 3.2;
  body.castShadow = true;
  avatar.add(body);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 2.2, 2.2),
    new THREE.MeshStandardMaterial({ color: 0xf2c9a0, roughness: 0.8 }),
  );
  head.position.y = 6.5;
  head.castShadow = true;
  avatar.add(head);

  // 四肢 pivot（绕各自根部旋转，摆动时模拟走路）
  const legGeo = new THREE.BoxGeometry(1.1, 2.4, 1.3);
  const armGeo = new THREE.BoxGeometry(0.9, 2.0, 0.9);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x2a4a6a, roughness: 0.6 });
  const armMat = new THREE.MeshStandardMaterial({ color: 0xe8554d, roughness: 0.6 });
  const mkLimb = (geo: THREE.BoxGeometry, mat: THREE.Material, y: number, dx: number, dz: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(dx, y, dz);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = geo.parameters.height / 2;
    mesh.castShadow = true;
    pivot.add(mesh);
    avatar.add(pivot);
    return pivot;
  };
  const legL = mkLimb(legGeo, legMat, 0.9, -0.55, 0);
  const legR = mkLimb(legGeo, legMat, 0.9, 0.55, 0);
  const armL = mkLimb(armGeo, armMat, 3.2, -1.7, 0);
  const armR = mkLimb(armGeo, armMat, 3.2, 1.7, 0);

  // 小地图标记锥（头顶）
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(1.2, 2.4, 4),
    new THREE.MeshStandardMaterial({ color: 0x1fb9a8, roughness: 0.5 }),
  );
  cone.position.y = 10;
  cone.castShadow = true;
  avatar.add(cone);

  // 动画状态
  let walkPhase = 0;
  let moving = false;

  function onKey(e: KeyboardEvent, down: boolean) {
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'e', 'shift', ' ', 'control', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
      keys.delete(k); if (down) keys.add(k);
      e.preventDefault();
    }
  }
  const kd = (e: KeyboardEvent) => onKey(e, true);
  const ku = (e: KeyboardEvent) => onKey(e, false);

  function onDown(e: MouseEvent) { dragging = true; lastX = e.clientX; lastY = e.clientY; }
  function onMove(e: MouseEvent) {
    if (!dragging) return;
    facing -= (e.clientX - lastX) * 0.005;
    camPitch = THREE.MathUtils.clamp(camPitch + (e.clientY - lastY) * 0.004, 0.12, 1.25);
    lastX = e.clientX; lastY = e.clientY;
  }
  function onUp() { dragging = false; }
  function onWheel(e: WheelEvent) {
    camDist = THREE.MathUtils.clamp(camDist + e.deltaY * 0.03, 12, 90);
    e.preventDefault();
  }

  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  window.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('wheel', onWheel, { passive: false });

  function update(dt: number, _landmarks: Landmark[]) {
    // 观景台俯瞰：冻结地面移动，相机绕塔顶环视
    if (deckCam) {
      keys.clear();
      avatar.position.set(deckCam.x, 0, deckCam.z);
      avatar.rotation.y = facing + Math.PI;
      const cx = deckCam.x + Math.sin(facing) * camDist * Math.cos(camPitch);
      const cz = deckCam.z + Math.cos(facing) * camDist * Math.cos(camPitch);
      const cy = deckCam.height + camDist * Math.sin(camPitch);
      camera.position.lerp(new THREE.Vector3(cx, cy, cz), 0.25);
      camera.lookAt(deckCam.x, deckCam.height - 4, deckCam.z);
      return;
    }
    if (suspended) {
      keys.clear();
      return;
    }
    // 方向输入（地面/飞行共用）
    let mx = 0, mz = 0;
    if (keys.has('w') || keys.has('arrowup')) mz -= 1;
    if (keys.has('s') || keys.has('arrowdown')) mz += 1;
    if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
    if (keys.has('d') || keys.has('arrowright')) mx += 1;

    // ---- 飞行模式（飞升 fly 解锁）：空中自由移动，Space 升 / Ctrl 降 ----
    if (flying) {
      const spd = FLY * speedBoost;
      const dx = (mx * Math.cos(facing) + mz * Math.sin(facing));
      const dz = (mx * Math.sin(facing) + mz * Math.cos(facing));
      const len = Math.hypot(dx, dz) || 1;
      position.x += dx / len * Math.abs(mx || mz) * spd * dt;
      position.z += dz / len * Math.abs(mx || mz) * spd * dt;
      let vy = 0;
      if (keys.has(' ')) vy += FLY_VERT;
      if (keys.has('control')) vy -= FLY_VERT;
      position.y = THREE.MathUtils.clamp(position.y + vy * dt, 0, FLY_MAX_Y);
      // 降到地面自动退出飞行
      if (position.y <= 0) {
        position.y = 0;
        flying = false;
      }
      moving = !!(mx || mz || vy);
      // 四肢平展滑翔姿态
      walkPhase += dt * 6;
      const s = Math.sin(walkPhase);
      armL.rotation.x = -1.4; armR.rotation.x = -1.4;   // 双臂后掠
      legL.rotation.x = s * 0.12; legR.rotation.x = -s * 0.12;
      body.position.y = 3.2;
      head.position.y = 6.5;
      // 相机跟随（更高更远，看向空中化身）
      const fcx = position.x + Math.sin(facing) * camDist * Math.cos(camPitch);
      const fcz = position.z + Math.cos(facing) * camDist * Math.cos(camPitch);
      const fcy = position.y + CAM_HEIGHT + camDist * Math.sin(camPitch);
      camera.position.lerp(new THREE.Vector3(fcx, fcy, fcz), 0.12);
      camera.lookAt(position.x, position.y + 6, position.z);
      avatar.position.set(position.x, position.y, position.z);
      avatar.rotation.y = facing + Math.PI;
      return;
    }

    // 移动（阶段二：试探移动 + 滑动响应，不可穿建筑；speed 道具效果加成）
    const speed = (keys.has('shift') ? RUN : WALK) * speedBoost;
    if (mx || mz) {
      const len = Math.hypot(mx, mz);
      // 相机在玩家 (sin f, cos f) 方向身后：前进 = -(sin f, cos f)，右移 = (cos f, sin f)
      // W(mz=-1) → 远离相机；D(mx=+1) → 屏幕右
      const dx = (mx * Math.cos(facing) + mz * Math.sin(facing)) / len;
      const dz = (mx * Math.sin(facing) + mz * Math.cos(facing)) / len;
      const moved = collision.move(position.x, position.z, dx * speed * dt, dz * speed * dt, BODY_R);
      position.x = moved.x;
      position.z = moved.z;
    }

    // P1 角色动画：行走摆臂摆腿 + 身体起伏；闲置微呼吸
    moving = !!(mx || mz);
    const run = moving && keys.has('shift');
    const rate = (run ? RUN : WALK) / 2.6;       // 摆臂频率随速度
    const swing = run ? 0.85 : 0.55;             // 奔跑幅度更大
    if (moving) walkPhase += dt * rate;
    else walkPhase = 0;
    const ph = moving ? walkPhase : 0;
    const s = Math.sin(ph), c = Math.cos(ph);
    legL.rotation.x = s * swing;
    legR.rotation.x = -s * swing;
    armL.rotation.x = -s * swing;
    armR.rotation.x = s * swing;
    body.position.y = moving ? 3.2 + Math.abs(c) * 0.28 : 3.2 + Math.sin(performance.now() * 0.002) * 0.08;
    head.position.y = 6.5 + (moving ? Math.abs(c) * 0.2 : 0);

    // 相机跟随（第三人称，绕玩家旋转）
    const cx = position.x + Math.sin(facing) * camDist * Math.cos(camPitch);
    const cz = position.z + Math.cos(facing) * camDist * Math.cos(camPitch);
    const cy = CAM_HEIGHT + camDist * Math.sin(camPitch);
    camera.position.lerp(new THREE.Vector3(cx, cy, cz), 0.18);
    camera.lookAt(position.x, 6, position.z);

    // 化身位置与朝向（背对镜头 = 面向前进方向）
    avatar.position.set(position.x, 0, position.z);
    avatar.rotation.y = facing + Math.PI;
  }

  function dispose() {
    window.removeEventListener('keydown', kd);
    window.removeEventListener('keyup', ku);
    window.removeEventListener('mousedown', onDown);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('wheel', onWheel);
  }

  return {
    avatar, position, update, dispose, keys,
    get facing() { return facing; },
    get suspended() { return suspended; },
    set suspended(v: boolean) { suspended = v; },
    /** 传送到指定世界坐标（碰撞安全：落点若在建筑内则外挪） */
    teleport(x: number, z: number, f?: number) {
      const free = collision.findFreeSpot(x, z, BODY_R);
      position.set(free.x, 0, free.z);
      if (f !== undefined) facing = f;
      keys.clear();
    },
    /** 视角外部注入（触屏拖拽） */
    look(dx: number, dy: number) {
      facing -= dx * 0.005;
      camPitch = THREE.MathUtils.clamp(camPitch + dy * 0.004, 0.12, 1.25);
    },
    /** 缩放外部注入（触屏捏合） */
    zoom(d: number) {
      camDist = THREE.MathUtils.clamp(camDist + d, 12, 90);
    },
    /** 观景台登顶俯瞰：active 时相机绕塔顶环视；否则恢复正常跟随 */
    deckMode(active: boolean, x?: number, z?: number, height?: number) {
      if (active && x !== undefined && z !== undefined && height !== undefined) {
        deckCam = { x, z, height };
        suspended = true;
        camDist = Math.min(camDist, 30);   // 俯瞰距离适中
        camPitch = Math.max(camPitch, 0.3);
      } else {
        deckCam = null;
        suspended = false;
      }
      keys.clear();
    },
    /** 飞行模式：on 时升空（进入即抬升到巡航高度），落地自动退出 */
    flightMode(on: boolean) {
      flying = on;
      if (on) {
        position.y = Math.max(position.y, FLY_MIN_Y);
        suspended = false;   // 飞行中保持可控（不受乘车挂起影响恢复态）
        avatar.position.set(position.x, position.y, position.z);
      } else {
        position.y = 0;
      }
      keys.clear();
    },
    /** 速度加成倍率（speed 道具）：引擎每帧注入 */
    set speedBoost(v: number) { speedBoost = v; },
    get speedBoost() { return speedBoost; },
    get flying() { return flying; },
  };
}
