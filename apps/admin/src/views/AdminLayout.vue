<script setup lang="ts">
// 后台布局：导航 + 公共操作条 + 路由出口；场景文档 provide
import { ref, watch, provide } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ADMIN_CTX } from '../context';
import { useSceneDoc } from '../composables/useSceneDoc';
import { useAuth } from '../stores/auth';
import JsonEditor from '../components/JsonEditor.vue';
import type { RouteMeta } from '../router';

const route = useRoute();
const router = useRouter();
const { user, logout } = useAuth();

// ---- 场景文档（provide 给各路由组件）----
const doc = useSceneDoc();
provide(ADMIN_CTX, { doc });

// 守卫已恢复会话，布局挂载即加载场景
void doc.loadScene();

// JSON 路由切入时同步场景文本
const jsonEditor = ref<InstanceType<typeof JsonEditor> | null>(null);
watch(() => route.name, n => {
  if (n === 'json') jsonEditor.value?.refresh();
});

// 切路由保护未保存修改
function go(name: string) {
  if (doc.dirty.value && route.name !== name
    && !confirm('有未保存的修改，切换页面不会丢失（同一份数据），但仍建议先保存草稿。继续？')) return;
  router.push({ name });
}

function doLogout() {
  if (doc.dirty.value && !confirm('有未保存的修改，登出将丢失。继续？')) return;
  logout();
  router.replace('/login');
}

const NAV_ITEMS: { name: string; label: string }[] = [
  { name: 'scene', label: '场景' },
  { name: 'landmarks', label: `地标` },
  { name: 'spawns', label: '出生点' },
  { name: 'teleports', label: '传送点' },
  { name: 'quests', label: '任务' },
  { name: 'districts', label: '区划' },
  { name: 'shop', label: '商店' },
  { name: 'npcs', label: 'NPC' },
  { name: 'build', label: '建造' },
  { name: 'traffic', label: '交通' },
  { name: 'ascension', label: '飞升' },
  { name: 'users', label: '用户' },
  { name: 'analytics', label: '分析' },
  { name: 'versions', label: '版本' },
  { name: 'json', label: 'JSON' },
];
</script>

<template>
  <div class="shell">
    <header>
      <h1>方块鹏城 · 内容管理</h1>
      <nav>
        <button v-for="item in NAV_ITEMS" :key="item.name"
                :class="{ active: route.name === item.name }" @click="go(item.name)">
          {{ item.label }}<template v-if="item.name === 'landmarks' && doc.scene.value"> {{ doc.scene.value.landmarks.length }}</template>
        </button>
      </nav>
      <span v-if="doc.dirty.value" class="dirty-flag">● 未保存</span>
      <span class="user-box" v-if="user">{{ user.username }}（{{ user.role }}）</span>
      <button @click="doLogout">退出</button>
    </header>

    <!-- 公共操作条 -->
    <div class="action-bar card">
      <b>场景 shenzhen-main</b>
      <span v-if="doc.sceneVersion.value" class="ver">线上 v{{ doc.sceneVersion.value }}</span>
      <span v-if="doc.scene.value">草稿 v{{ doc.scene.value.version }}</span>
      <span class="spacer"></span>
      <button class="primary" @click="doc.saveDraft()">保存草稿</button>
      <button @click="doc.publish()">发布新版本</button>
      <button @click="doc.loadScene()">放弃修改（重载）</button>
    </div>
    <p v-if="doc.draftSaved.value" class="ok">{{ doc.draftSaved.value }}</p>
    <p v-if="doc.publishMsg.value" :class="doc.publishMsg.value.includes('失败') ? 'bad' : 'ok'">{{ doc.publishMsg.value }}</p>
    <ul v-if="doc.issues.value.length" class="issues">
      <li v-for="i in doc.issues.value" :key="i">{{ i }}</li>
    </ul>

    <!-- 路由出口：登录态下方才渲染 -->
    <router-view />
  </div>
</template>
