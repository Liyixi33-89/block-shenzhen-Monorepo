<script setup lang="ts">
// NPC 编辑页签：列表 + 基本信息 + 对话树 + 店铺货架 + 动态随机 NPC 配置（DOM 类名契约：.item-list/.form-pane）
import { ref, computed, inject } from 'vue';
import { ADMIN_CTX } from '../context';
import MapPicker from '../MapPicker.vue';
import type { Npc, DialogueNode } from '@block-sz/schema';

const { doc } = inject(ADMIN_CTX)!;
const scene = doc.scene;
const touch = doc.touch;

const selNpcId = ref('');
const selNpc = computed<Npc | null>(() =>
  scene.value?.npcs.find(n => n.id === selNpcId.value) ?? null);

// 对话树选择
const selNodeId = ref('');
const selNode = computed<DialogueNode | null>(() =>
  selNpc.value?.dialogue.find(n => n.id === selNodeId.value) ?? null);

function addNpc() {
  if (!scene.value) return;
  const id = 'npc_' + Date.now().toString(36);
  scene.value.npcs.push({
    id, name: '新NPC', landmark: scene.value.landmarks[0]?.id,
    latlng: { lat: 22.5431, lng: 114.0579 },
    dialogue: [{ id: 'n1', text: '你好呀。', choices: [] }],
    shopItems: [], shopGreet: '', enabled: true,
  } as Npc);
  selNpcId.value = id;
  selNodeId.value = 'n1';
  touch();
}
function delNpc() {
  if (!scene.value || !selNpc.value) return;
  if (!confirm(`删除NPC「${selNpc.value.name}」？`)) return;
  scene.value.npcs = scene.value.npcs.filter(n => n.id !== selNpcId.value);
  selNpcId.value = '';
  selNodeId.value = '';
  touch();
}

function addNode() {
  if (!selNpc.value) return;
  const id = 'n' + (selNpc.value.dialogue.length + 1);
  selNpc.value.dialogue.push({ id, text: '新对话', choices: [] });
  selNodeId.value = id;
  touch();
}
function delNode() {
  if (!selNpc.value || !selNode.value) return;
  if (!confirm(`删除对话节点「${selNode.value.id}」？`)) return;
  selNpc.value.dialogue = selNpc.value.dialogue.filter(n => n.id !== selNodeId.value);
  selNodeId.value = '';
  touch();
}
function addChoice() {
  if (!selNode.value) return;
  selNode.value.choices.push({ text: '', next: undefined, give: { money: 0 } });
  touch();
}
function ensureGive(c: any) {
  if (!c.give) c.give = { money: 0 };
  return c.give;
}
function delChoice(i: number) {
  if (!selNode.value) return;
  selNode.value.choices.splice(i, 1);
  touch();
}
function addShopItem() {
  if (!selNpc.value) return;
  selNpc.value.shopItems!.push({ id: '', name: '', price: 0 });
  touch();
}
function delShopItem(i: number) {
  if (!selNpc.value) return;
  selNpc.value.shopItems!.splice(i, 1);
  touch();
}

// ---------------------------------------------------------------------------
// 动态随机 NPC 配置（scene.config.env.npc）：数量/姓氏池/职业池/游走范围
// ---------------------------------------------------------------------------
const dynCfg = computed<Record<string, any> | null>(() => {
  if (!scene.value) return null;
  const c: any = scene.value as any;
  if (!c.config) c.config = {};
  if (!c.config.env) c.config.env = {};
  if (!c.config.env.npc) c.config.env.npc = {};
  return c.config.env.npc;
});

/** 游走范围（懒初始化，v-model 需要可赋值目标） */
const dynRange = computed<Record<string, number> | null>(() => {
  const c = dynCfg.value;
  if (!c) return null;
  if (!c.range) c.range = { xMin: -700, xMax: 1600, zMin: -700, zMax: 1100 };
  return c.range;
});

/** 对白池 textarea ↔ 数组互转（每行一条） */
function linesToText(arr?: string[]): string { return (arr ?? []).join('\n'); }
function textToLines(t: string): string[] { return t.split('\n').map(s => s.trim()).filter(Boolean); }
/** 逗号分隔 ↔ 数组互转 */
function csvToArr(t: string): string[] { return t.split(/[,,]/).map(s => s.trim()).filter(Boolean); }

/** 事件委托：姓氏池输入 */
function onSurnamesInput(e: Event) {
  if (!dynCfg.value) return;
  dynCfg.value.surnames = csvToArr((e.target as HTMLInputElement).value);
  touch();
}
/** 事件委托：职业对白池输入（target: lines/rain/night） */
function onJobLinesInput(j: Record<string, any>, key: string, e: Event) {
  j[key] = textToLines((e.target as HTMLTextAreaElement).value);
  touch();
}
/** 事件委托：小摊商品输入 */
function onJobStallInput(j: Record<string, any>, e: Event) {
  j.stall = csvToArr((e.target as HTMLInputElement).value);
  touch();
}

function addJob() {
  if (!dynCfg.value) return;
  if (!Array.isArray(dynCfg.value.jobs)) dynCfg.value.jobs = [];
  dynCfg.value.jobs.push({
    honorific: '师傅', body: 5577802, hat: 4880234, weight: 1,
    lines: ['你好呀。'], rain: [], night: [], tip: 0, stall: [],
  });
  touch();
}
function delJob(i: number) {
  if (!dynCfg.value?.jobs) return;
  dynCfg.value.jobs.splice(i, 1);
  touch();
}
</script>

<template>
  <section class="card">
    <div class="editor-head">
      <h2>NPC（{{ scene?.npcs.length }}）</h2>
      <button class="primary" @click="addNpc">+ 新增NPC</button>
    </div>
    <div class="editor-body">
      <ul class="item-list">
        <li v-for="n in scene?.npcs ?? []" :key="n.id" :class="{ sel: n.id === selNpcId }" @click="selNpcId = n.id">
          <b>{{ n.name }}</b>
          <span class="muted">{{ n.shopItems?.length ? '店铺' : (n.landmark ?? '坐标') }}</span>
          <span v-if="!n.enabled" class="off">停用</span>
        </li>
      </ul>

      <div v-if="selNpc && scene" class="form-pane">
        <div class="form-grid">
          <label>ID <input v-model="selNpc.id" @input="touch" /></label>
          <label>名称 <input v-model="selNpc.name" @input="touch" /></label>
          <label>挂靠地标
            <select v-model="selNpc.landmark" @change="touch">
              <option v-for="l in scene.landmarks" :key="l.id" :value="l.id">{{ l.name }}</option>
              <option value="">（直接用坐标）</option>
            </select>
          </label>
          <label>店铺吆喝语 <input v-model="selNpc.shopGreet" @input="touch" /></label>
          <label class="checks"><span><input type="checkbox" v-model="selNpc.enabled" @change="touch" /> 启用</span></label>
        </div>

        <h4>店铺货架（{{ selNpc.shopItems?.length ?? 0 }}）</h4>
        <div v-for="(s, si) in selNpc.shopItems ?? []" :key="si" class="form-grid">
          <label>商品ID <input v-model="s.id" placeholder="对应 shopItems.id" @input="touch" /></label>
          <label>名称 <input v-model="s.name" @input="touch" /></label>
          <label>售价 ¥ <input type="number" min="0" v-model.number="s.price" @input="touch" /></label>
          <button class="danger" @click="delShopItem(si)">删</button>
        </div>
        <button @click="addShopItem">+ 添加货架商品</button>

        <h4>对话树（{{ selNpc.dialogue.length }} 节点）</h4>
        <div class="editor-body" style="grid-template-columns: 160px 1fr; min-height: 0;">
          <ul class="item-list" style="max-height: 240px;">
            <li v-for="n in selNpc.dialogue" :key="n.id" :class="{ sel: n.id === selNodeId }" @click="selNodeId = n.id">
              <b>{{ n.id }}</b>
              <span class="muted">{{ n.text.slice(0, 12) }}</span>
            </li>
          </ul>
          <div v-if="selNode" class="form-pane">
            <div class="form-grid">
              <label>节点ID <input v-model="selNode.id" @input="touch" /></label>
              <label>下一节点 <input v-model="selNode.next" placeholder="留空结束对话" @input="touch" /></label>
              <label class="wide">文本 <input v-model="selNode.text" @input="touch" /></label>
            </div>
            <h4>选项分支（{{ selNode.choices.length }}）</h4>
            <div v-for="(c, ci) in selNode.choices" :key="ci" class="card" style="padding: 10px; margin-bottom: 8px;">
              <div class="form-grid">
                <label class="wide">选项文字 <input v-model="c.text" @input="touch" /></label>
                <label>跳转节点 <input v-model="c.next" placeholder="留空结束" @input="touch" /></label>
                <label>给钱 ¥ <input type="number" min="0" v-model.number="ensureGive(c).money" @input="touch" /></label>
                <label>给物品 <input v-model="ensureGive(c).item" placeholder="元素/商品ID" @input="touch" /></label>
                <button class="danger" @click="delChoice(ci)">删选项</button>
              </div>
            </div>
            <button @click="addChoice">+ 添加选项</button>
            <div class="btns" style="margin-top: 12px;">
              <button @click="addNode">+ 添加节点</button>
              <button class="danger" @click="delNode">删除节点</button>
            </div>
          </div>
          <p v-else class="tip">从左侧选择对话节点，或「+ 添加节点」</p>
        </div>

        <h4>坐标拾取（未挂地标时生效）</h4>
        <MapPicker v-if="!selNpc.landmark" :scene="scene" v-model="selNpc.latlng" @update:model-value="touch" />

        <div class="danger-zone"><button class="danger" @click="delNpc">删除此NPC</button></div>
      </div>
      <p v-else class="tip">← 从列表选择一个NPC进行编辑</p>
    </div>

    <!-- ============ 动态随机 NPC 配置（scene.config.env.npc） ============ -->
    <div v-if="dynCfg" class="card" style="margin-top: 14px;">
      <h2>动态随机 NPC（引擎生成，不入 npcs 列表）</h2>
      <div class="form-grid">
        <label>数量 <input type="number" min="0" v-model.number="dynCfg.dynamicCount" placeholder="留空 = 默认16" @input="touch" /></label>
        <label class="wide">姓氏池（逗号分隔，留空 = 内置15个广府姓氏）
          <input :value="(dynCfg.surnames ?? []).join(',')" @input="onSurnamesInput" />
        </label>
      </div>
      <div class="form-grid" v-if="dynRange">
        <label>xMin <input type="number" v-model.number="dynRange.xMin" @input="touch" /></label>
        <label>xMax <input type="number" v-model.number="dynRange.xMax" @input="touch" /></label>
        <label>zMin <input type="number" v-model.number="dynRange.zMin" @input="touch" /></label>
        <label>zMax <input type="number" v-model.number="dynRange.zMax" @input="touch" /></label>
      </div>
      <p class="tip">游走范围（世界坐标）留空 = 默认核心城区（x -700~1600, z -700~1100）。</p>

      <h4>职业池（{{ dynCfg.jobs?.length ?? 0 }} 个，留空 = 内置 7 职业）</h4>
      <div v-for="(j, ji) in dynCfg.jobs ?? []" :key="ji" class="card" style="padding: 10px; margin-bottom: 8px;">
        <div class="form-grid">
          <label>称呼 <input v-model="j.honorific" @input="touch" /></label>
          <label>权重 <input type="number" min="1" v-model.number="j.weight" @input="touch" /></label>
          <label>躯干色 <input type="number" v-model.number="j.body" placeholder="0xRRGGBB 十进制" @input="touch" /></label>
          <label>帽子色 <input type="number" v-model.number="j.hat" placeholder="0xRRGGBB 十进制" @input="touch" /></label>
          <label>赠予 ¥ <input type="number" min="0" v-model.number="j.tip" @input="touch" /></label>
        </div>
        <div class="form-grid">
          <label class="wide">对白（每行一条）
            <textarea rows="3" :value="linesToText(j.lines)" @input="onJobLinesInput(j, 'lines', $event)"></textarea>
          </label>
          <label class="wide">雨天对白（每行一条，留空沿用正常对白）
            <textarea rows="2" :value="linesToText(j.rain)" @input="onJobLinesInput(j, 'rain', $event)"></textarea>
          </label>
          <label class="wide">夜晚对白（每行一条，留空沿用正常对白）
            <textarea rows="2" :value="linesToText(j.night)" @input="onJobLinesInput(j, 'night', $event)"></textarea>
          </label>
          <label class="wide">小摊商品ID（逗号分隔，对应 shopItems.id）
            <input :value="(j.stall ?? []).join(',')" @input="onJobStallInput(j, $event)" />
          </label>
        </div>
        <button class="danger" @click="delJob(ji)">删除此职业</button>
      </div>
      <button class="primary" @click="addJob">+ 添加职业</button>
    </div>
  </section>
</template>