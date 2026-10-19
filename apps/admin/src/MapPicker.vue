<script setup lang="ts">
// 后台地图拾点组件：SVG 深圳平面图（经纬度域），点击 → 经纬度
// 不依赖外部地图服务；用场景内全部坐标点推算可视范围
import { ref, computed, PropType } from 'vue';
import type { Scene, LatLng } from '@block-sz/schema';

const W = 640, H = 480;

const props = defineProps({
  scene: { type: Object as PropType<Scene>, required: true },
  /** 当前编辑中的经纬度（v-model） */
  modelValue: { type: Object as PropType<LatLng | null>, default: null },
  /** 额外标注点 */
  markers: { type: Array as PropType<Array<{ latlng: LatLng; label?: string; color?: string }>>, default: () => [] },
});
const emit = defineEmits<{ (e: 'update:modelValue', v: LatLng): void }>();

// ---- 经纬度可视域（把场景所有点包进来 + 8% padding）----
const bounds = computed(() => {
  const pts: LatLng[] = [];
  for (const l of props.scene.landmarks) pts.push(l.latlng);
  for (const s of props.scene.spawnPoints) pts.push(s.latlng);
  for (const t of props.scene.teleportPoints) pts.push(t.latlng);
  for (const d of props.scene.districts) pts.push(d.center);
  if (pts.length < 2) return { minLat: 22.35, maxLat: 22.72, minLng: 113.75, maxLng: 114.65 };
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of pts) {
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
  }
  const padLat = (maxLat - minLat) * 0.08 || 0.01;
  const padLng = (maxLng - minLng) * 0.08 || 0.01;
  return { minLat: minLat - padLat, maxLat: maxLat + padLat, minLng: minLng - padLng, maxLng: maxLng + padLng };
});

// 经纬度 → SVG 像素（y 翻转：北在上）
function toXY(latlng: LatLng): { x: number; y: number } {
  const b = bounds.value;
  return {
    x: ((latlng.lng - b.minLng) / (b.maxLng - b.minLng)) * W,
    y: H - ((latlng.lat - b.minLat) / (b.maxLat - b.minLat)) * H,
  };
}
// SVG 像素 → 经纬度
function toLatLng(x: number, y: number): LatLng {
  const b = bounds.value;
  return {
    lng: b.minLng + (x / W) * (b.maxLng - b.minLng),
    lat: b.minLat + ((H - y) / H) * (b.maxLat - b.minLat),
  };
}
function fx(n: number, p = 4) { return Number(n.toFixed(p)); }

const svgEl = ref<SVGSVGElement>();

function onClick(e: MouseEvent) {
  const rect = svgEl.value!.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * W;
  const y = ((e.clientY - rect.top) / rect.height) * H;
  emit('update:modelValue', toLatLng(x, y));
}

const gridLines = [1, 2, 3];
const districtDots = computed(() => props.scene.districts.map(d => ({
  key: 'd' + d.id,
  xy: toXY(d.center as LatLng),
  color: '#' + d.color.toString(16).padStart(6, '0'),
})));
const landmarkDots = computed(() => props.scene.landmarks.map(l => {
  const xy = toXY(l.latlng as LatLng);
  const sel = props.modelValue && props.modelValue.lat === l.latlng.lat && props.modelValue.lng === l.latlng.lng;
  return { key: l.id, xy, name: l.name, sel };
}));
const spawnDots = computed(() => props.scene.spawnPoints.map(s => ({ key: s.id, xy: toXY(s.latlng as LatLng) })));
const markerDots = computed(() => props.markers.map((m, i) => ({ key: 'm' + i, xy: toXY(m.latlng), color: m.color || '#e87fb0' })));
const curDot = computed(() => props.modelValue ? toXY(props.modelValue) : null);
</script>

<template>
  <div class="map-picker">
    <svg ref="svgEl" :viewBox="`0 0 ${W} ${H}`" class="map-svg" @click="onClick">
      <rect x="0" y="0" :width="W" :height="H" fill="#0e2033" rx="8" />
      <!-- 网格参考线 -->
      <g v-for="i in gridLines" :key="i">
        <line :x1="(W / 4) * i" y1="0" :x2="(W / 4) * i" :y2="H" stroke="#1c3450" stroke-width="1" />
        <line x1="0" :y1="(H / 4) * i" :x2="W" :y2="(H / 4) * i" stroke="#1c3450" stroke-width="1" />
      </g>
      <!-- 经纬度刻度 -->
      <text x="6" y="14" fill="#3d5a78" font-size="11">{{ fx(bounds.maxLat, 3) }}N</text>
      <text x="6" :y="H - 6" fill="#3d5a78" font-size="11">{{ fx(bounds.minLat, 3) }}N</text>
      <text :x="W - 70" :y="H - 6" fill="#3d5a78" font-size="11">{{ fx(bounds.maxLng, 3) }}E</text>

      <!-- 区划中心 -->
      <circle v-for="d in districtDots" :key="d.key" :cx="d.xy.x" :cy="d.xy.y" r="5" :fill="d.color" opacity="0.55" />

      <!-- 地标 -->
      <g v-for="l in landmarkDots" :key="l.key">
        <rect :x="l.xy.x - 3" :y="l.xy.y - 3" width="6" height="6" rx="1.5"
              :fill="l.sel ? '#e8c050' : '#7ad0ff'" />
        <text :x="l.xy.x + 6" :y="l.xy.y + 4" fill="#9fb8ce" font-size="10">{{ l.name }}</text>
      </g>

      <!-- 出生点（绿圈） -->
      <circle v-for="s in spawnDots" :key="s.key" :cx="s.xy.x" :cy="s.xy.y" r="6" fill="none" stroke="#4ade80" stroke-width="2" />

      <!-- 额外标注 -->
      <circle v-for="m in markerDots" :key="m.key" :cx="m.xy.x" :cy="m.xy.y" r="4" :fill="m.color" />

      <!-- 当前拾取点（金色十字准星） -->
      <g v-if="curDot">
        <circle :cx="curDot.x" :cy="curDot.y" r="9" fill="none" stroke="#e8c050" stroke-width="2" />
        <circle :cx="curDot.x" :cy="curDot.y" r="3" fill="#e8c050" />
      </g>
    </svg>
    <p class="map-hint">
      {{ modelValue ? `已拾取：${fx(modelValue.lat)}, ${fx(modelValue.lng)}（点击地图修改）` : '点击地图任意位置拾取坐标' }}
    </p>
  </div>
</template>
