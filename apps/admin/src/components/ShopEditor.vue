<script setup lang="ts">
// 商店/投资编辑页签：商品列表 + 投资配置（DOM 类名契约：.item-list/.form-pane）
import { ref, computed, inject } from 'vue';
import { ADMIN_CTX } from '../context';
import type { ShopItem } from '@block-sz/schema';

const { doc } = inject(ADMIN_CTX)!;
const scene = doc.scene;
const touch = doc.touch;

const KINDS = ['consumable', 'deco', 'material', 'camera', 'food', 'souvenir'];
const KIND_LABELS: Record<string, string> = {
  consumable: '消耗品', deco: '装饰', material: '建材', camera: '相机皮肤', food: '美食', souvenir: '纪念品',
};
const EFFECTS = ['', 'speed', 'photo_bonus', 'fare_free'];
const EFFECT_LABELS: Record<string, string> = {
  '': '无', speed: '加速', photo_bonus: '摄影季票', fare_free: '地铁日票',
};

const selItemId = ref('');
const selItem = computed<ShopItem | null>(() =>
  scene.value?.shopItems.find(i => i.id === selItemId.value) ?? null);

function addItem() {
  if (!scene.value) return;
  const id = 'item_' + Date.now().toString(36);
  scene.value.shopItems.push({
    id, name: '新商品', kind: 'consumable', desc: '', price: 0,
    effect: undefined, durationSec: 0, grants: [], skin: undefined,
    foodTag: undefined, icon: undefined, enabled: true,
  } as ShopItem);
  selItemId.value = id;
  touch();
}
function delItem() {
  if (!scene.value || !selItem.value) return;
  if (!confirm(`删除商品「${selItem.value.name}」？`)) return;
  scene.value.shopItems = scene.value.shopItems.filter(i => i.id !== selItemId.value);
  selItemId.value = '';
  touch();
}
function addGrant() {
  if (!selItem.value) return;
  selItem.value.grants.push({ id: '', n: 1 });
  touch();
}
function delGrant(i: number) {
  if (!selItem.value) return;
  selItem.value.grants.splice(i, 1);
  touch();
}
function intToHex(n: number) { return '#' + n.toString(16).padStart(6, '0'); }
</script>

<template>
  <section class="card">
    <div class="editor-head">
      <h2>商店商品（{{ scene?.shopItems.length }}）</h2>
      <button class="primary" @click="addItem">+ 新增商品</button>
    </div>
    <div class="editor-body">
      <ul class="item-list">
        <li v-for="i in scene?.shopItems ?? []" :key="i.id" :class="{ sel: i.id === selItemId }" @click="selItemId = i.id">
          <b>{{ i.name }}</b>
          <span class="muted">¥{{ i.price }} · {{ KIND_LABELS[i.kind] }}</span>
          <span v-if="!i.enabled" class="off">停用</span>
        </li>
      </ul>
      <div v-if="selItem && scene" class="form-pane">
        <div class="form-grid">
          <label>ID <input v-model="selItem.id" @input="touch" /></label>
          <label>名称 <input v-model="selItem.name" @input="touch" /></label>
          <label>类别
            <select v-model="selItem.kind" @change="touch">
              <option v-for="k in KINDS" :key="k" :value="k">{{ KIND_LABELS[k] }}</option>
            </select>
          </label>
          <label>售价 ¥ <input type="number" min="0" v-model.number="selItem.price" @input="touch" /></label>
          <label>图标名 <input v-model="selItem.icon" placeholder="如 money" @input="touch" /></label>
          <label class="wide">描述 <input v-model="selItem.desc" @input="touch" /></label>
          <label v-if="selItem.kind === 'consumable'">效果
            <select v-model="selItem.effect" @change="touch">
              <option v-for="e in EFFECTS" :key="e" :value="e">{{ EFFECT_LABELS[e] }}</option>
            </select>
          </label>
          <label v-if="selItem.kind === 'consumable'">持续秒数 <input type="number" min="0" v-model.number="selItem.durationSec" @input="touch" /></label>
          <label v-if="selItem.kind === 'camera'">皮肤名 <input v-model="selItem.skin" @input="touch" /></label>
          <label v-if="selItem.kind === 'food'">美食类别 <input v-model="selItem.foodTag" placeholder="如 dimsum" @input="touch" /></label>
          <label class="checks"><span><input type="checkbox" v-model="selItem.enabled" @change="touch" /> 启用</span></label>
        </div>

        <template v-if="selItem.kind === 'material'">
          <h4>材料礼包（grants）</h4>
          <div v-for="(g, gi) in selItem.grants" :key="gi" class="form-grid">
            <label>元素 ID <input v-model="g.id" @input="touch" /></label>
            <label>数量 <input type="number" min="1" v-model.number="g.n" @input="touch" /></label>
            <button class="danger" @click="delGrant(gi)">删</button>
          </div>
          <button @click="addGrant">+ 添加材料</button>
        </template>

        <div class="danger-zone"><button class="danger" @click="delItem">删除此商品</button></div>
      </div>
    </div>
  </section>

  <section class="card">
    <div class="editor-head"><h2>地标投资配置</h2></div>
    <p class="tip">到访过的地标可投资升级，获得被动收入（每级每小时）。</p>
    <div v-if="scene?.invest" class="form-grid">
      <label>每级投资额 ¥ <input type="number" min="1" v-model.number="scene.invest.baseCost" @input="touch" /></label>
      <label>每级每小时收益 ¥ <input type="number" min="1" v-model.number="scene.invest.incomePerHour" @input="touch" /></label>
      <label>最大等级 <input type="number" min="1" v-model.number="scene.invest.maxLevel" @input="touch" /></label>
    </div>
    <p v-else class="tip">未配置投资（scene.invest 为空）。可在 JSON 页签添加。</p>
  </section>
</template>