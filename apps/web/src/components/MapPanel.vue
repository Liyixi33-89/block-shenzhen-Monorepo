<script setup lang="ts">
// 全城地图面板：区划色块 + 道路 + 地标 + 实时玩家位置（M 键或 HUD 按钮打开）
// 滚轮缩放 / 拖动平移 / 点击地标设置导航（传送前往）
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { proj } from '@block-sz/shared';
import type { GameEngine } from '../engine/engine';
import { computeMapBounds, renderBaseMap, worldToU, type MapBounds } from '../engine/minimap';

const props = defineProps<{
  engRef: GameEngine | null;
  visible: boolean;
}>();
const emit = defineEmits<{ (e: 'close'): void }>();

const canvasRef = ref<HTMLCanvasElement>();
let base: HTMLCanvasElement | null = null;
let bounds: MapBounds | null = null;
let scale = 1;
let tx = 0, ty = 0; // 平移偏移（像素）
const selected = ref<{ id: string; name: string; x: number; z: number } | null>(null);

const eng = computed(() => props.engRef);

// 底图尺寸（像素）
const MAP = 1024;

function draw(drawPlayer = true) {
  const c = canvasRef.value;
  if (!c || !base || !bounds) return;
  const g = c.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, c.width, c.height);
  // 底图（带缩放平移）
  g.translate(tx, ty);
  g.scale(scale, scale);
  g.drawImage(base, 0, 0);
  // 玩家位置
  if (drawPlayer) {
    const p = eng.value?.player?.position;
    if (p) {
      const { u, v } = worldToU(p.x, p.z, bounds);
      const px = u * MAP, py = v * MAP;
      g.fillStyle = '#ff4d4f';
      g.beginPath();
      g.arc(px, py, 7 / scale, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#fff';
      g.lineWidth = 2 / scale;
      g.stroke();
    }
  }
  // 选中地标高亮
  if (selected.value) {
    const { u, v } = worldToU(selected.value.x, selected.value.z, bounds);
    const px = u * MAP, py = v * MAP;
    g.strokeStyle = '#1fb9a8';
    g.lineWidth = 2.5 / scale;
    g.beginPath();
    g.arc(px, py, 14 / scale, 0, Math.PI * 2);
    g.stroke();
  }
}

function reset() {
  scale = 1; tx = 0; ty = 0;
}

function build() {
  const e = eng.value;
  if (!e?.sceneData) return;
  bounds = computeMapBounds(e.sceneData);
  base = renderBaseMap(e.sceneData, e.mapRoads, bounds, MAP);
  reset();
  requestAnimationFrame(() => draw());
}

watch(() => props.visible, (v) => {
  if (v) { build(); }
});

// 缩放（以鼠标为锚点）
function onWheel(e: WheelEvent) {
  e.preventDefault();
  const c = canvasRef.value!;
  const rect = c.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const ns = Math.min(6, Math.max(0.4, scale * (e.deltaY < 0 ? 1.2 : 0.833)));
  const k = ns / scale;
  tx = mx - (mx - tx) * k;
  ty = my - (my - ty) * k;
  scale = ns;
  draw();
}

// 拖动平移
let dragging = false, lastX = 0, lastY = 0;
function onDown(e: MouseEvent) {
  dragging = true; lastX = e.clientX; lastY = e.clientY;
}
function onMove(e: MouseEvent) {
  if (!dragging) return;
  tx += e.clientX - lastX; ty += e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  draw();
}
function onUp() { dragging = false; }

// 点击选中地标
function onClick(e: MouseEvent) {
  const c = canvasRef.value!;
  const rect = c.getBoundingClientRect();
  // 画布坐标 → 地图像素
  const mx = (e.clientX - rect.left - tx) / scale;
  const my = (e.clientY - rect.top - ty) / scale;
  if (!bounds) return;
  let best: { id: string; name: string; x: number; z: number; d: number } | null = null;
  for (const lm of eng.value?.sceneData?.landmarks ?? []) {
    const world = proj(lm.latlng.lat, lm.latlng.lng);
    const { u, v } = worldToU(world.x, world.z, bounds);
    const dx = u * MAP - mx, dy = v * MAP - my;
    const d = Math.hypot(dx, dy);
    if (d < 20 / scale && (!best || d < best.d)) {
      best = { id: lm.id, name: lm.name, x: world.x, z: world.z, d };
    }
  }
  if (best) selected.value = { id: best.id, name: best.name, x: best.x, z: best.z };
  else selected.value = null;
  draw();
}

function goTo() {
  if (selected.value) eng.value?.teleport(selected.value.x, selected.value.z);
}

// 玩家位置实时刷新
let iv = 0;
onMounted(() => {
  iv = window.setInterval(() => { if (props.visible) draw(); }, 600);
});
onBeforeUnmount(() => clearInterval(iv));
</script>

<template>
  <div v-if="visible" class="panel panel-map" @mousedown.self="emit('close')">
    <div class="panel-head">
      <b>🗺 深圳地图</b>
      <span class="muted map-hint">滚轮缩放 · 拖动平移 · 点击地标设导航</span>
      <button class="panel-close" @click="emit('close')">✕</button>
    </div>
    <div class="panel-body map-body">
      <canvas ref="canvasRef" class="map-canvas" :width="MAP" :height="MAP"
        @wheel.prevent="onWheel" @mousedown="onDown" @mousemove="onMove"
        @mouseup="onUp" @mouseleave="onUp" @click="onClick"></canvas>
      <div class="map-foot">
        <span v-if="selected">📍 {{ selected.name }}</span>
        <span v-else class="muted">点击地标查看</span>
        <div class="map-actions">
          <button class="hud-btn" @click="reset">↺ 复位</button>
          <button class="hud-btn primary" :disabled="!selected" @click="goTo">🚕 前往</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel-map { left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(820px, calc(100vw - 24px)); }
.map-hint { font-size: 0.85em; }
.map-body { display: flex; flex-direction: column; gap: 10px; }
.map-canvas { width: 100%; aspect-ratio: 1; border: 1px solid var(--border-2); border-radius: var(--r-md); background: #0b1a2e; cursor: grab; touch-action: none; }
.map-canvas:active { cursor: grabbing; }
.map-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.map-actions { display: flex; gap: 8px; }
.hud-btn { background: var(--border-2); border: none; color: var(--text-0); border-radius: var(--r-sm); padding: 6px 14px; cursor: pointer; }
.hud-btn.primary { background: var(--accent); color: var(--accent-ink); font-weight: 600; }
.hud-btn:disabled { opacity: 0.45; cursor: not-allowed; }
</style>