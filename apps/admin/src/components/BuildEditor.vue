<script setup lang="ts">
// 建造编辑页签：元素列表 + 建造配方（DOM 类名契约：.item-list/.form-pane）
// 几何 params 结构因 kind 而异，用 JSON 文本编辑兜底，配方用完整表单。
import { ref, computed, inject } from 'vue';
import { ADMIN_CTX } from '../context';
import type { Element, BuildRecipe } from '@block-sz/schema';

const { doc } = inject(ADMIN_CTX)!;
const scene = doc.scene;
const touch = doc.touch;

const CATS = ['building', 'nature', 'transport', 'decoration'];
const CAT_LABELS: Record<string, string> = { building: '建筑', nature: '自然', transport: '交通', decoration: '装饰' };

// ---------------- 元素 ----------------
const selElemId = ref('');
const selElem = computed<Element | null>(() =>
  scene.value?.elements.find(e => e.id === selElemId.value) ?? null);
const elemGeomJson = ref('');

function selectElem(id: string) {
  selElemId.value = id;
  elemGeomJson.value = JSON.stringify(selElem.value?.geometry ?? [], null, 2);
  touch();
}
function addElem() {
  if (!scene.value) return;
  const id = 'el_' + Date.now().toString(36);
  scene.value.elements.push({ id, name: '新元素', geometry: [], category: 'building', tags: [] });
  selectElem(id);
}
function delElem() {
  if (!scene.value || !selElem.value) return;
  if (!confirm(`删除元素「${selElem.value.name}」？`)) return;
  scene.value.elements = scene.value.elements.filter(e => e.id !== selElemId.value);
  selElemId.value = '';
  touch();
}
function saveElemGeom() {
  if (!selElem.value) return;
  try {
    selElem.value.geometry = JSON.parse(elemGeomJson.value);
    touch();
  } catch { alert('几何 JSON 格式错误'); }
}

// ---------------- 配方 ----------------
const selRecipeId = ref('');
const selRecipe = computed<BuildRecipe | null>(() =>
  scene.value?.buildRecipes.find(r => r.id === selRecipeId.value) ?? null);
function addRecipe() {
  if (!scene.value) return;
  const id = 'rec_' + Date.now().toString(36);
  scene.value.buildRecipes.push({
    id, name: '新配方', element: scene.value.elements[0]?.id ?? '',
    cost: { money: 0, items: [] }, requires: [], enabled: true,
  });
  selRecipeId.value = id;
  touch();
}
function delRecipe() {
  if (!scene.value || !selRecipe.value) return;
  if (!confirm(`删除配方「${selRecipe.value.name}」？`)) return;
  scene.value.buildRecipes = scene.value.buildRecipes.filter(r => r.id !== selRecipeId.value);
  selRecipeId.value = '';
  touch();
}
function addCostItem() {
  if (!selRecipe.value) return;
  selRecipe.value.cost.items.push({ id: '', n: 1 });
  touch();
}
function delCostItem(i: number) {
  if (!selRecipe.value) return;
  selRecipe.value.cost.items.splice(i, 1);
  touch();
}
function addRequire() {
  if (!selRecipe.value) return;
  selRecipe.value.requires.push('');
  touch();
}
function delRequire(i: number) {
  if (!selRecipe.value) return;
  selRecipe.value.requires.splice(i, 1);
  touch();
}
</script>

<template>
  <section class="card">
    <div class="editor-head">
      <h2>建造元素（{{ scene?.elements.length }}）</h2>
      <button class="primary" @click="addElem">+ 新增元素</button>
    </div>
    <div class="editor-body">
      <ul class="item-list">
        <li v-for="e in scene?.elements ?? []" :key="e.id" :class="{ sel: e.id === selElemId }" @click="selectElem(e.id)">
          <b>{{ e.name }}</b>
          <span class="muted">{{ CAT_LABELS[e.category] }}</span>
        </li>
      </ul>
      <div v-if="selElem && scene" class="form-pane">
        <div class="form-grid">
          <label>ID <input v-model="selElem.id" @input="touch" /></label>
          <label>名称 <input v-model="selElem.name" @input="touch" /></label>
          <label>内置建模器 <input v-model="selElem.builder" placeholder="留空用 geometry" @input="touch" /></label>
          <label>分类
            <select v-model="selElem.category" @change="touch">
              <option v-for="c in CATS" :key="c" :value="c">{{ CAT_LABELS[c] }}</option>
            </select>
          </label>
          <label class="wide">标签（逗号分隔） <input :value="selElem.tags.join(',')" @input="(selElem.tags = ($event.target as any).value.split(',').map((s: string) => s.trim()).filter(Boolean)), touch()" /></label>
        </div>
        <h4>几何（JSON，box/boxC/prism/beam/hipRoof/sign）</h4>
        <textarea rows="8" v-model="elemGeomJson"></textarea>
        <button @click="saveElemGeom">应用几何</button>
        <div class="danger-zone"><button class="danger" @click="delElem">删除此元素</button></div>
      </div>
    </div>
  </section>

  <section class="card">
    <div class="editor-head">
      <h2>建造配方（{{ scene?.buildRecipes.length }}）</h2>
      <button class="primary" @click="addRecipe">+ 新增配方</button>
    </div>
    <div class="editor-body">
      <ul class="item-list">
        <li v-for="r in scene?.buildRecipes ?? []" :key="r.id" :class="{ sel: r.id === selRecipeId }" @click="selRecipeId = r.id">
          <b>{{ r.name }}</b>
          <span class="muted">¥{{ r.cost.money }}</span>
          <span v-if="!r.enabled" class="off">停用</span>
        </li>
      </ul>
      <div v-if="selRecipe && scene" class="form-pane">
        <div class="form-grid">
          <label>ID <input v-model="selRecipe.id" @input="touch" /></label>
          <label>名称 <input v-model="selRecipe.name" @input="touch" /></label>
          <label>产出元素
            <select v-model="selRecipe.element" @change="touch">
              <option v-for="e in scene.elements" :key="e.id" :value="e.id">{{ e.name }}</option>
            </select>
          </label>
          <label>费用 ¥ <input type="number" min="0" v-model.number="selRecipe.cost.money" @input="touch" /></label>
          <label class="checks"><span><input type="checkbox" v-model="selRecipe.enabled" @change="touch" /> 启用</span></label>
        </div>
        <h4>材料消耗（cost.items）</h4>
        <div v-for="(ci, i) in selRecipe.cost.items" :key="i" class="form-grid">
          <label>材料ID <input v-model="ci.id" @input="touch" /></label>
          <label>数量 <input type="number" min="1" v-model.number="ci.n" @input="touch" /></label>
          <button class="danger" @click="delCostItem(i)">删</button>
        </div>
        <button @click="addCostItem">+ 添加材料</button>
        <h4>解锁前置（requires，任务ID）</h4>
        <div v-for="(rq, i) in selRecipe.requires" :key="i" class="form-grid">
          <label>前置任务 <input v-model="selRecipe.requires[i]" @input="touch" /></label>
          <button class="danger" @click="delRequire(i)">删</button>
        </div>
        <button @click="addRequire">+ 添加前置</button>
        <div class="danger-zone"><button class="danger" @click="delRecipe">删除此配方</button></div>
      </div>
    </div>
  </section>
</template>