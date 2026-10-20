<script setup lang="ts">
// 应用壳：登录态 + 页签路由 + 场景文档 provide
// 各页签内容拆至 components/（LandmarkEditor 等），本文件只做编排。
import { ref, watch, provide } from 'vue';
import { ADMIN_CTX } from './context';
import { useSceneDoc } from './composables/useSceneDoc';
import { adminFetch } from './services/api';
import LandmarkEditor from './components/LandmarkEditor.vue';
import SpawnEditor from './components/SpawnEditor.vue';
import TeleportEditor from './components/TeleportEditor.vue';
import QuestEditor from './components/QuestEditor.vue';
import DistrictEditor from './components/DistrictEditor.vue';
import ShopEditor from './components/ShopEditor.vue';
import NpcEditor from './components/NpcEditor.vue';
import BuildEditor from './components/BuildEditor.vue';
import TrafficEditor from './components/TrafficEditor.vue';
import AscensionEditor from './components/AscensionEditor.vue';
import AnalyticsPanel from './components/AnalyticsPanel.vue';
import UsersPanel from './components/UsersPanel.vue';
import VersionPanel from './components/VersionPanel.vue';
import JsonEditor from './components/JsonEditor.vue';
import type { Scene, Landmark, SpawnPoint, TeleportPoint, Quest, District } from '@block-sz/schema';

type Tab = 'login' | 'scene' | 'landmarks' | 'spawns' | 'teleports' | 'quests' | 'districts' | 'shop' | 'npcs' | 'build' | 'traffic' | 'ascension' | 'users' | 'analytics' | 'versions' | 'json';
const tab = ref<Tab>('login');

// ---- 登录 ----
const username = ref('admin');
const password = ref('');
const token = ref(localStorage.getItem('bsz_admin_token') || '');

// ---- 场景文档（provide 给页签组件）----
const doc = useSceneDoc();
provide(ADMIN_CTX, { doc, token });

async function login() {
  const { ok, data } = await adminFetch('/api/auth/login', {
    method: 'POST',
    body: { username: username.value, password: password.value },
    token: '',
  });
  if (!ok) return alert((data as any).error || '登录失败');
  token.value = (data as any).token;
  localStorage.setItem('bsz_admin_token', token.value);
  tab.value = 'scene';
  await doc.loadScene(token.value);
}

// 启动恢复：localStorage 有 token 时静默加载场景（刷新不再停在登录页）
if (token.value) {
  tab.value = 'scene';
  void doc.loadScene(token.value);
}

// JSON 页签切入时同步场景文本
const jsonEditor = ref<InstanceType<typeof JsonEditor> | null>(null);
watch(tab, t => {
  if (t === 'json') jsonEditor.value?.refresh();
});

// 切页签保护未保存修改
function switchTab(t: Tab) {
  if (doc.dirty.value && !confirm('有未保存的修改，切换页签不会丢失（同一份数据），但仍建议先保存草稿。继续？')) return;
  tab.value = t;
}

const TAB_LABELS: Record<string, string> = {
  scene: '场景', landmarks: `地标 ${doc.scene.value?.landmarks.length ?? ''}`, spawns: '出生点',
  teleports: '传送点', quests: '任务', districts: '区划', shop: '商店', npcs: 'NPC',
  build: '建造', traffic: '交通', ascension: '飞升', users: '用户', analytics: '分析', versions: '版本', json: 'JSON',
};
</script>

<template>
  <div class="shell">
    <header>
      <h1>方块鹏城 · 内容管理</h1>
      <nav>
        <button v-for="t in (['scene','landmarks','spawns','teleports','quests','districts','shop','npcs','build','traffic','ascension','users','analytics','versions','json'] as Tab[])"
                :key="t" :class="{ active: tab === t }" @click="switchTab(t)">
          {{ TAB_LABELS[t] }}
        </button>
      </nav>
      <span v-if="doc.dirty.value" class="dirty-flag">● 未保存</span>
    </header>

    <!-- ============ 登录 ============ -->
    <section v-if="tab === 'login'" class="card">
      <h2>管理员登录</h2>
      <p class="tip">首个注册用户自动成为 admin：先在「注册」接口创建账号（curl /api/auth/register）。</p>
      <label>用户名 <input v-model="username" /></label>
      <label>密码 <input v-model="password" type="password" @keyup.enter="login" /></label>
      <button class="primary" @click="login">登录</button>
    </section>

    <template v-if="tab !== 'login'">
      <!-- 公共操作条 -->
      <div class="action-bar card">
        <b>场景 shenzhen-main</b>
        <span v-if="doc.sceneVersion.value" class="ver">线上 v{{ doc.sceneVersion.value }}</span>
        <span v-if="doc.scene.value">草稿 v{{ doc.scene.value.version }}</span>
        <span class="spacer"></span>
        <button class="primary" @click="doc.saveDraft(token)">保存草稿</button>
        <button @click="doc.publish(token)">发布新版本</button>
        <button @click="doc.loadScene(token)">放弃修改（重载）</button>
      </div>
      <p v-if="doc.draftSaved.value" class="ok">{{ doc.draftSaved.value }}</p>
      <p v-if="doc.publishMsg.value" :class="doc.publishMsg.value.includes('失败') ? 'bad' : 'ok'">{{ doc.publishMsg.value }}</p>
      <ul v-if="doc.issues.value.length" class="issues">
        <li v-for="i in doc.issues.value" :key="i">{{ i }}</li>
      </ul>

      <!-- ============ 场景信息（表单小，保留在壳内） ============ -->
      <section v-if="tab === 'scene' && doc.scene.value" class="card">
        <h2>场景信息</h2>
        <div class="form-grid">
          <label>名称 <input v-model="doc.scene.value.name" @input="doc.touch" /></label>
          <label>版本 <input v-model="doc.scene.value.version" @input="doc.touch" /></label>
          <label class="wide">描述 <input v-model="doc.scene.value.desc" @input="doc.touch" /></label>
        </div>
        <h3>投影参数</h3>
        <div class="form-grid">
          <label>原点纬度 <input type="number" step="0.0001" v-model.number="doc.scene.value.projection.origin.lat" @input="doc.touch" /></label>
          <label>原点经度 <input type="number" step="0.0001" v-model.number="doc.scene.value.projection.origin.lng" @input="doc.touch" /></label>
          <label>单位/公里 <input type="number" v-model.number="doc.scene.value.projection.unitPerKm" @input="doc.touch" /></label>
          <label>远距压缩 <input type="number" step="0.05" v-model.number="doc.scene.value.projection.farCompress" @input="doc.touch" /></label>
        </div>
        <p class="tip">元素 {{ doc.scene.value.elements.length }} 个 · 建造配方 {{ doc.scene.value.buildRecipes.length }} 条 · NPC {{ doc.scene.value.npcs.length }} 个
          <span v-if="doc.scene.value.traffic">· 交通 {{ doc.scene.value.traffic.routes.length }} 线 {{ doc.scene.value.traffic.stations.length }} 站</span>
          · 商店 {{ doc.scene.value.shopItems.length }} 件
          <span v-if="doc.scene.value.ascension">· 飞升 {{ doc.scene.value.ascension.stages.length }} 阶</span>
          （元素/NPC/交通/商店/飞升均可用对应页签可视化编辑）</p>
      </section>

      <!-- ============ 页签组件 ============ -->
      <LandmarkEditor v-if="tab === 'landmarks'" />
      <SpawnEditor v-if="tab === 'spawns'" />
      <TeleportEditor v-if="tab === 'teleports'" />
      <QuestEditor v-if="tab === 'quests'" />
      <DistrictEditor v-if="tab === 'districts'" />
      <ShopEditor v-if="tab === 'shop'" />
      <NpcEditor v-if="tab === 'npcs'" />
      <BuildEditor v-if="tab === 'build'" />
      <TrafficEditor v-if="tab === 'traffic'" />
      <AscensionEditor v-if="tab === 'ascension'" />
      <UsersPanel v-if="tab === 'users'" />
      <AnalyticsPanel v-if="tab === 'analytics'" />
      <VersionPanel v-if="tab === 'versions'" />
      <JsonEditor v-if="tab === 'json'" ref="jsonEditor" />
    </template>
  </div>
</template>

<style src="./style.css"></style>
