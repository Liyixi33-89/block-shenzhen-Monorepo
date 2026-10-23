<script setup lang="ts">
// 小地图：玩家周边道路/地标/朝向的实时局部地图（右上角，随玩家移动刷新）
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { proj } from '@block-sz/shared';
import type { GameEngine } from '../engine/engine';
import { worldToU, type MapBounds } from '../engine/minimap';

const props = defineProps<{
  engRef: GameEngine | null;
  visible: boolean;
}>();

const canvasRef = ref<HTMLCanvasElement>();
const SIZE = 168; // 小地图像素
const RANGE = 320; // 半宽范围（世界单位）
let iv = 0;

function draw() {
  const c = canvasRef.value;
  const e = props.engRef;
  if (!c || !e?.sceneData || !e?.player) return;
  const g = c.getContext('2d')!;
  const px = e.player.position.x, pz = e.player.position.z;
  const b: MapBounds = { minX: px - RANGE, maxX: px + RANGE, minZ: pz - RANGE, maxZ: pz + RANGE };

  // 背景
  g.fillStyle = 'rgba(8,18,32,0.86)';
  g.beginPath();
  g.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(31,185,168,0.5)';
  g.lineWidth = 2;
  g.stroke();

  const toXY = (x: number, z: number) => {
    const { u, v } = worldToU(x, z, b);
    return [u * SIZE, v * SIZE] as const;
  };

  // 道路
  g.lineCap = 'round';
  for (const s of e.mapRoads) {
    if (Math.max(s.x1, s.x2) < b.minX || Math.min(s.x1, s.x2) > b.maxX) continue;
    if (Math.max(s.z1, s.z2) < b.minZ || Math.min(s.z1, s.z2) > b.maxZ) continue;
    const [x1, y1] = toXY(s.x1, s.z1);
    const [x2, y2] = toXY(s.x2, s.z2);
    g.strokeStyle = s.kind === 'hwy' ? 'rgba(255,178,80,0.9)' : 'rgba(150,160,175,0.55)';
    g.lineWidth = s.kind === 'hwy' ? 2 : 1.2;
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  }

  // 附近地标
  for (const lm of e.sceneData.landmarks) {
    const w = proj(lm.latlng.lat, lm.latlng.lng);
    if (Math.abs(w.x - px) > RANGE || Math.abs(w.z - pz) > RANGE) continue;
    const [x, y] = toXY(w.x, w.z);
    g.fillStyle = '#ffd66b';
    g.beginPath();
    g.arc(x, y, 3.5, 0, Math.PI * 2);
    g.fill();
  }

  // 玩家（朝向三角）
  const [cx, cy] = toXY(px, pz);
  const facing = e.player.facing;
  const a = facing + Math.PI;
  const tipX = cx + Math.cos(a) * 9, tipY = cy + Math.sin(a) * 9;
  const w1 = a + 2.4, w2 = a - 2.4;
  g.fillStyle = '#1fb9a8';
  g.beginPath();
  g.moveTo(tipX, tipY);
  g.lineTo(cx + Math.cos(w1) * 7, cy + Math.sin(w1) * 7);
  g.lineTo(cx + Math.cos(w2) * 7, cy + Math.sin(w2) * 7);
  g.closePath();
  g.fill();
  g.strokeStyle = '#fff';
  g.lineWidth = 1.2;
  g.stroke();

  // 指北
  g.fillStyle = 'rgba(255,255,255,0.65)';
  g.font = '10px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText('N', SIZE / 2, 14);
}

watch(() => props.visible, (v) => { if (v) draw(); });

onMounted(() => {
  iv = window.setInterval(() => { if (props.visible) draw(); }, 250);
  draw();
});
onBeforeUnmount(() => clearInterval(iv));
</script><template>
  <div v-if="visible" class="minimap">
    <canvas ref="canvasRef" :width="SIZE" :height="SIZE" class="minimap-canvas"></canvas>
  </div>
</template>

<style scoped>
.minimap { position: absolute; top: 16px; right: 16px; pointer-events: none; z-index: 5; }
.minimap-canvas { width: 168px; height: 168px; display: block; }
</style>