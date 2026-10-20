<script setup lang="ts">
// 交通编辑页签：站点 + 线路（DOM 类名契约：.item-list/.form-pane）
import { ref, computed, inject } from 'vue';
import { ADMIN_CTX } from '../context';
import MapPicker from '../MapPicker.vue';
import type { Station, Route } from '@block-sz/schema';

const { doc } = inject(ADMIN_CTX)!;
const scene = doc.scene;
const touch = doc.touch;

const KINDS = ['metro', 'bus', 'boat', 'cable', 'elevator'];
const KIND_LABELS: Record<string, string> = { metro: '地铁', bus: '巴士', boat: '游船', cable: '索道', elevator: '电梯' };

// ---------------- 站点 ----------------
const selStationId = ref('');
const selStation = computed<Station | null>(() =>
  scene.value?.traffic?.stations.find(s => s.id === selStationId.value) ?? null);
function addStation() {
  if (!scene.value) return;
  if (!scene.value.traffic) scene.value.traffic = { stations: [], routes: [] };
  const id = 'st_' + Date.now().toString(36);
  scene.value.traffic.stations.push({ id, name: '新站', latlng: { lat: 22.5431, lng: 114.0579 }, transfers: [] });
  selStationId.value = id;
  touch();
}
function delStation() {
  if (!scene.value?.traffic || !selStation.value) return;
  if (!confirm(`删除站点「${selStation.value.name}」？`)) return;
  scene.value.traffic.stations = scene.value.traffic.stations.filter(s => s.id !== selStationId.value);
  selStationId.value = '';
  touch();
}
function addTransfer() {
  if (!selStation.value) return;
  selStation.value.transfers.push('');
  touch();
}
function delTransfer(i: number) {
  if (!selStation.value) return;
  selStation.value.transfers.splice(i, 1);
  touch();
}

// ---------------- 线路 ----------------
const selRouteId = ref('');
const selRoute = computed<Route | null>(() =>
  scene.value?.traffic?.routes.find(r => r.id === selRouteId.value) ?? null);
const routeStationsText = ref('');
function selectRoute(id: string) {
  selRouteId.value = id;
  routeStationsText.value = (selRoute.value?.stations ?? []).join('\n');
  touch();
}
function addRoute() {
  if (!scene.value) return;
  if (!scene.value.traffic) scene.value.traffic = { stations: [], routes: [] };
  const id = 'rt_' + Date.now().toString(36);
  scene.value.traffic.routes.push({
    id, name: '新线路', kind: 'metro', color: 0x1fb9a8,
    stations: [], interval: 0.25, fare: 0, enabled: true,
  });
  selectRoute(id);
}
function delRoute() {
  if (!scene.value?.traffic || !selRoute.value) return;
  if (!confirm(`删除线路「${selRoute.value.name}」？`)) return;
  scene.value.traffic.routes = scene.value.traffic.routes.filter(r => r.id !== selRouteId.value);
  selRouteId.value = '';
  touch();
}
function saveRouteStations() {
  if (!selRoute.value) return;
  selRoute.value.stations = routeStationsText.value.split('\n').map(s => s.trim()).filter(Boolean);
  touch();
}
function addRouteStation() {
  if (!selRoute.value) return;
  const missing = scene.value?.traffic?.stations.find(s => !selRoute.value!.stations.includes(s.id));
  if (missing) selRoute.value.stations.push(missing.id);
  routeStationsText.value = selRoute.value.stations.join('\n');
  touch();
}
function intToHex(n: number) { return '#' + n.toString(16).padStart(6, '0'); }
</script>

<template>
  <section class="card">
    <div class="editor-head">
      <h2>交通站点（{{ scene?.traffic?.stations.length ?? 0 }}）</h2>
      <button class="primary" @click="addStation">+ 新增站点</button>
    </div>
    <div class="editor-body">
      <ul class="item-list">
        <li v-for="s in scene?.traffic?.stations ?? []" :key="s.id" :class="{ sel: s.id === selStationId }" @click="selStationId = s.id">
          <b>{{ s.name }}</b>
          <span class="muted">{{ s.id }}</span>
        </li>
      </ul>
      <div v-if="selStation && scene?.traffic" class="form-pane">
        <div class="form-grid">
          <label>ID <input v-model="selStation.id" @input="touch" /></label>
          <label>名称 <input v-model="selStation.name" @input="touch" /></label>
        </div>
        <h4>换乘线路（transfers，线路ID）</h4>
        <div v-for="(t, i) in selStation.transfers" :key="i" class="form-grid">
          <label>线路ID <input v-model="selStation.transfers[i]" @input="touch" /></label>
          <button class="danger" @click="delTransfer(i)">删</button>
        </div>
        <button @click="addTransfer">+ 添加换乘</button>
        <h4>坐标拾取</h4>
        <MapPicker :scene="scene" v-model="selStation.latlng" @update:model-value="touch" />
        <div class="danger-zone"><button class="danger" @click="delStation">删除此站点</button></div>
      </div>
      <p v-else-if="scene?.traffic" class="tip">← 从列表选择一个站点进行编辑</p>
      <p v-else class="tip">暂无交通数据，点「+ 新增站点」创建。</p>
    </div>
  </section>

  <section class="card">
    <div class="editor-head">
      <h2>交通线路（{{ scene?.traffic?.routes.length ?? 0 }}）</h2>
      <button class="primary" @click="addRoute">+ 新增线路</button>
    </div>
    <div class="editor-body">
      <ul class="item-list">
        <li v-for="r in scene?.traffic?.routes ?? []" :key="r.id" :class="{ sel: r.id === selRouteId }" @click="selectRoute(r.id)">
          <b>{{ r.name }}</b>
          <span class="muted">{{ KIND_LABELS[r.kind] }} · ¥{{ r.fare }} · {{ r.stations.length }}站</span>
          <span v-if="!r.enabled" class="off">停用</span>
        </li>
      </ul>
      <div v-if="selRoute && scene?.traffic" class="form-pane">
        <div class="form-grid">
          <label>ID <input v-model="selRoute.id" @input="touch" /></label>
          <label>名称 <input v-model="selRoute.name" @input="touch" /></label>
          <label>类型
            <select v-model="selRoute.kind" @change="touch">
              <option v-for="k in KINDS" :key="k" :value="k">{{ KIND_LABELS[k] }}</option>
            </select>
          </label>
          <label>主题色 <input type="color" :value="intToHex(selRoute.color)"
                 @input="selRoute.color = parseInt(($event.target as any).value.slice(1), 16), touch()" /></label>
          <label>票价 ¥ <input type="number" min="0" v-model.number="selRoute.fare" @input="touch" /></label>
          <label>班间隔 <input type="number" step="0.05" min="0.05" v-model.number="selRoute.interval" @input="touch" /></label>
          <label class="checks"><span><input type="checkbox" v-model="selRoute.enabled" @change="touch" /> 启用</span></label>
        </div>
        <h4>站点顺序（每行一个站点ID，按乘行顺序）</h4>
        <textarea rows="5" v-model="routeStationsText"></textarea>
        <div class="btns">
          <button @click="saveRouteStations">应用站点顺序</button>
          <button @click="addRouteStation">+ 追加一个未包含站点</button>
        </div>
        <div class="danger-zone"><button class="danger" @click="delRoute">删除此线路</button></div>
      </div>
      <p v-else class="tip">← 从列表选择一条线路进行编辑</p>
    </div>
  </section>
</template>