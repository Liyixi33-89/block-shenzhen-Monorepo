<script setup lang="ts">
// 角色定制面板：肤色/发型/服装/配饰 + 3D 实时预览 + 自定义皮肤上传（X 键或 HUD 按钮打开）
import { ref, reactive, onMounted, onBeforeUnmount, watch } from 'vue';
import * as THREE from 'three';
import type { GameEngine } from '../engine/engine';
import {
  Character, makeSkinCanvas, defaultSkin, SKIN_TONES, HAIR_COLORS,
  type SkinParams,
} from '../engine/character';

const props = defineProps<{
  engRef: GameEngine | null;
  visible: boolean;
}>();
const emit = defineEmits<{ (e: 'close'): void }>();

const p = reactive<SkinParams>({ ...defaultSkin() });
const customSkin = ref('');
const name = ref('');

const previewCanvas = ref<HTMLCanvasElement>();
let preview: {
  renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera;
  char: Character | null; raf: number; dispose: () => void;
} | null = null;

const TONES = SKIN_TONES;
const HAIRS = HAIR_COLORS;
const SHIRTS = ['#c8282a', '#3a7ad0', '#3aa060', '#e0a030', '#8a5ac0', '#f2f2f2', '#2a2a2a', '#e87fb0', '#e05050', '#2a6ab0'];
const PANTS = ['#2a3a5a', '#2a2a2a', '#6a5a4a', '#3a5a8a', '#1a1a24', '#c8b48a'];
const SHOES = ['#222222', '#5a3a22', '#f0f0f0', '#3a3a3a', '#a03030'];

// 打开面板时从存档 profile 回填
watch(() => props.visible, (v) => {
  if (!v) return;
  const prof = props.engRef?.profile;
  if (prof) {
    Object.assign(p, prof.skinParams);
    customSkin.value = prof.customSkin || '';
    name.value = prof.name || '';
  } else {
    Object.assign(p, defaultSkin());
    customSkin.value = '';
    name.value = props.engRef?.session?.name ?? '';
  }
  if (preview) renderPreview();
});

// ---- 3D 预览 ----
function initPreview() {
  const canvas = previewCanvas.value;
  if (!canvas || preview) return;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
  camera.position.set(3.6, 4.6, 5.2);
  camera.lookAt(0, 3.2, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334466, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(4, 8, 5);
  scene.add(key);
  let raf = 0;
  const tick = () => {
    if (preview?.char) {
      preview.char.group.rotation.y += 0.01;
      preview.char.update(0.016, 2.5);
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };
  preview = {
    renderer, scene, camera, char: null, raf,
    dispose: () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
    },
  };
  renderPreview();
  tick();
}

function renderPreview() {
  if (!preview) return;
  if (preview.char) { preview.char.dispose(); preview.scene.remove(preview.char.group); }
  const canvas = customSkin.value ? loadCustomCanvas() : makeSkinCanvas({ ...p, seed: p.seed || 1 });
  preview.char = new Character(canvas);
  preview.char.group.position.y = 0;
  preview.char.setAnim('wave');
  preview.scene.add(preview.char.group);
}

function loadCustomCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const img = new Image();
  img.onload = () => { c.getContext('2d')!.drawImage(img, 0, 0); };
  img.src = customSkin.value;
  return c;
}

function randomize() {
  const r = Math.random;
  p.skin = TONES[Math.floor(r() * TONES.length)];
  p.hair = HAIRS[Math.floor(r() * HAIRS.length)];
  p.gender = r() < 0.5 ? 'f' : 'm';
  p.hairStyle = r() < 0.2 ? 'bald' : r() < 0.5 ? 'long' : 'short';
  p.shirt = SHIRTS[Math.floor(r() * SHIRTS.length)];
  p.pants = PANTS[Math.floor(r() * PANTS.length)];
  p.shoes = SHOES[Math.floor(r() * SHOES.length)];
  p.longSleeve = r() < 0.4;
  p.shorts = r() < 0.3;
  p.glasses = r() < 0.15;
  p.dress = p.gender === 'f' && r() < 0.4;
  p.seed = Math.floor(r() * 1e9);
  customSkin.value = '';
}

function onUpload(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => { customSkin.value = reader.result as string; };
  reader.readAsDataURL(f);
}

function save() {
  const profile = { name: name.value, skinParams: { ...p }, customSkin: customSkin.value || '' };
  props.engRef?.applyProfile(profile);
  emit('close');
}

onMounted(initPreview);
onBeforeUnmount(() => preview?.dispose());
watch(() => ({ ...p, skin: p.skin, hair: p.hair, shirt: p.shirt, pants: p.pants, shoes: p.shoes }), () => {
  if (props.visible && preview) renderPreview();
});
watch(customSkin, () => { if (props.visible && preview) renderPreview(); });
</script>

<template>
  <div v-if="visible" class="panel panel-char" @mousedown.self="emit('close')">
    <div class="panel-head">
      <b>🧍 自定义角色</b>
      <button class="panel-close" @click="emit('close')">✕</button>
    </div>
    <div class="panel-body char-body">
      <div class="char-preview">
        <canvas ref="previewCanvas" class="char-canvas"></canvas>
        <div class="char-actions">
          <button class="hud-btn" @click="randomize">🎲 随机</button>
          <label class="hud-btn upload">
            上传皮肤<input type="file" accept="image/png,image/jpeg" @change="onUpload" />
          </label>
          <button class="hud-btn" @click="customSkin = ''">🔙 生成式</button>
        </div>
      </div>

      <div class="char-controls">
        <div class="char-row">
          <span class="char-label">姓名</span>
          <input class="char-input" v-model="name" maxlength="12" placeholder="角色名" />
        </div>

        <div class="char-row">
          <span class="char-label">性别</span>
          <div class="swatches">
            <button class="chip" :class="{ on: p.gender === 'm' }" @click="p.gender = 'm'; p.dress = false">男</button>
            <button class="chip" :class="{ on: p.gender === 'f' }" @click="p.gender = 'f'">女</button>
          </div>
        </div>

        <div class="char-row">
          <span class="char-label">肤色</span>
          <div class="swatches">
            <button v-for="c in TONES" :key="'s'+c" class="sw" :class="{ on: p.skin === c }"
              :style="{ background: c }" @click="p.skin = c"></button>
          </div>
        </div>

        <div class="char-row">
          <span class="char-label">发型</span>
          <div class="swatches">
            <button v-for="h in HAIRS" :key="'h'+h" class="sw" :class="{ on: p.hair === h }"
              :style="{ background: h }" @click="p.hair = h"></button>
          </div>
        </div>

        <div class="char-row">
          <span class="char-label">发式</span>
          <div class="swatches">
            <button class="chip" :class="{ on: p.hairStyle === 'short' }" @click="p.hairStyle = 'short'">短发</button>
            <button class="chip" :class="{ on: p.hairStyle === 'long' }" @click="p.hairStyle = 'long'">长发</button>
            <button class="chip" :class="{ on: p.hairStyle === 'bald' }" @click="p.hairStyle = 'bald'">光头</button>
          </div>
        </div>

        <div class="char-row">
          <span class="char-label">上衣</span>
          <div class="swatches">
            <button v-for="c in SHIRTS" :key="'t'+c" class="sw" :class="{ on: p.shirt === c }"
              :style="{ background: c }" @click="p.shirt = c"></button>
          </div>
        </div>

        <div class="char-row">
          <span class="char-label">下装</span>
          <div class="swatches">
            <button v-for="c in PANTS" :key="'b'+c" class="sw" :class="{ on: p.pants === c }"
              :style="{ background: c }" @click="p.pants = c"></button>
          </div>
        </div>

        <div class="char-row">
          <span class="char-label">鞋子</span>
          <div class="swatches">
            <button v-for="c in SHOES" :key="'o'+c" class="sw" :class="{ on: p.shoes === c }"
              :style="{ background: c }" @click="p.shoes = c"></button>
          </div>
        </div>

        <div class="char-row">
          <span class="char-label">配饰</span>
          <div class="swatches">
            <button class="chip" :class="{ on: p.longSleeve }" @click="p.longSleeve = !p.longSleeve">长袖</button>
            <button class="chip" :class="{ on: p.shorts }" @click="p.shorts = !p.shorts">短裤</button>
            <button class="chip" :class="{ on: p.glasses }" @click="p.glasses = !p.glasses">眼镜</button>
            <button class="chip" :class="{ on: p.dress }" @click="p.dress = !p.dress" :disabled="p.gender !== 'f'">连衣裙</button>
          </div>
        </div>

        <div class="char-save">
          <button class="hud-btn primary" @click="save">💾 保存形象</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel-char { left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(720px, calc(100vw - 32px)); }
.char-body { display: flex; gap: 18px; }
.char-preview { width: 240px; flex: 0 0 240px; display: flex; flex-direction: column; gap: 10px; }
.char-canvas { width: 240px; height: 300px; border: 1px solid var(--border-2); border-radius: var(--r-md); background: radial-gradient(circle at 50% 35%, #1a2c46, #0a1628); }
.char-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.char-controls { flex: 1; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; }
.char-row { display: flex; align-items: center; gap: 10px; }
.char-label { width: 44px; flex: 0 0 44px; color: var(--text-2); font-size: 0.85em; }
.char-input { flex: 1; background: var(--bg-0); border: 1px solid var(--border-1); color: var(--text-0); border-radius: var(--r-sm); padding: 6px 10px; }
.swatches { display: flex; flex-wrap: wrap; gap: 6px; }
.sw { width: 24px; height: 24px; border-radius: 5px; border: 2px solid transparent; cursor: pointer; }
.sw.on { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-ink); }
.chip { background: var(--bg-0); border: 1px solid var(--border-1); color: var(--text-2); border-radius: var(--r-pill); padding: 4px 12px; font-size: 0.85em; cursor: pointer; }
.chip.on { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
.chip:disabled { opacity: 0.4; cursor: not-allowed; }
.hud-btn { background: var(--border-2); border: none; color: var(--text-0); border-radius: var(--r-sm); padding: 6px 12px; cursor: pointer; font-size: 0.85em; }
.hud-btn.primary { background: var(--accent); color: var(--accent-ink); font-weight: 600; }
.hud-btn.upload { position: relative; overflow: hidden; }
.hud-btn.upload input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.char-save { margin-top: 4px; text-align: right; }
@media (max-width: 720px) {
  .char-body { flex-direction: column; }
  .char-preview { width: 100%; flex: none; }
  .char-canvas { width: 100%; height: 220px; }
}
</style>